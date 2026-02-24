import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Settings, Bell, Palette, Shield, Loader2, CheckCircle, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
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

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  // 2FA state
  const [mfaFactors, setMfaFactors] = useState<any[]>([]);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [enrollStep, setEnrollStep] = useState<'idle' | 'qr' | 'verify'>('idle');
  const [qrUri, setQrUri] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [factorId, setFactorId] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);

  // Fetch MFA factors when dialog opens
  useEffect(() => {
    if (open) {
      fetchMfaFactors();
    } else {
      // Reset enrollment state when dialog closes
      setEnrollStep('idle');
      setQrUri('');
      setTotpSecret('');
      setFactorId('');
      setVerifyCode('');
    }
  }, [open]);

  const fetchMfaFactors = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error && data) {
      setMfaFactors(data.totp || []);
    }
  };

  const handleUpdatePassword = async () => {
    if (!currentPassword) {
      toast.error('Please enter your current password');
      return;
    }
    if (!newPassword) {
      toast.error('Please enter a new password');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setPasswordLoading(true);
    try {
      // Verify current password first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Unable to verify identity');

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });
      if (signInError) {
        toast.error('Current password is incorrect');
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to update password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleEnroll2FA = async () => {
    setMfaLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setQrUri(data.totp.qr_code);
      setTotpSecret(data.totp.secret);
      setFactorId(data.id);
      setEnrollStep('qr');
    } catch (error: any) {
      toast.error(error.message || 'Failed to start 2FA setup');
    } finally {
      setMfaLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (verifyCode.length !== 6) {
      toast.error('Please enter the 6-digit code');
      return;
    }
    setVerifyLoading(true);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: verifyCode,
      });
      if (verifyError) throw verifyError;

      toast.success('Two-factor authentication enabled successfully');
      setEnrollStep('idle');
      setVerifyCode('');
      fetchMfaFactors();
    } catch (error: any) {
      toast.error(error.message || 'Verification failed. Please try again.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleUnenroll2FA = async (id: string) => {
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      toast.success('Two-factor authentication disabled');
      fetchMfaFactors();
    } catch (error: any) {
      toast.error(error.message || 'Failed to disable 2FA');
    }
  };

  const verifiedFactors = mfaFactors.filter(f => f.status === 'verified');
  const has2FA = verifiedFactors.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Settings
          </DialogTitle>
          <DialogDescription>
            Manage your preferences and application settings
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general" className="gap-1">
              <Palette className="w-4 h-4" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1">
              <Bell className="w-4 h-4" />
              <span className="hidden sm:inline">Notifications</span>
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

          {/* Security Settings */}
          <TabsContent value="security" className="space-y-6 mt-4">
            <div className="space-y-4">
              <h3 className="font-medium">Change Password</h3>
              
              <div className="grid gap-3 max-w-sm">
                <div>
                  <Label>Current Password</Label>
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                  />
                </div>
                <div>
                  <Label>New Password</Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>
                <div>
                  <Label>Confirm New Password</Label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                  />
                </div>
                <Button
                  className="w-fit"
                  onClick={handleUpdatePassword}
                  disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
                >
                  {passwordLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Update Password
                </Button>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="font-medium">Two-Factor Authentication</h3>

              {has2FA ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="w-4 h-4" />
                    Two-factor authentication is enabled
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleUnenroll2FA(verifiedFactors[0].id)}
                  >
                    Disable 2FA
                  </Button>
                </div>
              ) : enrollStep === 'idle' ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Add an extra layer of security to your account using a TOTP authenticator app.
                  </p>
                  <Button variant="outline" onClick={handleEnroll2FA} disabled={mfaLoading}>
                    {mfaLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Enable 2FA
                  </Button>
                </div>
              ) : enrollStep === 'qr' ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Scan this QR code with your authenticator app (e.g. Google Authenticator, Authy), then enter the 6-digit code below.
                  </p>
                  <div className="flex justify-center">
                    <img src={qrUri} alt="2FA QR Code" className="w-48 h-48 rounded border" />
                  </div>
                  {totpSecret && (
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Or enter this secret manually:</p>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono select-all break-all">
                          {totpSecret}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            navigator.clipboard.writeText(totpSecret);
                            toast.success('Secret copied');
                          }}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>Verification Code</Label>
                    <InputOTP maxLength={6} value={verifyCode} onChange={setVerifyCode}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleVerify2FA} disabled={verifyLoading || verifyCode.length !== 6}>
                      {verifyLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Verify & Enable
                    </Button>
                    <Button variant="ghost" onClick={() => setEnrollStep('idle')}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
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
