import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Bell, Palette, Globe, Shield, User, Loader2, Save } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
  const [profile, setProfile] = useState({
    first_name: '',
    last_name: '',
    organisation: '',
    department: '',
    phone_number: '',
    address: '',
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

      setProfile({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        organisation: data.organisation || '',
        department: data.department || '',
        phone_number: data.phone_number || '',
        address: data.address || '',
        country: data.country || '',
      });
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setProfileLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setProfileSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: profile.first_name,
          last_name: profile.last_name,
          full_name: `${profile.first_name} ${profile.last_name}`.trim(),
          organisation: profile.organisation,
          department: profile.department,
          phone_number: profile.phone_number,
          address: profile.address,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
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
                Update your personal and contact information.
              </p>
              
              {profileLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">First name</Label>
                      <Input
                        id="first_name"
                        value={profile.first_name}
                        onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
                        placeholder="Enter first name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last_name">Last name</Label>
                      <Input
                        id="last_name"
                        value={profile.last_name}
                        onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
                        placeholder="Enter last name"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="organisation">Organisation</Label>
                      <Input
                        id="organisation"
                        value={profile.organisation}
                        onChange={(e) => setProfile({ ...profile, organisation: e.target.value })}
                        placeholder="Enter organisation"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="department">Department</Label>
                      <Input
                        id="department"
                        value={profile.department}
                        onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                        placeholder="Enter department"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone_number">Phone number</Label>
                      <Input
                        id="phone_number"
                        value={profile.phone_number}
                        onChange={(e) => setProfile({ ...profile, phone_number: e.target.value })}
                        placeholder="Enter phone number"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">Country</Label>
                      <Input
                        id="country"
                        value={profile.country}
                        onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                        placeholder="Enter country"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input
                      id="address"
                      value={profile.address}
                      onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                      placeholder="Enter address"
                    />
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
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
