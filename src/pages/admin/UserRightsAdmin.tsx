import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminAvatarUpload } from "@/components/admin/AdminAvatarUpload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Plus, Trash2, Users, Shield, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface UserWithRoles {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  roles: {
    id: string;
    role: string;
    proposal_id: string | null;
    proposal_acronym?: string | null;
  }[];
}

interface ProposalOption {
  id: string;
  acronym: string;
}

export function UserRightsAdmin() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdminOrOwner, isOwner, hasAnyCoordinatorRole, loading: roleLoading } = useUserRole();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [newRole, setNewRole] = useState<string>("editor");
  const [selectedProposalId, setSelectedProposalId] = useState<string>("");
  const [proposals, setProposals] = useState<ProposalOption[]>([]);

  // Coordinators who are not owners need at least one coordinator role
  const canAccess = isOwner || (isAdminOrOwner && hasAnyCoordinatorRole);

  // Redirect if no access
  useEffect(() => {
    if (!roleLoading && !canAccess) {
      toast.error("Access denied. You need to be an Owner or a Coordinator.");
      navigate("/dashboard");
    }
  }, [canAccess, roleLoading, navigate]);

  // Determine which proposals current user can manage
  const [coordinatedProposalIds, setCoordinatedProposalIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [profilesRes, rolesRes, proposalsRes] = await Promise.all([
          supabase.from('profiles').select('id, email, full_name, first_name, last_name, avatar_url'),
          supabase.from('user_roles').select('id, user_id, role, proposal_id'),
          supabase.from('proposals').select('id, acronym'),
        ]);

        if (profilesRes.error) throw profilesRes.error;
        if (rolesRes.error) throw rolesRes.error;

        const proposalMap = new Map<string, string>();
        (proposalsRes.data || []).forEach(p => proposalMap.set(p.id, p.acronym));
        setProposals((proposalsRes.data || []).map(p => ({ id: p.id, acronym: p.acronym })));

        // Determine which proposals the current user coordinates
        if (!isOwner && user) {
          const myCoordinated = new Set<string>();
          (rolesRes.data || [])
            .filter(r => r.user_id === user.id && r.proposal_id && r.role === 'coordinator')
            .forEach(r => myCoordinated.add(r.proposal_id!));
          setCoordinatedProposalIds(myCoordinated);
        }

        const usersWithRoles: UserWithRoles[] = (profilesRes.data || []).map(profile => ({
          ...profile,
          roles: (rolesRes.data || [])
            .filter(r => r.user_id === profile.id)
            .map(r => ({
              id: r.id,
              role: r.role,
              proposal_id: r.proposal_id,
              proposal_acronym: r.proposal_id ? proposalMap.get(r.proposal_id) || null : null,
            }))
        }));

        setUsers(usersWithRoles);
      } catch (error) {
        console.error('Error fetching users:', error);
        toast.error("Failed to load users");
      } finally {
        setLoading(false);
      }
    };

    if (canAccess) fetchData();
  }, [canAccess, isOwner, user]);

  const getDisplayName = (u: UserWithRoles) => {
    if (u.first_name && u.last_name) return `${u.first_name} ${u.last_name}`;
    if (u.full_name) return u.full_name;
    return u.email;
  };

  const getInitials = (u: UserWithRoles) => {
    if (u.first_name && u.last_name) return `${u.first_name[0]}${u.last_name[0]}`.toUpperCase();
    if (u.full_name) {
      const parts = u.full_name.split(' ');
      return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : u.full_name[0].toUpperCase();
    }
    return u.email[0].toUpperCase();
  };

  // Proposals the current user is allowed to assign roles to
  const assignableProposals = useMemo(() => {
    if (isOwner) return proposals;
    return proposals.filter(p => coordinatedProposalIds.has(p.id));
  }, [isOwner, proposals, coordinatedProposalIds]);

  // Can the current user manage a specific proposal role?
  const canManageProposalRole = (proposalId: string | null) => {
    if (!proposalId) return false; // global roles managed in Cloud Settings
    if (isOwner) return true;
    return coordinatedProposalIds.has(proposalId);
  };

  const handleAddRole = async () => {
    if (!selectedUser || !selectedProposalId) {
      toast.error('Please select a proposal');
      return;
    }

    try {
      const { error } = await supabase.from('user_roles').insert([{
        user_id: selectedUser.id,
        role: newRole as 'coordinator' | 'editor' | 'viewer',
        proposal_id: selectedProposalId,
      }]);

      if (error) throw error;

      // Refresh roles
      const { data: updatedRoles } = await supabase
        .from('user_roles')
        .select('id, role, proposal_id')
        .eq('user_id', selectedUser.id);

      const proposalMap = new Map<string, string>();
      proposals.forEach(p => proposalMap.set(p.id, p.acronym));

      setUsers(prev => prev.map(u =>
        u.id === selectedUser.id
          ? {
            ...u, roles: (updatedRoles || []).map(r => ({
              id: r.id,
              role: r.role,
              proposal_id: r.proposal_id,
              proposal_acronym: r.proposal_id ? proposalMap.get(r.proposal_id) || null : null,
            }))
          }
          : u
      ));

      const acronym = proposals.find(p => p.id === selectedProposalId)?.acronym || 'proposal';
      toast.success(`Added ${newRole} role on ${acronym} to ${getDisplayName(selectedUser)}`);
      setDialogOpen(false);
    } catch (error) {
      console.error('Error adding role:', error);
      toast.error("Failed to add role");
    }
  };

  const handleRemoveRole = async (targetUser: UserWithRoles, roleId: string, proposalId: string | null) => {
    if (!canManageProposalRole(proposalId)) {
      toast.error("You can only manage roles for proposals you coordinate");
      return;
    }

    if (!confirm("Are you sure you want to remove this role?")) return;

    try {
      const { error } = await supabase.from('user_roles').delete().eq('id', roleId);
      if (error) throw error;

      setUsers(prev => prev.map(u =>
        u.id === targetUser.id
          ? { ...u, roles: u.roles.filter(r => r.id !== roleId) }
          : u
      ));
      toast.success("Role removed");
    } catch (error) {
      console.error('Error removing role:', error);
      toast.error("Failed to remove role");
    }
  };

  const handleChangeProposalRole = async (targetUser: UserWithRoles, roleId: string, newRoleValue: string, proposalId: string | null) => {
    if (!canManageProposalRole(proposalId)) {
      toast.error("You can only manage roles for proposals you coordinate");
      return;
    }

    try {
      const { error } = await supabase.from('user_roles').update({ role: newRoleValue as 'coordinator' | 'editor' | 'viewer' }).eq('id', roleId);
      if (error) throw error;

      setUsers(prev => prev.map(u =>
        u.id === targetUser.id
          ? { ...u, roles: u.roles.map(r => r.id === roleId ? { ...r, role: newRoleValue } : r) }
          : u
      ));
      toast.success("Role updated");
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error("Failed to update role");
    }
  };

  const filteredUsers = users.filter(u => {
    const q = searchQuery.toLowerCase();
    return u.email.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.first_name?.toLowerCase().includes(q) ||
      u.last_name?.toLowerCase().includes(q);
  });

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto py-8 px-4">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!canAccess) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Shield className="w-8 h-8" />
            User Rights Management
          </h1>
          <p className="text-muted-foreground mt-2">
            Manage proposal-level roles for users
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Users</CardTitle>
              <CardDescription>{users.length} registered users</CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No users found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Proposal Roles</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => {
                    const proposalRoles = u.roles.filter(r => r.proposal_id);
                    const globalRoles = u.roles.filter(r => !r.proposal_id);

                    return (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {isOwner ? (
                              <AdminAvatarUpload
                                userId={u.id}
                                avatarUrl={u.avatar_url}
                                initials={getInitials(u)}
                                onAvatarChange={(uid, newUrl) => {
                                  setUsers(prev => prev.map(x => x.id === uid ? { ...x, avatar_url: newUrl } : x));
                                }}
                              />
                            ) : (
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={u.avatar_url || undefined} />
                                <AvatarFallback>{getInitials(u)}</AvatarFallback>
                              </Avatar>
                            )}
                            <div>
                              <span className="font-medium">{getDisplayName(u)}</span>
                              {globalRoles.length > 0 && (
                                <div className="flex gap-1 mt-0.5">
                                  {globalRoles.map(r => (
                                    <Badge key={r.id} variant={r.role === 'owner' ? 'default' : 'secondary'} className="text-[10px] h-4 px-1.5">
                                      {r.role}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          {proposalRoles.length === 0 ? (
                            <span className="text-muted-foreground text-sm">No proposal roles</span>
                          ) : (
                            <div className="space-y-1">
                              {proposalRoles.map(r => (
                                <div key={r.id} className="flex items-center gap-2">
                                  <span className="text-sm font-medium min-w-[80px]">{r.proposal_acronym || 'Unknown'}</span>
                                  {canManageProposalRole(r.proposal_id) ? (
                                    <Select
                                      value={r.role}
                                      onValueChange={(v) => handleChangeProposalRole(u, r.id, v, r.proposal_id)}
                                    >
                                      <SelectTrigger className="h-7 w-28 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="coordinator">Coordinator</SelectItem>
                                        <SelectItem value="editor">Editor</SelectItem>
                                        <SelectItem value="viewer">Viewer</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Badge variant="outline" className="text-xs capitalize">{r.role}</Badge>
                                  )}
                                  {canManageProposalRole(r.proposal_id) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() => handleRemoveRole(u, r.id, r.proposal_id)}
                                    >
                                      <Trash2 className="w-3 h-3 text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {assignableProposals.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(u);
                                setNewRole('editor');
                                setSelectedProposalId('');
                                setDialogOpen(true);
                              }}
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Add Role
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Add Role Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Proposal Role</DialogTitle>
              <DialogDescription>
                Add a proposal role to {selectedUser ? getDisplayName(selectedUser) : 'user'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Proposal</Label>
                <Select value={selectedProposalId} onValueChange={setSelectedProposalId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a proposal" />
                  </SelectTrigger>
                  <SelectContent>
                    {assignableProposals.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.acronym}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={newRole} onValueChange={setNewRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="coordinator">Coordinator - Full proposal management</SelectItem>
                    <SelectItem value="editor">Editor - Can edit proposal content</SelectItem>
                    <SelectItem value="viewer">Viewer - Can only view proposals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddRole} disabled={!selectedProposalId}>Add Role</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
