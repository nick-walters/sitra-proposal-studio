import { useState, useEffect, useCallback } from "react";
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

  const checkProfile = useCallback(async () => {
    if (!user) {
      setIsComplete(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [baseRes, privateRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('first_name, last_name, organisation, country')
          .eq('id', user.id)
          .single(),
        supabase.rpc('get_my_private_profile'),
      ]);

      if (baseRes.error) {
        console.error('Error checking profile completion:', baseRes.error);
        setIsComplete(true);
        return;
      }

      const priv = Array.isArray(privateRes.data) ? privateRes.data[0] : (privateRes.data as any);

      const requiredFields = [
        baseRes.data.first_name,
        baseRes.data.last_name,
        baseRes.data.organisation,
        priv?.country_code,
        priv?.phone_number,
        priv?.address,
        priv?.postcode,
        priv?.city,
        baseRes.data.country,
      ];

      const allFieldsFilled = requiredFields.every(
        (field) => field !== null && field !== undefined && String(field).trim() !== ''
      );

      const hasGdprConsent = !!priv?.gdpr_consented_at;

      setIsComplete(allFieldsFilled && hasGdprConsent);
    } catch (error) {
      console.error('Error checking profile completion:', error);
      setIsComplete(true);
    } finally {
      setIsLoading(false);
    }

  }, [user]);

  useEffect(() => {
    checkProfile();
  }, [checkProfile]);

  return { isComplete, isLoading, checkProfile };
}
