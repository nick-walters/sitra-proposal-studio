import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Users, UserPlus, Loader2, Info, Trash2, Crown, ShieldCheck, Pencil, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Collaborator {
  id: string; // user_roles.id
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
  avatarUrl: string | null;
}

interface OnlineCollaborator {
  id: string;
  name: string;
  sectionId: string | null;
}

interface ProposalCollaboratorsPanelProps {
  proposalId: string;
  canManage: boolean; // true if global owner or proposal admin
  onlineCollaborators: OnlineCollaborator[];
}

const ROLE_ICONS: Record<string, typeof Crown> = {
  owner: Crown,
  admin: ShieldCheck,
  editor: Pencil,
  viewer: Eye,
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export function ProposalCollaboratorsPanel({
  proposalId,
  canManage,
  onlineCollaborators,
}: ProposalCollaboratorsPanelProps) {
  const { user } = useAuth();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Add form state
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'editor' | 'viewer'>('editor');
  const [saving, setSaving] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [foundUser, setFoundUser] = useState<{ id: string; fullName: string | null } | null>(null);

  const fetchCollaborators = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_roles')
      .select('id, user_id, role')
      .eq('proposal_id', proposalId);

    if (error) {
      console.error('Error fetching collaborators:', error);
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setCollaborators([]);
      setLoading(false);
      return;
    }

    // Fetch profiles for these users
    const userIds = data.map(r => r.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url')
      .in('id', userIds);

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

    setCollaborators(
      data.map(r => {
        const profile = profileMap.get(r.user_id);
        return {
          id: r.id,
          userId: r.user_id,
          email: profile?.email || '',
          fullName: profile?.full_name || null,
          role: r.role,
          avatarUrl: profile?.avatar_url || null,
        };
      })
    );
    setLoading(false);
  };

  useEffect(() => {
    if (proposalId) fetchCollaborators();
  }, [proposalId]);

  // Check email when typing
  useEffect(() => {
    if (!email || !email.includes('@')) {
      setFoundUser(null);
      return;
    }
    const timeout = setTimeout(async () => {
      setCheckingEmail(true);
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      setFoundUser(data ? { id: data.id, fullName: data.full_name } : null);
      setCheckingEmail(false);
    }, 400);
    return () => clearTimeout(timeout);
  }, [email]);

  const handleAdd = async () => {
    if (!foundUser) {
      toast.error('User must have an existing account to be added');
      return;
    }

    // Check if already has access
    const existing = collaborators.find(c => c.userId === foundUser.id);
    if (existing) {
      toast.info(`${foundUser.fullName || email} already has ${ROLE_LABELS[existing.role]} access`);
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('user_roles').insert([{
      user_id: foundUser.id,
      proposal_id: proposalId,
      role,
    }]);

    if (error) {
      console.error('Error adding collaborator:', error);
      toast.error('Failed to add collaborator');
    } else {
      toast.success(`${foundUser.fullName || email} added as ${ROLE_LABELS[role]}`);
      setEmail('');
      setRole('editor');
      setFoundUser(null);
      fetchCollaborators();
    }
    setSaving(false);
  };

  const handleRemove = async (collab: Collaborator) => {
    if (collab.userId === user?.id) {
      toast.error("You can't remove yourself");
      return;
    }
    const { error } = await supabase.from('user_roles').delete().eq('id', collab.id);
    if (error) {
      toast.error('Failed to remove collaborator');
    } else {
      toast.success(`${collab.fullName || collab.email} removed`);
      fetchCollaborators();
    }
  };

  const handleChangeRole = async (collab: Collaborator, newRole: 'admin' | 'editor' | 'viewer') => {
    if (newRole === collab.role) return;
    const { error } = await supabase
      .from('user_roles')
      .update({ role: newRole })
      .eq('id', collab.id);
    if (error) {
      toast.error('Failed to update role');
    } else {
      toast.success(`${collab.fullName || collab.email} is now ${ROLE_LABELS[newRole]}`);
      fetchCollaborators();
    }
  };

  const onlineIds = new Set(onlineCollaborators.map(c => c.id));

  return (
    <>
      <div className="p-4 border-t border-border flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Collaborators
          </span>
          {canManage && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDialogOpen(true)}>
                  <UserPlus className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Manage access</TooltipContent>
            </Tooltip>
          )}
          {!canManage && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setDialogOpen(true)}
            >
              <Users className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Show online collaborators */}
        <div className="space-y-2">
          {onlineCollaborators.length === 0 && collaborators.length === 0 && !loading ? (
            <p className="text-xs text-muted-foreground">No collaborators yet</p>
          ) : (
            <>
              {onlineCollaborators.map((oc) => (
                <div key={oc.id} className="flex items-center gap-2">
                  <div className="relative">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-xs font-medium text-primary">
                        {oc.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-success border border-card" />
                  </div>
                  <span className="text-sm truncate">{oc.name}</span>
                </div>
              ))}
              {onlineCollaborators.length === 0 && (
                <p className="text-xs text-muted-foreground">No one else is online</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Manage Collaborators Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Proposal Collaborators
            </DialogTitle>
            <DialogDescription>
              {canManage ? 'Manage who has access to this proposal' : 'People with access to this proposal'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Add new collaborator - only for those who can manage */}
            {canManage && (
              <div className="space-y-3 pb-4 border-b border-border">
                <Label className="text-sm font-medium">Add collaborator</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="pr-8"
                    />
                    {checkingEmail && (
                      <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'editor' | 'viewer')}>
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {foundUser && (
                  <p className="text-xs text-success">✓ {foundUser.fullName || 'User found'}</p>
                )}
                {email && email.includes('@') && !checkingEmail && !foundUser && (
                  <p className="text-xs text-destructive">User not found — they need to sign up first</p>
                )}
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={saving || !foundUser}
                  className="gap-1.5"
                >
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                  <UserPlus className="w-3.5 h-3.5" />
                  Add
                </Button>
              </div>
            )}

            {/* Current collaborators list */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              ) : collaborators.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No collaborators</p>
              ) : (
                collaborators.map((collab) => {
                  const RoleIcon = ROLE_ICONS[collab.role] || Eye;
                  const isOnline = onlineIds.has(collab.userId);
                  const isSelf = collab.userId === user?.id;

                  return (
                    <div key={collab.id} className="flex items-center gap-2 py-1.5 group">
                      <div className="relative flex-shrink-0">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-medium text-primary">
                            {(collab.fullName || collab.email)
                              .split(' ')
                              .map(n => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </span>
                        </div>
                        {isOnline && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-success border border-card" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">
                            {collab.fullName || collab.email}
                          </span>
                          {isSelf && (
                            <span className="text-xs text-muted-foreground">(you)</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground truncate block">{collab.email}</span>
                      </div>
                      {canManage && !isSelf ? (
                        <Select
                          value={collab.role}
                          onValueChange={(v) => handleChangeRole(collab, v as 'admin' | 'editor' | 'viewer')}
                        >
                          <SelectTrigger className="h-6 w-24 text-xs gap-1 px-2">
                            <RoleIcon className="w-3 h-3 flex-shrink-0" />
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="gap-1 text-xs flex-shrink-0">
                          <RoleIcon className="w-3 h-3" />
                          {ROLE_LABELS[collab.role] || collab.role}
                        </Badge>
                      )}
                      {canManage && !isSelf && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                              onClick={() => handleRemove(collab)}
                            >
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remove access</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
