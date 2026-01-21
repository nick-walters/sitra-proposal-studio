import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Bell, Palette, Shield, User, Loader2, Save, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ProfilePhotoUpload } from "./ProfilePhotoUpload";
import { sortedCountryCodes, countryList } from "@/lib/countryCodes";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  email?: string;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState({
    emailUpdates: true,
    proposalChanges: true,
    deadlineReminders: true,
    collaboratorActivity: false,
  });

  const [preferences, setPreferences] = useState({
    theme: 'system',
    language: 'en',
    dateFormat: 'dd/MM/yyyy',
    autoSave: true,
  });

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [profile, setProfile] = useState({
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
  });

  // Fetch profile when dialog opens
  useEffect(() => {
    if (open && user) {
      fetchProfile();
    }
  }, [open, user]);

  const fetchProfile = async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      setAvatarUrl(data.avatar_url);
      setProfile({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        email: data.email || user.email || '',
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
      setErrors({});
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setProfileLoading(false);
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

  const saveProfile = async () => {
    if (!user) return;
    
    if (!validateProfile()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setProfileSaving(true);
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
        })
        .eq('id', user.id);

      if (error) throw error;

      toast.success('Profile updated successfully');
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Manage your preferences and account settings
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general" className="gap-1">
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1">
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="account" className="gap-1">
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">Account</span>
            </TabsTrigger>
            <TabsTrigger value="security" className="gap-1">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Security</span>
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-6 mt-4">
            <div className="space-y-4">
              <h3 className="font-medium">Appearance</h3>
              
              <div className="grid gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Theme</Label>
                    <p className="text-sm text-muted-foreground">Select your preferred theme</p>
                  </div>
                  <Select
                    value={preferences.theme}
                    onValueChange={(v) => setPreferences({ ...preferences, theme: v })}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Language</Label>
                    <p className="text-sm text-muted-foreground">Interface language</p>
                  </div>
                  <Select
                    value={preferences.language}
                    onValueChange={(v) => setPreferences({ ...preferences, language: v })}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English (UK)</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="it">Italiano</SelectItem>
                      <SelectItem value="nl">Nederlands</SelectItem>
                      <SelectItem value="pl">Polski</SelectItem>
                      <SelectItem value="pt">Português</SelectItem>
                      <SelectItem value="el">Ελληνικά</SelectItem>
                      <SelectItem value="fi">Suomi</SelectItem>
                      <SelectItem value="sv">Svenska</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="font-medium">Editor Preferences</h3>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-save</Label>
                  <p className="text-sm text-muted-foreground">Automatically save changes</p>
                </div>
                <Switch
                  checked={preferences.autoSave}
                  onCheckedChange={(checked) => setPreferences({ ...preferences, autoSave: checked })}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Date Format</Label>
                  <p className="text-sm text-muted-foreground">How dates are displayed</p>
                </div>
                <Select
                  value={preferences.dateFormat}
                  onValueChange={(v) => setPreferences({ ...preferences, dateFormat: v })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dd/MM/yyyy">DD/MM/YYYY</SelectItem>
                    <SelectItem value="MM/dd/yyyy">MM/DD/YYYY</SelectItem>
                    <SelectItem value="yyyy-MM-dd">YYYY-MM-DD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications" className="space-y-6 mt-4">
            <div className="space-y-4">
              <h3 className="font-medium">Email Notifications</h3>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Email updates</Label>
                    <p className="text-sm text-muted-foreground">Receive weekly digest emails</p>
                  </div>
                  <Switch
                    checked={notifications.emailUpdates}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, emailUpdates: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Proposal changes</Label>
                    <p className="text-sm text-muted-foreground">Notify when proposals are modified</p>
                  </div>
                  <Switch
                    checked={notifications.proposalChanges}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, proposalChanges: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Deadline reminders</Label>
                    <p className="text-sm text-muted-foreground">Get reminded before deadlines</p>
                  </div>
                  <Switch
                    checked={notifications.deadlineReminders}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, deadlineReminders: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Collaborator activity</Label>
                    <p className="text-sm text-muted-foreground">Notify when collaborators make changes</p>
                  </div>
                  <Switch
                    checked={notifications.collaboratorActivity}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, collaboratorActivity: checked })}
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Account Settings */}
          <TabsContent value="account" className="space-y-6 mt-4">
            <div className="space-y-4">
              <h3 className="font-medium">Profile Information</h3>
              <p className="text-sm text-muted-foreground">
                Update your personal and contact information. Fields marked with <span className="text-destructive">*</span> are required.
              </p>
              
              {profileLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-4">
                  {/* Profile Photo */}
                  {user && (
                    <div className="space-y-2">
                      <Label>Profile Photo</Label>
                      <ProfilePhotoUpload
                        userId={user.id}
                        currentAvatarUrl={avatarUrl}
                        firstName={profile.first_name}
                        lastName={profile.last_name}
                        email={profile.email}
                        onAvatarChange={setAvatarUrl}
                      />
                    </div>
                  )}

                  {/* Email (read-only) */}
                  <div className="space-y-2">
                    <RequiredLabel htmlFor="email">Email Address</RequiredLabel>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      disabled
                      className="bg-muted"
                    />
                    <p className="text-xs text-muted-foreground">Contact support to change your email address</p>
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
                      <Input
                        id="organisation"
                        value={profile.organisation}
                        onChange={(e) => {
                          setProfile({ ...profile, organisation: e.target.value });
                          if (errors.organisation) setErrors({ ...errors, organisation: undefined });
                        }}
                        placeholder="Enter organisation"
                        className={errors.organisation ? 'border-destructive' : ''}
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
                      <Select
                        value={profile.country_code}
                        onValueChange={(v) => {
                          setProfile({ ...profile, country_code: v });
                          if (errors.country_code) setErrors({ ...errors, country_code: undefined });
                        }}
                      >
                        <SelectTrigger className={`w-[140px] ${errors.country_code ? 'border-destructive' : ''}`}>
                          <SelectValue placeholder="Code" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {sortedCountryCodes.map((c) => (
                            <SelectItem key={c.code} value={c.dialCode}>
                              {c.flag} {c.dialCode}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                      <Select
                        value={profile.country}
                        onValueChange={(v) => {
                          setProfile({ ...profile, country: v });
                          if (errors.country) setErrors({ ...errors, country: undefined });
                        }}
                      >
                        <SelectTrigger className={errors.country ? 'border-destructive' : ''}>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {countryList.map((country) => (
                            <SelectItem key={country} value={country}>
                              {country}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <ErrorMessage message={errors.country} />
                    </div>
                  </div>

                  <Button 
                    onClick={saveProfile} 
                    disabled={profileSaving}
                    className="w-fit"
                  >
                    {profileSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save Profile
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="font-medium">Export Data</h3>
              <p className="text-sm text-muted-foreground">
                Download all your proposals and data.
              </p>
              <Button variant="outline">Export All Data</Button>
            </div>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security" className="space-y-6 mt-4">
            <div className="space-y-4">
              <h3 className="font-medium">Password</h3>
              
              <div className="grid gap-3 max-w-sm">
                <div>
                  <Label>Current Password</Label>
                  <Input type="password" />
                </div>
                <div>
                  <Label>New Password</Label>
                  <Input type="password" />
                </div>
                <div>
                  <Label>Confirm New Password</Label>
                  <Input type="password" />
                </div>
                <Button className="w-fit">Update Password</Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="font-medium">Two-Factor Authentication</h3>
              <p className="text-sm text-muted-foreground">
                Add an extra layer of security to your account.
              </p>
              <Button variant="outline">Enable 2FA</Button>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
