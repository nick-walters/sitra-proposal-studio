import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  organisation: string | null;
  department: string | null;
  phone_number: string | null;
  address: string | null;
  country: string | null;
  avatar_url: string | null;
}

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  editable?: boolean;
}

export function UserProfileDialog({ open, onOpenChange, userId, editable = false }: UserProfileDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    organisation: '',
    department: '',
    phone_number: '',
    address: '',
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

      setProfile(data);
      setFormData({
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
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editable) return;
    
    setSaving(true);
    try {
      const fullName = [formData.first_name, formData.last_name].filter(Boolean).join(' ') || null;
      
      const { error } = await supabase
        .from('profiles')
        .update({
          first_name: formData.first_name || null,
          last_name: formData.last_name || null,
          full_name: fullName,
          organisation: formData.organisation || null,
          department: formData.department || null,
          phone_number: formData.phone_number || null,
          address: formData.address || null,
          country: formData.country || null,
        })
        .eq('id', userId);

      if (error) throw error;

      toast.success('Profile updated successfully');
      onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editable ? 'Edit Profile' : 'User Profile'}</DialogTitle>
          <DialogDescription>
            {editable ? 'Update your personal information' : 'View user details'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Avatar and name */}
            <div className="flex items-center gap-4 pb-4 border-b">
              <Avatar className="w-16 h-16">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-lg bg-primary/10 text-primary">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-lg">{getDisplayName()}</h3>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
              </div>
            </div>

            {/* Form fields */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  disabled={!editable}
                  placeholder="Enter first name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  disabled={!editable}
                  placeholder="Enter last name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="organisation">Organisation</Label>
              <Input
                id="organisation"
                value={formData.organisation}
                onChange={(e) => setFormData({ ...formData, organisation: e.target.value })}
                disabled={!editable}
                placeholder="Enter organisation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="department">Department (Optional)</Label>
              <Input
                id="department"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                disabled={!editable}
                placeholder="Enter department"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone_number">Phone Number</Label>
              <Input
                id="phone_number"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                disabled={!editable}
                placeholder="Enter phone number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                disabled={!editable}
                placeholder="Enter address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                disabled={!editable}
                placeholder="Enter country"
              />
            </div>

            {editable && (
              <div className="flex justify-end pt-4">
                <Button onClick={handleSave} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}