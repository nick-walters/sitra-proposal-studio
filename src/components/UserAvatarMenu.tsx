import { useState, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserProfileDialog } from "./UserProfileDialog";
import { SettingsDialog } from "./SettingsDialog";
import { supabase } from "@/integrations/supabase/client";
import { User, LogOut, ChevronDown, Settings } from "lucide-react";

interface UserAvatarMenuProps {
  userId: string;
  email: string;
  onLogout: () => void;
}

interface ProfileData {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export function UserAvatarMenu({ userId, email, onLogout }: UserAvatarMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('first_name, last_name, full_name, avatar_url')
        .eq('id', userId)
        .single();

      if (error) {
        // Ignore abort errors
        if (error.message?.includes('AbortError') || error.message?.includes('aborted')) {
          return;
        }
        console.error('Error fetching profile:', error);
        return;
      }

      if (data) {
        setProfile(data);
      }
    } catch (error: any) {
      if (error?.message?.includes('AbortError') || error?.message?.includes('aborted')) {
        return;
      }
      console.error('Error fetching profile:', error);
    }
  };

  const getInitials = () => {
    if (profile?.first_name || profile?.last_name) {
      return `${profile.first_name?.[0] || ''}${profile.last_name?.[0] || ''}`.toUpperCase();
    }
    if (profile?.full_name) {
      return profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email?.[0]?.toUpperCase() || 'U';
  };

  const getDisplayName = () => {
    if (profile?.first_name) {
      return profile.first_name;
    }
    if (profile?.full_name) {
      return profile.full_name.split(' ')[0]; // First word of full name
    }
    return email?.split('@')[0] || 'User'; // Username part of email as fallback
  };

  return (
    <>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="flex items-center gap-2 px-2 h-9">
            <Avatar className="w-7 h-7">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline text-sm font-medium max-w-[120px] truncate">
              {getDisplayName()}
            </span>
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1" align="end">
          <div className="space-y-1">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start gap-2 font-normal"
              onClick={() => {
                setIsOpen(false);
                setIsProfileOpen(true);
              }}
            >
              <User className="w-4 h-4" />
              Edit Profile
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start gap-2 font-normal"
              onClick={() => {
                setIsOpen(false);
                setIsSettingsOpen(true);
              }}
            >
              <Settings className="w-4 h-4" />
              Settings
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full justify-start gap-2 font-normal text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => {
                setIsOpen(false);
                onLogout();
              }}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <UserProfileDialog 
        open={isProfileOpen}
        onOpenChange={setIsProfileOpen}
        userId={userId}
        editable={true}
      />
      
      <SettingsDialog
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
      />
    </>
  );
}