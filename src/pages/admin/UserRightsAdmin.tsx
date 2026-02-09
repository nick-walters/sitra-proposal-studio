import { useState, useEffect } from "react";
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
import { 
  Plus, 
  Pencil, 
  Trash2, 
  Users,
  Shield,
  Search
} from "lucide-react";
import { toast } from "sonner";
import type { AppRole } from "@/types/templates";

interface UserWithRoles {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  roles: {
    id: string;
    role: AppRole;
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
  const { isAdminOrOwner, isOwner, loading: roleLoading } = useUserRole();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [newRole, setNewRole] = useState<AppRole>("viewer");
  const [roleScope, setRoleScope] = useState<'global' | 'proposal'>('global');
  const [selectedProposalId, setSelectedProposalId] = useState<string>("");
  const [proposals, setProposals] = useState<ProposalOption[]>([]);

  // Redirect non-admins
  useEffect(() => {
    if (!roleLoading && !isAdminOrOwner) {
      toast.error("Access denied. Admin or Owner role required.");
      navigate("/dashboard");
    }
  }, [isAdminOrOwner, roleLoading, navigate]);

  // Fetch users with their roles and proposals
  useEffect(() => {
    const fetchUsers = async () => {
      setLoading(true);
      try {
        // Fetch profiles, roles, and proposals in parallel
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

        const usersWithRoles: UserWithRoles[] = (profilesRes.data || []).map(profile => ({
          ...profile,
          roles: (rolesRes.data || [])
            .filter(r => r.user_id === profile.id)
            .map(r => ({
              id: r.id,
              role: r.role as AppRole,
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

    if (isAdminOrOwner) {
      fetchUsers();
    }
  }, [isAdminOrOwner]);

  const getDisplayName = (user: UserWithRoles) => {
    if (user.first_name && user.last_name) return `${user.first_name} ${user.last_name}`;
    if (user.full_name) return user.full_name;
    return user.email;
  };

  const getInitials = (user: UserWithRoles) => {
    if (user.first_name && user.last_name) {
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    }
    if (user.full_name) {
      const parts = user.full_name.split(' ');
      return parts.length > 1 
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : user.full_name[0].toUpperCase();
    }
    return user.email[0].toUpperCase();
  };

  const getGlobalRoles = (user: UserWithRoles) => {
    return user.roles.filter(r => !r.proposal_id);
  };

  const handleAddRole = async () => {
    if (!selectedUser) return;
    if (roleScope === 'proposal' && !selectedProposalId) {
      toast.error('Please select a proposal');
      return;
    }

    try {
      const insertData: any = {
        user_id: selectedUser.id,
        role: newRole,
      };
      if (roleScope === 'proposal') {
        insertData.proposal_id = selectedProposalId;
      }

      const { error } = await supabase
        .from('user_roles')
        .insert(insertData);

      if (error) throw error;

      // Refresh the user's roles
      const { data: updatedRoles } = await supabase
        .from('user_roles')
        .select('id, role, proposal_id')
        .eq('user_id', selectedUser.id);

      const proposalMap = new Map<string, string>();
      proposals.forEach(p => proposalMap.set(p.id, p.acronym));

      setUsers(prev => prev.map(u => 
        u.id === selectedUser.id 
          ? { ...u, roles: (updatedRoles || []).map(r => ({ 
              id: r.id, 
              role: r.role as AppRole, 
              proposal_id: r.proposal_id,
              proposal_acronym: r.proposal_id ? proposalMap.get(r.proposal_id) || null : null,
            })) }
          : u
      ));

      const scopeLabel = roleScope === 'proposal' 
        ? proposals.find(p => p.id === selectedProposalId)?.acronym || 'proposal'
        : 'global';
      toast.success(`Added ${newRole} role (${scopeLabel}) to ${getDisplayName(selectedUser)}`);
      setDialogOpen(false);
    } catch (error) {
      console.error('Error adding role:', error);
      toast.error("Failed to add role");
    }
  };

  const handleRemoveRole = async (user: UserWithRoles, roleId: string) => {
    if (!isOwner) {
      toast.error("Only owners can remove roles");
      return;
    }

    if (confirm("Are you sure you want to remove this role?")) {
      try {
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('id', roleId);

        if (error) throw error;

        setUsers(prev => prev.map(u => 
          u.id === user.id 
            ? { ...u, roles: u.roles.filter(r => r.id !== roleId) }
            : u
        ));

        toast.success("Role removed");
      } catch (error) {
        console.error('Error removing role:', error);
        toast.error("Failed to remove role");
      }
    }
  };

  const filteredUsers = users.filter(user => {
    const searchLower = searchQuery.toLowerCase();
    return (
      user.email.toLowerCase().includes(searchLower) ||
      (user.full_name?.toLowerCase().includes(searchLower)) ||
      (user.first_name?.toLowerCase().includes(searchLower)) ||
      (user.last_name?.toLowerCase().includes(searchLower))
    );
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

  if (!isAdminOrOwner) {
    return null;
  }

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
            Manage user roles and permissions across the platform
          </p>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Users</CardTitle>
              <CardDescription>
                {users.length} registered users
              </CardDescription>
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
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
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
                    <TableHead>Global Roles</TableHead>
                    <TableHead>Proposal Roles</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => {
                    const globalRoles = getGlobalRoles(user);
                    const proposalRoles = user.roles.filter(r => r.proposal_id);
                    
                    return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            {isOwner ? (
                              <AdminAvatarUpload
                                userId={user.id}
                                avatarUrl={user.avatar_url}
                                initials={getInitials(user)}
                                onAvatarChange={(uid, newUrl) => {
                                  setUsers(prev => prev.map(u => u.id === uid ? { ...u, avatar_url: newUrl } : u));
                                }}
                              />
                            ) : (
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={user.avatar_url || undefined} />
                                <AvatarFallback>{getInitials(user)}</AvatarFallback>
                              </Avatar>
                            )}
                            <span className="font-medium">{getDisplayName(user)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.email}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {globalRoles.length === 0 ? (
                              <span className="text-muted-foreground text-sm">None</span>
                            ) : (
                              globalRoles.map(r => (
                                <Badge 
                                  key={r.id} 
                                  variant={r.role === 'owner' ? 'default' : r.role === 'admin' ? 'secondary' : 'outline'}
                                  className="gap-1"
                                >
                                  {r.role}
                                  {isOwner && (
                                    <button 
                                      onClick={() => handleRemoveRole(user, r.id)}
                                      className="hover:text-destructive ml-1"
                                    >
                                      ×
                                    </button>
                                  )}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {proposalRoles.length === 0 ? (
                              <span className="text-muted-foreground text-sm">None</span>
                            ) : (
                              proposalRoles.map(r => (
                                <Badge 
                                  key={r.id} 
                                  variant="outline"
                                  className="gap-1"
                                >
                                  {r.proposal_acronym || 'Unknown'}: {r.role}
                                  {isOwner && (
                                    <button 
                                      onClick={() => handleRemoveRole(user, r.id)}
                                      className="hover:text-destructive ml-1"
                                    >
                                      ×
                                    </button>
                                  )}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {isOwner && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user);
                                setNewRole('viewer');
                                setRoleScope('global');
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
              <DialogTitle>Add Role</DialogTitle>
              <DialogDescription>
                Add a role to {selectedUser ? getDisplayName(selectedUser) : 'user'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select value={roleScope} onValueChange={(v) => setRoleScope(v as 'global' | 'proposal')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global - Applies across the platform</SelectItem>
                    <SelectItem value="proposal">Proposal - Specific to one proposal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {roleScope === 'proposal' && (
                <div className="space-y-2">
                  <Label>Proposal</Label>
                  <Select value={selectedProposalId} onValueChange={setSelectedProposalId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a proposal" />
                    </SelectTrigger>
                    <SelectContent>
                      {proposals.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.acronym}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={newRole} onValueChange={(v) => setNewRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roleScope === 'global' && (
                      <SelectItem value="owner">Owner - Full access including template management</SelectItem>
                    )}
                    <SelectItem value="admin">Admin - Can manage proposals and users</SelectItem>
                    <SelectItem value="editor">Editor - Can edit proposal content</SelectItem>
                    <SelectItem value="viewer">Viewer - Can only view proposals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddRole}>Add Role</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
