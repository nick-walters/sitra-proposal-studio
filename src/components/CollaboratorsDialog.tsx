import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserProfileDialog } from "@/components/UserProfileDialog";
import { ProposalMultiSelect } from "@/components/ProposalMultiSelect";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail, Building2, Search, Users, UserPlus, Phone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useParams } from "react-router-dom";

interface Collaborator {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  organisation: string | null;
  avatar_url: string | null;
  phone_number: string | null;
}

interface OnlineUser {
  id: string;
  name: string;
}

interface CollaboratorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CollaboratorsDialog({ open, onOpenChange }: CollaboratorsDialogProps) {
  const { user } = useAuth();
  const { id: proposalId } = useParams<{ id: string }>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedProposalIds, setSelectedProposalIds] = useState<string[]>([]);
  const [canInvite, setCanInvite] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loadingCollaborators, setLoadingCollaborators] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);

  // Subscribe to realtime presence for the current proposal
  useEffect(() => {
    if (!open || !proposalId || !user) {
      setOnlineUsers([]);
      return;
    }

    // Listen on the same presence channel used by useCollaborativeCursors
    const channel = supabase.channel(`proposal:${proposalId}:cursors`, {
      config: {
        presence: {},
      },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const users: OnlineUser[] = [];
        for (const [, presences] of Object.entries(state)) {
          const presence = presences[0] as unknown as { id: string; name: string };
          if (presence.id && presence.id !== user.id) {
            users.push({ id: presence.id, name: presence.name });
          }
        }
        setOnlineUsers(users);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [open, proposalId, user]);

  const onlineUserIds = new Set(onlineUsers.map(u => u.id));

  // Fetch real collaborators from profiles table
  useEffect(() => {
    async function fetchCollaborators() {
      setLoadingCollaborators(true);
      try {
        const { data, error } = await supabase
          .from('profiles_basic')
          .select('id, email, first_name, last_name, full_name, organisation, avatar_url, phone_number');

        if (error) {
          console.error('Error fetching collaborators:', error);
          return;
        }

        setCollaborators(data || []);
      } catch (err) {
        console.error('Error fetching collaborators:', err);
      } finally {
        setLoadingCollaborators(false);
      }
    }

    if (open) {
      fetchCollaborators();
    }
  }, [open]);

  // Check if user can invite
  useEffect(() => {
    async function checkInvitePermission() {
      if (!user) {
        setCanInvite(false);
        return;
      }

      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .limit(5);

      setCanInvite(!!(roles && roles.some(r => r.role === 'owner' || r.role === 'admin')));
    }

    if (open) {
      checkInvitePermission();
    }
  }, [user, open]);

  const getDisplayName = (c: Collaborator) => {
    if (c.first_name && c.last_name) return `${c.first_name} ${c.last_name}`;
    if (c.full_name) return c.full_name;
    return c.email;
  };

  const getInitials = (c: Collaborator) => {
    if (c.first_name && c.last_name) return `${c.first_name[0]}${c.last_name[0]}`.toUpperCase();
    if (c.full_name) {
      const parts = c.full_name.split(' ');
      return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : c.full_name[0].toUpperCase();
    }
    return c.email[0].toUpperCase();
  };

  const filteredUsers = collaborators.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      getDisplayName(c).toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      (c.organisation?.toLowerCase().includes(q))
    );
  });

  const handleViewProfile = (userId: string) => {
    setSelectedUserId(userId);
    setIsProfileOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Collaborators
            </DialogTitle>
            <DialogDescription>
              View team members and contact details
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="team" className="mt-4">
            <TabsList className={`grid w-full ${canInvite ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <TabsTrigger value="team">Team Members</TabsTrigger>
              {canInvite && <TabsTrigger value="invite">Invite New</TabsTrigger>}
            </TabsList>

            <TabsContent value="team" className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or organisation..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <ScrollArea className="h-[400px] pr-4">
                {loadingCollaborators ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>{searchQuery ? 'No matching collaborators found' : 'No collaborators yet'}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredUsers.map((collab) => {
                      const isOnline = onlineUserIds.has(collab.id);
                      return (
                        <div
                          key={collab.id}
                          className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className="relative">
                            <Avatar 
                              className="w-12 h-12 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                              onClick={() => handleViewProfile(collab.id)}
                            >
                              <AvatarImage src={collab.avatar_url || undefined} />
                              <AvatarFallback>{getInitials(collab)}</AvatarFallback>
                            </Avatar>
                            {isOnline && (
                              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-card" />
                            )}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span 
                                className="font-medium cursor-pointer hover:text-primary transition-colors"
                                onClick={() => handleViewProfile(collab.id)}
                              >
                                {getDisplayName(collab)}
                              </span>
                              {isOnline && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-green-50 text-green-700 border-green-300 dark:bg-green-950 dark:text-green-400 dark:border-green-700">
                                  Online
                                </Badge>
                              )}
                            </div>
                            {collab.organisation && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Building2 className="w-3 h-3" />
                                {collab.organisation}
                              </div>
                            )}
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Mail className="w-3 h-3" />
                              {collab.email}
                            </div>
                            {collab.phone_number && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="w-3 h-3" />
                                {collab.phone_number}
                              </div>
                            )}
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1"
                            onClick={() => window.location.href = `mailto:${collab.email}`}
                          >
                            <Mail className="w-4 h-4" />
                            Send email
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {canInvite && (
              <TabsContent value="invite" className="space-y-6">
                <div className="py-4">
                  <div className="flex items-center gap-3 mb-6">
                    <UserPlus className="w-10 h-10 text-muted-foreground" />
                    <div>
                      <h3 className="font-medium">Invite collaborators</h3>
                      <p className="text-sm text-muted-foreground">
                        Enter an email address and select which proposals to grant access
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">Email address</Label>
                      <Input
                        id="invite-email"
                        placeholder="email@example.com"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Grant access to proposals</Label>
                      <ProposalMultiSelect
                        selectedProposalIds={selectedProposalIds}
                        onSelectionChange={setSelectedProposalIds}
                        placeholder="Select proposals..."
                      />
                      <p className="text-xs text-muted-foreground">
                        Type an acronym to filter, click to select multiple proposals
                      </p>
                    </div>

                    <Button 
                      className="w-full"
                      disabled={!inviteEmail || selectedProposalIds.length === 0}
                    >
                      Send Invite
                    </Button>
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      {selectedUserId && (
        <UserProfileDialog
          open={isProfileOpen}
          onOpenChange={setIsProfileOpen}
          userId={selectedUserId}
          editable={false}
        />
      )}
    </>
  );
}
