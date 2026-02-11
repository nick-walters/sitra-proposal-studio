import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';
import { CountrySelect } from '@/components/CountrySelect';
import {
  ParticipantResearcher,
  CAREER_STAGES,
  CONTACT_TITLES,
  GENDER_OPTIONS,
  IDENTIFIER_TYPES,
} from '@/types/participantDetails';

interface CopyToResearcherDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: {
    firstName: string;
    lastName: string;
    email: string;
    roleInProject: string;
  };
  onConfirm: (researcher: Omit<ParticipantResearcher, 'id' | 'createdAt' | 'updatedAt'>) => void;
  participantId: string;
  nextOrderIndex: number;
}

export function CopyToResearcherDialog({
  open,
  onOpenChange,
  initialData,
  onConfirm,
  participantId,
  nextOrderIndex,
}: CopyToResearcherDialogProps) {
  const [form, setForm] = useState({
    title: '',
    firstName: initialData.firstName,
    lastName: initialData.lastName,
    gender: '',
    nationality: '',
    email: initialData.email,
    careerStage: '',
    roleInProject: initialData.roleInProject,
    referenceIdentifier: '',
    identifierType: '',
  });

  // Reset form whenever initialData changes (new CP selected)
  useEffect(() => {
    setForm({
      title: '',
      firstName: initialData.firstName,
      lastName: initialData.lastName,
      gender: '',
      nationality: '',
      email: initialData.email,
      careerStage: '',
      roleInProject: initialData.roleInProject,
      referenceIdentifier: '',
      identifierType: '',
    });
  }, [initialData.firstName, initialData.lastName, initialData.email, initialData.roleInProject]);

  const isValid =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.gender &&
    form.nationality &&
    form.email.trim() &&
    form.careerStage;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm({
      participantId,
      ...form,
      orderIndex: nextOrderIndex,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Copy to Researchers List</DialogTitle>
          <DialogDescription>
            Complete all required fields before adding this person as a researcher.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 py-4">
          <div className="space-y-2">
            <Label>Title *</Label>
            <Select value={form.title} onValueChange={(v) => setForm({ ...form, title: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {CONTACT_TITLES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>First name *</Label>
            <Input
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              placeholder="First name"
            />
          </div>
          <div className="space-y-2">
            <Label>Last name *</Label>
            <Input
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              placeholder="Last name"
            />
          </div>
          <div className="space-y-2">
            <Label>Gender *</Label>
            <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((g) => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Nationality *</Label>
            <CountrySelect
              value={form.nationality}
              onValueChange={(v) => setForm({ ...form, nationality: v })}
            />
          </div>
          <div className="space-y-2">
            <Label>Email *</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="researcher@university.eu"
            />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Career stage *
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-3 h-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <div className="space-y-2 text-xs">
                      {CAREER_STAGES.map((stage) => (
                        <div key={stage.value}>
                          <strong>{stage.label}:</strong> {stage.description}
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Select value={form.careerStage} onValueChange={(v) => setForm({ ...form, careerStage: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select stage" />
              </SelectTrigger>
              <SelectContent>
                {CAREER_STAGES.map((stage) => (
                  <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Role in project</Label>
            <Input
              value={form.roleInProject}
              onChange={(e) => setForm({ ...form, roleInProject: e.target.value })}
              placeholder="e.g., Team member"
            />
          </div>
          <div className="space-y-2">
            <Label>Identifier type</Label>
            <Select value={form.identifierType} onValueChange={(v) => setForm({ ...form, identifierType: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {IDENTIFIER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Reference identifier</Label>
            <Input
              value={form.referenceIdentifier}
              onChange={(e) => setForm({ ...form, referenceIdentifier: e.target.value })}
              placeholder="e.g., 0000-0001-2345-6789"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid}>
            Add Researcher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
