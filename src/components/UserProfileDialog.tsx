import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, AlertCircle, CheckCircle2, Globe, Linkedin, Plus, X } from "lucide-react";
import { ProfilePhotoUpload } from "./ProfilePhotoUpload";
import { CountryCodeSelect } from "./CountryCodeSelect";
import { CountrySelect } from "./CountrySelect";
import { OrganisationSelect } from "./OrganisationSelect";

interface OtherLink {
  label: string;
  url: string;
}
interface UserProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  organisation: string | null;
  department: string | null;
  country_code: string | null;
  phone_number: string | null;
  address: string | null;
  address_line_2: string | null;
  postcode: string | null;
  city: string | null;
  country: string | null;
  avatar_url: string | null;
}

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  editable?: boolean;
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

export function UserProfileDialog({ open, onOpenChange, userId, editable = false }: UserProfileDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    organisation: '',
    department: '',
    country_code: '',
    phone_number: '',
    address: '',
    address_line_2: '',
    postcode: '',
    city: '',
    country: '',
    website: '',
    linkedin: '',
    bluesky: '',
    instagram: '',
    facebook: '',
    other_links: [] as OtherLink[],
  });

  useEffect(() => {
    if (open && userId) {
      fetchProfile();
      setSaved(false);
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

      setProfile(data);
      setAvatarUrl(data.avatar_url);
      setFormData({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        email: data.email || '',
        organisation: data.organisation || '',
        department: data.department || '',
        country_code: data.country_code || '',
        phone_number: data.phone_number || '',
        address: data.address || '',
        address_line_2: data.address_line_2 || '',
        postcode: data.postcode || '',
        city: data.city || '',
        country: data.country || '',
        website: data.website || '',
        linkedin: data.linkedin || '',
        bluesky: data.bluesky || '',
        instagram: data.instagram || '',
        facebook: data.facebook || '',
        other_links: Array.isArray(data.other_links) ? (data.other_links as unknown as OtherLink[]) : [],
      });
      setErrors({});
    } catch (error) {
      console.error('Error fetching profile:', error);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const validateProfile = (): boolean => {
    const newErrors: ProfileErrors = {};

    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }
    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    }
    if (!formData.organisation.trim()) {
      newErrors.organisation = 'Organisation is required';
    }
    if (!formData.country_code) {
      newErrors.country_code = 'Country code is required';
    }
    if (!formData.phone_number.trim()) {
      newErrors.phone_number = 'Phone number is required';
    }
    if (!formData.address.trim()) {
      newErrors.address = 'Address is required';
    }
    if (!formData.postcode.trim()) {
      newErrors.postcode = 'Postcode is required';
    }
    if (!formData.city.trim()) {
      newErrors.city = 'City is required';
    }
    if (!formData.country) {
      newErrors.country = 'Country is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!editable) return;
    
    if (!validateProfile()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    try {
      const fullName = [formData.first_name.trim(), formData.last_name.trim()].filter(Boolean).join(' ') || null;
      
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          full_name: fullName,
          organisation: formData.organisation.trim(),
          department: formData.department.trim() || null,
          country_code: formData.country_code,
          phone_number: formData.phone_number.trim(),
          address: formData.address.trim(),
          address_line_2: formData.address_line_2.trim() || null,
          postcode: formData.postcode.trim(),
          city: formData.city.trim(),
          country: formData.country,
          website: formData.website.trim() || null,
          linkedin: formData.linkedin.trim() || null,
          bluesky: formData.bluesky.trim() || null,
          instagram: formData.instagram.trim() || null,
          facebook: formData.facebook.trim() || null,
          other_links: JSON.parse(JSON.stringify(formData.other_links.filter(l => l.url.trim()))),
        })
        .eq('id', userId);

      if (error) throw error;

      setSaved(true);
      toast.success('Profile saved successfully');
      
      // Reset saved indicator after 3 seconds
      setTimeout(() => setSaved(false), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = () => {
    if (formData.first_name || formData.last_name) {
      return `${formData.first_name?.[0] || ''}${formData.last_name?.[0] || ''}`.toUpperCase().slice(0, 2);
    }
    if (profile?.full_name) {
      return profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (profile?.email) {
      return profile.email[0].toUpperCase();
    }
    return 'U';
  };

  const getDisplayName = () => {
    if (formData.first_name || formData.last_name) {
      return [formData.first_name, formData.last_name].filter(Boolean).join(' ');
    }
    return profile?.full_name || profile?.email || 'Unknown User';
  };

  const RequiredLabel = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
    <Label htmlFor={htmlFor}>
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

  const addOtherLink = () => {
    setFormData({
      ...formData,
      other_links: [...formData.other_links, { label: '', url: '' }]
    });
  };

  const updateOtherLink = (index: number, field: 'label' | 'url', value: string) => {
    const updated = [...formData.other_links];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, other_links: updated });
  };

  const removeOtherLink = (index: number) => {
    setFormData({
      ...formData,
      other_links: formData.other_links.filter((_, i) => i !== index)
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editable ? 'Edit Profile' : 'User Profile'}</DialogTitle>
          <DialogDescription>
            {editable 
              ? <>Update your personal information. Fields marked with <span className="text-destructive">*</span> are required.</>
              : 'View user details'
            }
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Profile Photo Upload (editable) or Avatar display (view only) */}
            {editable ? (
              <div className="pb-4 border-b">
                <Label className="mb-2 block">Profile Photo</Label>
                <ProfilePhotoUpload
                  userId={userId}
                  currentAvatarUrl={avatarUrl}
                  firstName={formData.first_name}
                  lastName={formData.last_name}
                  email={formData.email}
                  onAvatarChange={setAvatarUrl}
                />
              </div>
            ) : (
              <div className="flex items-center gap-4 pb-4 border-b">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={avatarUrl || undefined} />
                  <AvatarFallback className="text-lg bg-primary/10 text-primary">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-lg">{getDisplayName()}</h3>
                  <p className="text-sm text-muted-foreground">{profile?.email}</p>
                </div>
              </div>
            )}

            {/* Email (read-only) */}
            <div className="space-y-2">
              <RequiredLabel htmlFor="profile_email">Email Address</RequiredLabel>
              <Input
                id="profile_email"
                type="email"
                value={formData.email}
                disabled
                className="bg-muted"
              />
              {editable && (
                <p className="text-xs text-muted-foreground">Contact support to change your email address</p>
              )}
            </div>

            {/* Names */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="profile_first_name">First Name</RequiredLabel>
                <Input
                  id="profile_first_name"
                  value={formData.first_name}
                  onChange={(e) => {
                    setFormData({ ...formData, first_name: e.target.value });
                    if (errors.first_name) setErrors({ ...errors, first_name: undefined });
                  }}
                  disabled={!editable}
                  placeholder="Enter first name"
                  className={errors.first_name ? 'border-destructive' : ''}
                />
                <ErrorMessage message={errors.first_name} />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="profile_last_name">Last Name</RequiredLabel>
                <Input
                  id="profile_last_name"
                  value={formData.last_name}
                  onChange={(e) => {
                    setFormData({ ...formData, last_name: e.target.value });
                    if (errors.last_name) setErrors({ ...errors, last_name: undefined });
                  }}
                  disabled={!editable}
                  placeholder="Enter last name"
                  className={errors.last_name ? 'border-destructive' : ''}
                />
                <ErrorMessage message={errors.last_name} />
              </div>
            </div>

            {/* Organisation & Department */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="profile_organisation">Organisation</RequiredLabel>
                {editable ? (
                  <OrganisationSelect
                    value={formData.organisation}
                    onValueChange={(v) => {
                      setFormData({ ...formData, organisation: v });
                      if (errors.organisation) setErrors({ ...errors, organisation: undefined });
                    }}
                    hasError={!!errors.organisation}
                  />
                ) : (
                  <Input
                    id="profile_organisation"
                    value={formData.organisation}
                    disabled
                    placeholder="Organisation"
                  />
                )}
                <ErrorMessage message={errors.organisation} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile_department">Department</Label>
                <Input
                  id="profile_department"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  disabled={!editable}
                  placeholder="Enter department (optional)"
                />
              </div>
            </div>

            {/* Phone with country code */}
            <div className="space-y-2">
              <RequiredLabel htmlFor="profile_phone_number">Phone Number</RequiredLabel>
              <div className="flex gap-2">
                {editable ? (
                  <CountryCodeSelect
                    value={formData.country_code}
                    onValueChange={(v) => {
                      setFormData({ ...formData, country_code: v });
                      if (errors.country_code) setErrors({ ...errors, country_code: undefined });
                    }}
                    hasError={!!errors.country_code}
                  />
                ) : (
                  <Input
                    value={formData.country_code}
                    disabled
                    className="w-24"
                  />
                )}
                <Input
                  id="profile_phone_number"
                  value={formData.phone_number}
                  onChange={(e) => {
                    setFormData({ ...formData, phone_number: e.target.value });
                    if (errors.phone_number) setErrors({ ...errors, phone_number: undefined });
                  }}
                  disabled={!editable}
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
              <RequiredLabel htmlFor="profile_address">Address Line 1</RequiredLabel>
              <Input
                id="profile_address"
                value={formData.address}
                onChange={(e) => {
                  setFormData({ ...formData, address: e.target.value });
                  if (errors.address) setErrors({ ...errors, address: undefined });
                }}
                disabled={!editable}
                placeholder="Street address"
                className={errors.address ? 'border-destructive' : ''}
              />
              <ErrorMessage message={errors.address} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="profile_address_line_2">Address Line 2</Label>
              <Input
                id="profile_address_line_2"
                value={formData.address_line_2}
                onChange={(e) => setFormData({ ...formData, address_line_2: e.target.value })}
                disabled={!editable}
                placeholder="Apartment, suite, unit, etc. (optional)"
              />
            </div>

            {/* City, Postcode, Country */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <RequiredLabel htmlFor="profile_city">City</RequiredLabel>
                <Input
                  id="profile_city"
                  value={formData.city}
                  onChange={(e) => {
                    setFormData({ ...formData, city: e.target.value });
                    if (errors.city) setErrors({ ...errors, city: undefined });
                  }}
                  disabled={!editable}
                  placeholder="City"
                  className={errors.city ? 'border-destructive' : ''}
                />
                <ErrorMessage message={errors.city} />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="profile_postcode">Postcode</RequiredLabel>
                <Input
                  id="profile_postcode"
                  value={formData.postcode}
                  onChange={(e) => {
                    setFormData({ ...formData, postcode: e.target.value });
                    if (errors.postcode) setErrors({ ...errors, postcode: undefined });
                  }}
                  disabled={!editable}
                  placeholder="Postcode"
                  className={errors.postcode ? 'border-destructive' : ''}
                />
                <ErrorMessage message={errors.postcode} />
              </div>
              <div className="space-y-2">
                <RequiredLabel htmlFor="profile_country">Country</RequiredLabel>
                {editable ? (
                  <CountrySelect
                    value={formData.country}
                    onValueChange={(v) => {
                      setFormData({ ...formData, country: v });
                      if (errors.country) setErrors({ ...errors, country: undefined });
                    }}
                    hasError={!!errors.country}
                    placeholder="Select"
                  />
                ) : (
                  <Input
                    id="profile_country"
                    value={formData.country}
                    disabled
                    placeholder="Country"
                  />
                )}
                <ErrorMessage message={errors.country} />
              </div>
            </div>

            {/* Social Links Section */}
            <div className="space-y-4 pt-4 border-t">
              <Label className="text-base font-medium">Web & Social Links</Label>
              
              {/* Website */}
              <div className="space-y-2">
                <Label htmlFor="profile_website" className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Website
                </Label>
                <Input
                  id="profile_website"
                  value={formData.website}
                  onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  disabled={!editable}
                  placeholder="https://yourwebsite.com"
                />
              </div>

              {/* LinkedIn */}
              <div className="space-y-2">
                <Label htmlFor="profile_linkedin" className="flex items-center gap-2">
                  <Linkedin className="w-4 h-4" />
                  LinkedIn
                </Label>
                <Input
                  id="profile_linkedin"
                  value={formData.linkedin}
                  onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                  disabled={!editable}
                  placeholder="https://linkedin.com/in/username"
                />
              </div>

              {/* Bluesky */}
              <div className="space-y-2">
                <Label htmlFor="profile_bluesky" className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8zm2.5-11.5c-.828 0-1.5.672-1.5 1.5s.672 1.5 1.5 1.5 1.5-.672 1.5-1.5-.672-1.5-1.5-1.5zm-5 0c-.828 0-1.5.672-1.5 1.5s.672 1.5 1.5 1.5 1.5-.672 1.5-1.5-.672-1.5-1.5-1.5zm2.5 7c2.21 0 4-1.343 4-3h-8c0 1.657 1.79 3 4 3z"/>
                  </svg>
                  Bluesky
                </Label>
                <Input
                  id="profile_bluesky"
                  value={formData.bluesky}
                  onChange={(e) => setFormData({ ...formData, bluesky: e.target.value })}
                  disabled={!editable}
                  placeholder="https://bsky.app/profile/handle"
                />
              </div>

              {/* Instagram */}
              <div className="space-y-2">
                <Label htmlFor="profile_instagram" className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                  </svg>
                  Instagram
                </Label>
                <Input
                  id="profile_instagram"
                  value={formData.instagram}
                  onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                  disabled={!editable}
                  placeholder="https://instagram.com/username"
                />
              </div>

              {/* Facebook */}
              <div className="space-y-2">
                <Label htmlFor="profile_facebook" className="flex items-center gap-2">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Facebook
                </Label>
                <Input
                  id="profile_facebook"
                  value={formData.facebook}
                  onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
                  disabled={!editable}
                  placeholder="https://facebook.com/username"
                />
              </div>

              {/* Other Links */}
              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  Other Links
                </Label>
                {formData.other_links.map((link, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <Input
                      value={link.label}
                      onChange={(e) => updateOtherLink(index, 'label', e.target.value)}
                      disabled={!editable}
                      placeholder="Label (e.g. ORCID)"
                      className="w-32"
                    />
                    <Input
                      value={link.url}
                      onChange={(e) => updateOtherLink(index, 'url', e.target.value)}
                      disabled={!editable}
                      placeholder="https://..."
                      className="flex-1"
                    />
                    {editable && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOtherLink(index)}
                        className="shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {editable && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addOtherLink}
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Link
                  </Button>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              {saved && (
                <div className="flex items-center gap-1.5 text-sm text-green-600 mr-auto">
                  <CheckCircle2 className="w-4 h-4" />
                  Saved successfully
                </div>
              )}
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              {editable && (
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
