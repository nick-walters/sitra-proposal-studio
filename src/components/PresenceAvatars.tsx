import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserProfileDialog } from "./UserProfileDialog";
import { Badge } from "@/components/ui/badge";
import { Building2, Mail, Phone, MapPin } from "lucide-react";
import type { ProposalRoleTier } from "@/hooks/useProposalRole";

export interface PresenceUser {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  organisation?: string | null;
  department?: string | null;
  phone_number?: string | null;
  address?: string | null;
  country?: string | null;
}

interface PresenceAvatarsProps {
  users: PresenceUser[];
  maxVisible?: number;
  /** Current user's role tier — controls what info is shown about others */
  roleTier?: ProposalRoleTier;
}


export function PresenceAvatars({ users, maxVisible = 4, roleTier = 'editor' }: PresenceAvatarsProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);

  const visibleUsers = users.slice(0, maxVisible);
  const overflowCount = users.length - maxVisible;

  const getInitials = (user: PresenceUser) => {
    if (user.first_name || user.last_name) {
      return `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase();
    }
    if (user.full_name) {
      return user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return user.email?.[0]?.toUpperCase() || 'U';
  };

  const getDisplayName = (user: PresenceUser) => {
    if (user.first_name || user.last_name) {
      return [user.first_name, user.last_name].filter(Boolean).join(' ');
    }
    return user.full_name || user.email;
  };

  const handleViewProfile = (userId: string) => {
    setSelectedUserId(userId);
    setIsProfileDialogOpen(true);
  };

  if (users.length === 0) return null;

  const isViewer = roleTier === 'viewer';
  const isEditor = roleTier === 'editor';

  // Viewers: show names only, no avatars
  if (isViewer) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {users.map(u => getDisplayName(u)).join(', ')}
          {' '}editing
        </span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center">
        <div className="flex -space-x-2">
          {visibleUsers.map((user, index) => (
            <Popover key={user.id}>
              <PopoverTrigger asChild>
                <button className="relative focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-full">
                  <Avatar 
                    className="w-8 h-8 border-2 border-background cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
                    style={{ zIndex: visibleUsers.length - index }}
                  >
                    <AvatarImage src={user.avatar_url || undefined} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {getInitials(user)}
                    </AvatarFallback>
                  </Avatar>
                  {/* Online indicator */}
                  <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-background rounded-full" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-4" align="start">
                <div className="space-y-3">
                  {/* Header with avatar and name */}
                  <div className="flex items-center gap-3">
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback className="text-sm bg-primary/10 text-primary">
                        {getInitials(user)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm truncate">{getDisplayName(user)}</h4>
                      <Badge variant="secondary" className="text-[10px] mt-1">
                        Currently editing
                      </Badge>
                    </div>
                  </div>

                  {/* Contact info — hidden for editors (they see name, email, org, photo) */}
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="w-3.5 h-3.5" />
                      <span className="truncate">{user.email}</span>
                    </div>
                    
                    {user.organisation && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Building2 className="w-3.5 h-3.5" />
                        <span className="truncate">
                          {user.organisation}
                          {user.department && ` • ${user.department}`}
                        </span>
                      </div>
                    )}
                    
                    {/* Phone and address only for coordinators */}
                    {!isEditor && user.phone_number && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{user.phone_number}</span>
                      </div>
                    )}
                    
                    {!isEditor && (user.address || user.country) && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="truncate">
                          {[user.address, user.country].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* View full profile button — only for coordinators */}
                  {!isEditor && (
                    <button
                      className="w-full text-center text-sm text-primary hover:underline pt-2 border-t"
                      onClick={() => handleViewProfile(user.id)}
                    >
                      View full profile
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          ))}
          
          {overflowCount > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button className="w-8 h-8 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-colors">
                  +{overflowCount}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                <div className="space-y-1">
                  {users.slice(maxVisible).map((user) => (
                    <button
                      key={user.id}
                      className="w-full flex items-center gap-2 p-1.5 rounded-md hover:bg-muted transition-colors"
                      onClick={() => handleViewProfile(user.id)}
                    >
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                          {getInitials(user)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate">{getDisplayName(user)}</span>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        
        <span className="ml-2 text-xs text-muted-foreground">
          {users.length} {users.length === 1 ? 'person' : 'people'} editing
        </span>
      </div>

      {selectedUserId && (
        <UserProfileDialog 
          open={isProfileDialogOpen}
          onOpenChange={setIsProfileDialogOpen}
          userId={selectedUserId}
          editable={false}
        />
      )}
    </>
  );
}