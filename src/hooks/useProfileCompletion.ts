import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

interface ProfileStatus {
  isComplete: boolean;
  isLoading: boolean;
  checkProfile: () => Promise<void>;
}

export function useProfileCompletion(): ProfileStatus {
  const { user } = useAuth();
  const [isComplete, setIsComplete] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const checkProfile = async () => {
    if (!user) {
      setIsComplete(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, organisation, country_code, phone_number, address, postcode, city, country')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error checking profile completion:', error);
        setIsComplete(true); // Default to complete if error to avoid blocking
        return;
      }

      // Check if all required fields are filled
      const requiredFields = [
        data.first_name,
        data.last_name,
        data.organisation,
        data.country_code,
        data.phone_number,
        data.address,
        data.postcode,
        data.city,
        data.country,
      ];

      const allFieldsFilled = requiredFields.every(
        (field) => field !== null && field !== undefined && String(field).trim() !== ''
      );

      setIsComplete(allFieldsFilled);
    } catch (error) {
      console.error('Error checking profile completion:', error);
      setIsComplete(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    checkProfile();
  }, [user?.id]);

  return { isComplete, isLoading, checkProfile };
}
