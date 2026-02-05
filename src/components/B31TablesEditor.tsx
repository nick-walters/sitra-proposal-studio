import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';

interface B31TablesEditorProps {
  proposalId: string;
}

interface Milestone {
  id: string;
  number: number;
  name: string;
  wps: string;
  due_month: number | null;
  means_of_verification: string;
}

interface Risk {
  id: string;
  number: number;
  description: string;
  wps: string;
  likelihood: 'L' | 'M' | 'H' | null;
  severity: 'L' | 'M' | 'H' | null;
  mitigation: string;
}

// Generate month options M01 to M72
const monthOptions = Array.from({ length: 72 }, (_, i) => ({
  value: i + 1,
  label: `M${String(i + 1).padStart(2, '0')}`,
}));

// Risk level options with colors
const riskLevelOptions = [
  { value: 'L', label: 'Low', color: 'bg-green-500' },
  { value: 'M', label: 'Medium', color: 'bg-amber-500' },
  { value: 'H', label: 'High', color: 'bg-red-500' },
];

function RiskBadge({ level, type }: { level: 'L' | 'M' | 'H' | null; type: 'likelihood' | 'severity' }) {
  if (!level) return null;
  const option = riskLevelOptions.find(o => o.value === level);
  if (!option) return null;
  
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-medium ${option.color}`}>
      {level}
    </span>
  );
}

function RiskLevelSelect({ 
  value, 
  onChange, 
  type 
}: { 
  value: 'L' | 'M' | 'H' | null; 
  onChange: (val: 'L' | 'M' | 'H' | null) => void;
  type: 'likelihood' | 'severity';
}) {
  return (
    <Select value={value || ''} onValueChange={(v) => onChange(v as 'L' | 'M' | 'H' || null)}>
      <SelectTrigger className="w-16 h-7 px-1">
        <SelectValue>
          {value ? <RiskBadge level={value} type={type} /> : '-'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-background z-50">
        {riskLevelOptions.map(opt => (
          <SelectItem key={opt.value} value={opt.value}>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-white text-xs font-medium ${opt.color}`}>
                {opt.value}
              </span>
              <span>{opt.label} ({type})</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MonthSelect({ 
  value, 
  onChange 
}: { 
  value: number | null; 
  onChange: (val: number | null) => void;
}) {
  return (
    <Select 
      value={value?.toString() || ''} 
      onValueChange={(v) => onChange(v ? parseInt(v) : null)}
    >
      <SelectTrigger className="w-20 h-7 px-2">
        <SelectValue placeholder="-">
          {value ? `M${String(value).padStart(2, '0')}` : '-'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-background z-50 max-h-60">
        {monthOptions.map(opt => (
          <SelectItem key={opt.value} value={opt.value.toString()}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function B31MilestonesTable({ proposalId }: { proposalId: string }) {
  const queryClient = useQueryClient();
  
  const { data: milestones = [], isLoading } = useQuery({
    queryKey: ['b31-milestones', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('b31_milestones')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('number');
      if (error) throw error;
      return data as Milestone[];
    },
  });

  const updateMilestone = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Milestone> & { id: string }) => {
      const { error } = await supabase
        .from('b31_milestones')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-milestones', proposalId] }),
  });

  const addMilestone = useMutation({
    mutationFn: async () => {
      const nextNumber = milestones.length + 1;
      const { error } = await supabase
        .from('b31_milestones')
        .insert({ proposal_id: proposalId, number: nextNumber, name: '', wps: '', means_of_verification: '' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-milestones', proposalId] }),
  });

  const deleteMilestone = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('b31_milestones')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-milestones', proposalId] }),
  });

  const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
  const cellStyles = "border border-black p-[0.03pt]";

  return (
    <div className="space-y-2">
      <p className={`${tableStyles} italic mt-4 mb-1`}>
        <span className="font-bold italic">Table 3.1d.</span> List of milestones
      </p>
      <Table className={tableStyles}>
        <TableHeader>
          <TableRow className="bg-black text-white hover:bg-black">
            <TableHead className={`${cellStyles} text-white font-bold w-[40%]`}>Milestone</TableHead>
            <TableHead className={`${cellStyles} text-white font-bold w-[20%]`}>WPs</TableHead>
            <TableHead className={`${cellStyles} text-white font-bold w-[10%]`}>Due</TableHead>
            <TableHead className={`${cellStyles} text-white font-bold w-[25%]`}>Means of verification</TableHead>
            <TableHead className={`${cellStyles} text-white font-bold w-[5%]`}></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {milestones.map((ms) => (
            <TableRow key={ms.id} className="hover:bg-muted/50">
              <TableCell className={cellStyles}>
                <div className="flex items-center gap-1">
                  <span className="font-medium shrink-0">MS{ms.number}:</span>
                  <Input
                    value={ms.name}
                    onChange={(e) => updateMilestone.mutate({ id: ms.id, name: e.target.value })}
                    className="h-7 border-0 p-0 focus-visible:ring-0 bg-transparent"
                    placeholder="Milestone name"
                  />
                </div>
              </TableCell>
              <TableCell className={cellStyles}>
                <Input
                  value={ms.wps}
                  onChange={(e) => updateMilestone.mutate({ id: ms.id, wps: e.target.value })}
                  className="h-7 border-0 p-0 focus-visible:ring-0 bg-transparent"
                  placeholder="1, 2, 3"
                />
              </TableCell>
              <TableCell className={cellStyles}>
                <MonthSelect
                  value={ms.due_month}
                  onChange={(val) => updateMilestone.mutate({ id: ms.id, due_month: val })}
                />
              </TableCell>
              <TableCell className={cellStyles}>
                <Input
                  value={ms.means_of_verification}
                  onChange={(e) => updateMilestone.mutate({ id: ms.id, means_of_verification: e.target.value })}
                  className="h-7 border-0 p-0 focus-visible:ring-0 bg-transparent"
                  placeholder="How will this be verified?"
                />
              </TableCell>
              <TableCell className={cellStyles}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => deleteMilestone.mutate(ms.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button variant="outline" size="sm" onClick={() => addMilestone.mutate()} className="mt-2">
        <Plus className="h-4 w-4 mr-1" /> Add milestone
      </Button>
    </div>
  );
}

export function B31RisksTable({ proposalId }: { proposalId: string }) {
  const queryClient = useQueryClient();
  
  const { data: risks = [], isLoading } = useQuery({
    queryKey: ['b31-risks', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('b31_risks')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('number');
      if (error) throw error;
      return data as Risk[];
    },
  });

  const updateRisk = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Risk> & { id: string }) => {
      const { error } = await supabase
        .from('b31_risks')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-risks', proposalId] }),
  });

  const addRisk = useMutation({
    mutationFn: async () => {
      const nextNumber = risks.length + 1;
      const { error } = await supabase
        .from('b31_risks')
        .insert({ proposal_id: proposalId, number: nextNumber, description: '', wps: '', mitigation: '' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-risks', proposalId] }),
  });

  const deleteRisk = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('b31_risks')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['b31-risks', proposalId] }),
  });

  const tableStyles = "font-['Times_New_Roman',Times,serif] text-[11pt]";
  const cellStyles = "border border-black p-[0.03pt]";

  return (
    <div className="space-y-2">
      <p className={`${tableStyles} italic mt-4 mb-1`}>
        <span className="font-bold italic">Table 3.1e.</span> Critical risks (i. likelihood; ii. severity; L = low, M = medium, H = high)
      </p>
      <Table className={tableStyles}>
        <TableHeader>
          <TableRow className="bg-black text-white hover:bg-black">
            <TableHead className={`${cellStyles} text-white font-bold w-[35%]`}>Risk</TableHead>
            <TableHead className={`${cellStyles} text-white font-bold w-[10%]`}>WPs</TableHead>
            <TableHead className={`${cellStyles} text-white font-bold w-[8%] text-center`}>i.</TableHead>
            <TableHead className={`${cellStyles} text-white font-bold w-[8%] text-center`}>ii.</TableHead>
            <TableHead className={`${cellStyles} text-white font-bold w-[34%]`}>Mitigation & adaptation measures</TableHead>
            <TableHead className={`${cellStyles} text-white font-bold w-[5%]`}></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {risks.map((risk) => (
            <TableRow key={risk.id} className="hover:bg-muted/50">
              <TableCell className={cellStyles}>
                <Input
                  value={risk.description}
                  onChange={(e) => updateRisk.mutate({ id: risk.id, description: e.target.value })}
                  className="h-7 border-0 p-0 focus-visible:ring-0 bg-transparent"
                  placeholder="Description of risk"
                />
              </TableCell>
              <TableCell className={cellStyles}>
                <Input
                  value={risk.wps}
                  onChange={(e) => updateRisk.mutate({ id: risk.id, wps: e.target.value })}
                  className="h-7 border-0 p-0 focus-visible:ring-0 bg-transparent w-16"
                  placeholder="1, 2"
                />
              </TableCell>
              <TableCell className={`${cellStyles} text-center`}>
                <RiskLevelSelect
                  value={risk.likelihood}
                  onChange={(val) => updateRisk.mutate({ id: risk.id, likelihood: val })}
                  type="likelihood"
                />
              </TableCell>
              <TableCell className={`${cellStyles} text-center`}>
                <RiskLevelSelect
                  value={risk.severity}
                  onChange={(val) => updateRisk.mutate({ id: risk.id, severity: val })}
                  type="severity"
                />
              </TableCell>
              <TableCell className={cellStyles}>
                <Input
                  value={risk.mitigation}
                  onChange={(e) => updateRisk.mutate({ id: risk.id, mitigation: e.target.value })}
                  className="h-7 border-0 p-0 focus-visible:ring-0 bg-transparent"
                  placeholder="Proposed mitigation measures"
                />
              </TableCell>
              <TableCell className={cellStyles}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => deleteRisk.mutate(risk.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button variant="outline" size="sm" onClick={() => addRisk.mutate()} className="mt-2">
        <Plus className="h-4 w-4 mr-1" /> Add risk
      </Button>
    </div>
  );
}

export function B31TablesEditor({ proposalId }: B31TablesEditorProps) {
  return (
    <div className="space-y-8">
      <B31MilestonesTable proposalId={proposalId} />
      <B31RisksTable proposalId={proposalId} />
    </div>
  );
}
