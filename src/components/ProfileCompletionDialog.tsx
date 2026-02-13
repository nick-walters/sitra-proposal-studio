import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, AlertCircle, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProfilePhotoUpload } from "./ProfilePhotoUpload";
import { CountryCodeSelect } from "./CountryCodeSelect";
import { CountrySelect } from "./CountrySelect";
import { OrganisationSelect } from "./OrganisationSelect";

interface ProfileCompletionDialogProps {
  open: boolean;
  userId: string;
  userEmail: string;
  onComplete: () => void;
}

interface ProfileErrors {
  first_name?: string;
  last_name?: string;
  organisation?: string;
  country_code?: string;
  phone_number?: string;
  address?: string;
  postcode?: string;
  city?: string;
  country?: string;
}

export function ProfileCompletionDialog({ 
  open, 
  userId, 
  userEmail, 
  onComplete 
}: ProfileCompletionDialogProps) {
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [gdprConsented, setGdprConsented] = useState(false);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [profile, setProfile] = useState({
    first_name: '',
    last_name: '',
    organisation: '',
    department: '',
    country_code: '',
    phone_number: '',
    address: '',
    address_line_2: '',
    postcode: '',
    city: '',
    country: '',
  });

  useEffect(() => {
    if (open && userId) {
      fetchProfile();
    }
  }, [open, userId]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;

      setAvatarUrl(data.avatar_url);
      setGdprConsented(!!(data as any).gdpr_consented_at);
      setProfile({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        organisation: data.organisation || '',
        department: data.department || '',
        country_code: data.country_code || '',
        phone_number: data.phone_number || '',
        address: data.address || '',
        address_line_2: data.address_line_2 || '',
        postcode: data.postcode || '',
        city: data.city || '',
        country: data.country || '',
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const validateProfile = (): boolean => {
    const newErrors: ProfileErrors = {};

    if (!profile.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }
    if (!profile.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    }
    if (!profile.organisation.trim()) {
      newErrors.organisation = 'Organisation is required';
    }
    if (!profile.country_code) {
      newErrors.country_code = 'Country code is required';
    }
    if (!profile.phone_number.trim()) {
      newErrors.phone_number = 'Phone number is required';
    }
    if (!profile.address.trim()) {
      newErrors.address = 'Address is required';
    }
    if (!profile.postcode.trim()) {
      newErrors.postcode = 'Postcode is required';
    }
    if (!profile.city.trim()) {
      newErrors.city = 'City is required';
    }
    if (!profile.country) {
      newErrors.country = 'Country is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateProfile()) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!gdprConsented) {
      toast.error('Please accept the data sharing policy to continue');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: profile.first_name.trim(),
          last_name: profile.last_name.trim(),
          full_name: `${profile.first_name.trim()} ${profile.last_name.trim()}`,
          organisation: profile.organisation.trim(),
          department: profile.department.trim() || null,
          country_code: profile.country_code,
          phone_number: profile.phone_number.trim(),
          address: profile.address.trim(),
          address_line_2: profile.address_line_2.trim() || null,
          postcode: profile.postcode.trim(),
          city: profile.city.trim(),
          country: profile.country,
          ...(gdprConsented ? { gdpr_consented_at: new Date().toISOString() } : {}),
        } as any)
        .eq('id', userId);

      if (error) throw error;

      toast.success('Profile completed successfully');
      onComplete();
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const RequiredLabel = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
    <Label htmlFor={htmlFor} className="text-sm">
      {children} <span className="text-destructive">*</span>
    </Label>
  );

  const ErrorMessage = ({ message }: { message?: string }) => {
    if (!message) return null;
    return (
      <p className="text-xs text-destructive flex items-center gap-1 mt-1">
        <AlertCircle className="w-3 h-3" />
        {message}
      </p>
    );
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            Complete Your Profile
          </DialogTitle>
          <DialogDescription>
            Please complete your profile information to continue. All fields marked with <span className="text-destructive">*</span> are required.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 mt-4">
            {/* Profile Photo */}
            <div className="space-y-2">
              <Label>Profile Photo</Label>
              <ProfilePhotoUpload
                userId={userId}
                currentAvatarUrl={avatarUrl}
                firstName={profile.first_name}
                lastName={profile.last_name}
                email={userEmail}
                onAvatarChange={setAvatarUrl}
              />
            </div>

            {/* Email (read-only) */}
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={userEmail}
                disabled
                className="bg-muted"
              />
            </div>

            {/* Names */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="first_name">First Name</RequiredLabel>
                <Input
                  id="first_name"
                  value={profile.first_name}
                  onChange={(e) => {
                    setProfile({ ...profile, first_name: e.target.value });
                    if (errors.first_name) setErrors({ ...errors, first_name: undefined });
                  }}
                  placeholder="Enter first name"
                  className={errors.first_name ? 'border-destructive' : ''}
                />
                <ErrorMessage message={errors.first_name} />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="last_name">Last Name</RequiredLabel>
                <Input
                  id="last_name"
                  value={profile.last_name}
                  onChange={(e) => {
                    setProfile({ ...profile, last_name: e.target.value });
                    if (errors.last_name) setErrors({ ...errors, last_name: undefined });
                  }}
                  placeholder="Enter last name"
                  className={errors.last_name ? 'border-destructive' : ''}
                />
                <ErrorMessage message={errors.last_name} />
              </div>
            </div>

            {/* Organisation & Department */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="organisation">Organisation</RequiredLabel>
                <OrganisationSelect
                  value={profile.organisation}
                  onValueChange={(v) => {
                    setProfile({ ...profile, organisation: v });
                    if (errors.organisation) setErrors({ ...errors, organisation: undefined });
                  }}
                  hasError={!!errors.organisation}
                />
                <ErrorMessage message={errors.organisation} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  value={profile.department}
                  onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                  placeholder="Enter department (optional)"
                />
              </div>
            </div>

            {/* Phone with country code */}
            <div className="space-y-2">
              <RequiredLabel htmlFor="phone_number">Phone Number</RequiredLabel>
              <div className="flex gap-2">
                <CountryCodeSelect
                  value={profile.country_code}
                  onValueChange={(v) => {
                    setProfile({ ...profile, country_code: v });
                    if (errors.country_code) setErrors({ ...errors, country_code: undefined });
                  }}
                  hasError={!!errors.country_code}
                />
                <Input
                  id="phone_number"
                  value={profile.phone_number}
                  onChange={(e) => {
                    setProfile({ ...profile, phone_number: e.target.value });
                    if (errors.phone_number) setErrors({ ...errors, phone_number: undefined });
                  }}
                  placeholder="Enter phone number"
                  className={`flex-1 ${errors.phone_number ? 'border-destructive' : ''}`}
                />
              </div>
              {(errors.country_code || errors.phone_number) && (
                <ErrorMessage message={errors.country_code || errors.phone_number} />
              )}
            </div>

            {/* Address lines */}
            <div className="space-y-2">
              <RequiredLabel htmlFor="address">Address Line 1</RequiredLabel>
              <Input
                id="address"
                value={profile.address}
                onChange={(e) => {
                  setProfile({ ...profile, address: e.target.value });
                  if (errors.address) setErrors({ ...errors, address: undefined });
                }}
                placeholder="Street address"
                className={errors.address ? 'border-destructive' : ''}
              />
              <ErrorMessage message={errors.address} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address_line_2">Address Line 2</Label>
              <Input
                id="address_line_2"
                value={profile.address_line_2}
                onChange={(e) => setProfile({ ...profile, address_line_2: e.target.value })}
                placeholder="Apartment, suite, unit, etc. (optional)"
              />
            </div>

            {/* City, Postcode, Country */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="city">City</RequiredLabel>
                <Input
                  id="city"
                  value={profile.city}
                  onChange={(e) => {
                    setProfile({ ...profile, city: e.target.value });
                    if (errors.city) setErrors({ ...errors, city: undefined });
                  }}
                  placeholder="City"
                  className={errors.city ? 'border-destructive' : ''}
                />
                <ErrorMessage message={errors.city} />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="postcode">Postcode</RequiredLabel>
                <Input
                  id="postcode"
                  value={profile.postcode}
                  onChange={(e) => {
                    setProfile({ ...profile, postcode: e.target.value });
                    if (errors.postcode) setErrors({ ...errors, postcode: undefined });
                  }}
                  placeholder="Postcode"
                  className={errors.postcode ? 'border-destructive' : ''}
                />
                <ErrorMessage message={errors.postcode} />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="country">Country</RequiredLabel>
                <CountrySelect
                  value={profile.country}
                  onValueChange={(v) => {
                    setProfile({ ...profile, country: v });
                    if (errors.country) setErrors({ ...errors, country: undefined });
                  }}
                  hasError={!!errors.country}
                  placeholder="Select"
                />
                <ErrorMessage message={errors.country} />
              </div>
            </div>

            {/* GDPR Consent */}
            <div className="border rounded-lg p-4 bg-muted/30 space-y-3 mt-2">
              <h4 className="text-sm font-semibold">Data Sharing Policy</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                By using this platform, your personal information (name, email, phone number, address, and organisation) 
                will be visible to other users involved in proposals you participate in. This is necessary for the 
                collaborative preparation of funding proposals.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                You also agree to treat other participants' personal information as confidential and to process it 
                in accordance with the{' '}
                <a href="https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng" target="_blank" rel="noopener noreferrer" className="text-primary underline hover:text-primary/80">
                  General Data Protection Regulation (GDPR)
                </a>. You will not use others' personal data for purposes unrelated to proposal preparation.
              </p>
              <div className="flex items-start gap-2 pt-1">
                <Checkbox
                  id="gdpr-consent"
                  checked={gdprConsented}
                  onCheckedChange={(checked) => setGdprConsented(checked === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="gdpr-consent" className="text-sm leading-snug cursor-pointer">
                  I understand and accept the data sharing policy <span className="text-destructive">*</span>
                </Label>
              </div>
            </div>

            <Button 
              onClick={handleSave} 
              disabled={saving || !gdprConsented}
              className="w-full mt-2"
              size="lg"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save and Continue
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
