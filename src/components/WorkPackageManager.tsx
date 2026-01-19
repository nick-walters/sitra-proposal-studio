import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Participant, ParticipantMember } from '@/types/proposal';
import { Plus, Trash2, Boxes, Users, Save, Loader2 } from 'lucide-react';

interface WorkPackage {
  id: string;
  proposalId: string;
  number: number;
  title: string;
  description?: string;
  leadParticipantId?: string;
  startMonth: number;
  endMonth: number;
}

interface MemberAllocation {
  id: string;
  memberId: string;
  workPackageId: string;
  personMonths: number;
  role?: string;
}

interface WorkPackageManagerProps {
  proposalId: string;
  participants: Participant[];
  participantMembers: ParticipantMember[];
  canEdit: boolean;
}

export function WorkPackageManager({
  proposalId,
  participants,
  participantMembers,
  canEdit,
}: WorkPackageManagerProps) {
  const [workPackages, setWorkPackages] = useState<WorkPackage[]>([]);
  const [allocations, setAllocations] = useState<MemberAllocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newWP, setNewWP] = useState({
    title: '',
    description: '',
    leadParticipantId: '',
    startMonth: 1,
    endMonth: 36,
  });

  useEffect(() => {
    fetchData();
  }, [proposalId]);

  const fetchData = async () => {
    try {
      const [wpRes, allocRes] = await Promise.all([
        supabase
          .from('work_packages')
          .select('*')
          .eq('proposal_id', proposalId)
          .order('number'),
        supabase
          .from('member_wp_allocations')
          .select('*'),
      ]);

      if (wpRes.error) throw wpRes.error;
      if (allocRes.error) throw allocRes.error;

      setWorkPackages(
        wpRes.data.map((wp) => ({
          id: wp.id,
          proposalId: wp.proposal_id,
          number: wp.number,
          title: wp.title,
          description: wp.description || undefined,
          leadParticipantId: wp.lead_participant_id || undefined,
          startMonth: wp.start_month || 1,
          endMonth: wp.end_month || 36,
        }))
      );

      setAllocations(
        allocRes.data.map((a) => ({
          id: a.id,
          memberId: a.member_id,
          workPackageId: a.work_package_id,
          personMonths: a.person_months,
          role: a.role || undefined,
        }))
      );
    } catch (error) {
      console.error('Error fetching work packages:', error);
      toast.error('Failed to load work packages');
    } finally {
      setLoading(false);
    }
  };

  const addWorkPackage = async () => {
    if (!newWP.title) {
      toast.error('Work package title is required');
      return;
    }

    setSaving(true);
    try {
      const nextNumber = workPackages.length + 1;
      const { error } = await supabase.from('work_packages').insert({
        proposal_id: proposalId,
        number: nextNumber,
        title: newWP.title,
        description: newWP.description || null,
        lead_participant_id: newWP.leadParticipantId || null,
        start_month: newWP.startMonth,
        end_month: newWP.endMonth,
      });

      if (error) throw error;

      toast.success('Work package added');
      setIsAddDialogOpen(false);
      setNewWP({ title: '', description: '', leadParticipantId: '', startMonth: 1, endMonth: 36 });
      fetchData();
    } catch (error) {
      console.error('Error adding work package:', error);
      toast.error('Failed to add work package');
    } finally {
      setSaving(false);
    }
  };

  const deleteWorkPackage = async (wpId: string) => {
    try {
      const { error } = await supabase.from('work_packages').delete().eq('id', wpId);
      if (error) throw error;
      toast.success('Work package deleted');
      fetchData();
    } catch (error) {
      console.error('Error deleting work package:', error);
      toast.error('Failed to delete work package');
    }
  };

  const updateAllocation = async (memberId: string, wpId: string, personMonths: number) => {
    try {
      const existing = allocations.find((a) => a.memberId === memberId && a.workPackageId === wpId);

      if (personMonths === 0 && existing) {
        const { error } = await supabase.from('member_wp_allocations').delete().eq('id', existing.id);
        if (error) throw error;
      } else if (existing) {
        const { error } = await supabase
          .from('member_wp_allocations')
          .update({ person_months: personMonths })
          .eq('id', existing.id);
        if (error) throw error;
      } else if (personMonths > 0) {
        const { error } = await supabase.from('member_wp_allocations').insert({
          member_id: memberId,
          work_package_id: wpId,
          person_months: personMonths,
        });
        if (error) throw error;
      }

      // Update local state
      setAllocations((prev) => {
        const filtered = prev.filter((a) => !(a.memberId === memberId && a.workPackageId === wpId));
        if (personMonths > 0) {
          return [...filtered, { id: existing?.id || 'temp', memberId, workPackageId: wpId, personMonths }];
        }
        return filtered;
      });
    } catch (error) {
      console.error('Error updating allocation:', error);
      toast.error('Failed to update allocation');
    }
  };

  const getAllocation = (memberId: string, wpId: string): number => {
    return allocations.find((a) => a.memberId === memberId && a.workPackageId === wpId)?.personMonths || 0;
  };

  const getTotalPMForMember = (memberId: string): number => {
    return allocations
      .filter((a) => a.memberId === memberId)
      .reduce((sum, a) => sum + a.personMonths, 0);
  };

  const getTotalPMForWP = (wpId: string): number => {
    return allocations
      .filter((a) => a.workPackageId === wpId)
      .reduce((sum, a) => sum + a.personMonths, 0);
  };

  if (loading) {
    return (
      <div className="flex-1 p-6 bg-muted/30 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 bg-muted/30">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Boxes className="w-6 h-6" />
              Work Packages & Team Allocation
            </h1>
            <p className="text-muted-foreground">
              Define work packages and allocate person-months for team members
            </p>
          </div>
          {canEdit && (
            <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Work Package
            </Button>
          )}
        </div>

        {/* Work Package Summary Cards */}
        {workPackages.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workPackages.map((wp) => {
              const lead = participants.find((p) => p.id === wp.leadParticipantId);
              return (
                <Card key={wp.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary">WP{wp.number}</Badge>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteWorkPackage(wp.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                    <CardTitle className="text-base">{wp.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground space-y-1">
                    <p>M{wp.startMonth} - M{wp.endMonth}</p>
                    {lead && <p>Lead: {lead.organisationShortName || lead.organisationName}</p>}
                    <p className="font-medium text-foreground">{getTotalPMForWP(wp.id)} PM</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Allocation Matrix */}
        {workPackages.length > 0 && participantMembers.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Person-Month Allocation Matrix
              </CardTitle>
              <CardDescription>
                Enter person-months for each team member per work package
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">Team Member</TableHead>
                      <TableHead className="min-w-[150px]">Organisation</TableHead>
                      {workPackages.map((wp) => (
                        <TableHead key={wp.id} className="text-center min-w-[80px]">
                          WP{wp.number}
                        </TableHead>
                      ))}
                      <TableHead className="text-center font-bold">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participants.map((participant) => {
                      const members = participantMembers.filter((m) => m.participantId === participant.id);
                      return members.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">{member.fullName}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {participant.organisationShortName || participant.organisationName}
                          </TableCell>
                          {workPackages.map((wp) => (
                            <TableCell key={wp.id} className="p-1">
                              <Input
                                type="number"
                                min="0"
                                step="0.5"
                                className="w-16 h-8 text-center mx-auto"
                                value={getAllocation(member.id, wp.id) || ''}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 0;
                                  updateAllocation(member.id, wp.id, value);
                                }}
                                disabled={!canEdit}
                              />
                            </TableCell>
                          ))}
                          <TableCell className="text-center font-bold">
                            {getTotalPMForMember(member.id)}
                          </TableCell>
                        </TableRow>
                      ));
                    })}
                    {/* Totals row */}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={2}>Total per WP</TableCell>
                      {workPackages.map((wp) => (
                        <TableCell key={wp.id} className="text-center">
                          {getTotalPMForWP(wp.id)}
                        </TableCell>
                      ))}
                      <TableCell className="text-center">
                        {allocations.reduce((sum, a) => sum + a.personMonths, 0)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {workPackages.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Boxes className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-medium text-muted-foreground">No work packages defined</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Add work packages to start allocating team effort
              </p>
              {canEdit && (
                <Button onClick={() => setIsAddDialogOpen(true)} className="mt-4 gap-2">
                  <Plus className="w-4 h-4" />
                  Add Work Package
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Add Work Package Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Add Work Package</DialogTitle>
              <DialogDescription>
                Define a new work package for the project
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="wp-title">Title *</Label>
                <Input
                  id="wp-title"
                  value={newWP.title}
                  onChange={(e) => setNewWP({ ...newWP, title: e.target.value })}
                  placeholder="e.g., Project Management"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wp-desc">Description</Label>
                <Textarea
                  id="wp-desc"
                  value={newWP.description}
                  onChange={(e) => setNewWP({ ...newWP, description: e.target.value })}
                  placeholder="Brief description of work package objectives..."
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label>Lead Participant</Label>
                <Select
                  value={newWP.leadParticipantId}
                  onValueChange={(v) => setNewWP({ ...newWP, leadParticipantId: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select lead..." />
                  </SelectTrigger>
                  <SelectContent>
                    {participants.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.organisationShortName || p.organisationName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start-month">Start Month</Label>
                  <Input
                    id="start-month"
                    type="number"
                    min="1"
                    value={newWP.startMonth}
                    onChange={(e) => setNewWP({ ...newWP, startMonth: parseInt(e.target.value) || 1 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-month">End Month</Label>
                  <Input
                    id="end-month"
                    type="number"
                    min="1"
                    value={newWP.endMonth}
                    onChange={(e) => setNewWP({ ...newWP, endMonth: parseInt(e.target.value) || 36 })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={addWorkPackage} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Work Package
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
