import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { 
  ProposalType, 
  BudgetType,
  SubmissionStage,
  WORK_PROGRAMMES, 
  getDestinationsForWorkProgramme,
  SUBMISSION_STAGE_LABELS
} from "@/types/proposal";
import { useState, useMemo } from "react";
import { FileText, Beaker, Lightbulb, Users, Layers, Calculator, Rocket } from "lucide-react";

interface CreateProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateProposal: (data: { 
    acronym: string; 
    title: string; 
    type: ProposalType;
    budgetType: BudgetType;
    submissionStage: SubmissionStage;
    workProgramme?: string;
    destination?: string;
  }) => void;
}

const proposalTypes = [
  {
    value: 'RIA' as ProposalType,
    label: 'Research & Innovation Action (RIA)',
    description: 'Primarily research activities with some innovation elements',
    icon: Lightbulb,
  },
  {
    value: 'IA' as ProposalType,
    label: 'Innovation Action (IA)',
    description: 'Primarily innovation activities, closer to market',
    icon: Rocket,
  },
  {
    value: 'CSA' as ProposalType,
    label: 'Coordination & Support Action (CSA)',
    description: 'Supporting and coordination measures',
    icon: Users,
  },
];

export function CreateProposalDialog({
  open,
  onOpenChange,
  onCreateProposal,
}: CreateProposalDialogProps) {
  const [acronym, setAcronym] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ProposalType>('RIA');
  const [budgetType, setBudgetType] = useState<BudgetType>('traditional');
  const [submissionStage, setSubmissionStage] = useState<SubmissionStage>('full');
  const [workProgramme, setWorkProgramme] = useState<string>('');
  const [destination, setDestination] = useState<string>('');

  // Get destinations filtered by selected work programme
  const availableDestinations = useMemo(() => {
    if (!workProgramme) return [];
    return getDestinationsForWorkProgramme(workProgramme);
  }, [workProgramme]);

  const handleWorkProgrammeChange = (value: string) => {
    setWorkProgramme(value);
    setDestination(''); // Reset destination when work programme changes
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (acronym) {
      onCreateProposal({ 
        acronym, 
        title, 
        type,
        budgetType,
        submissionStage,
        workProgramme: workProgramme || undefined,
        destination: destination || undefined,
      });
      // Reset form
      setAcronym('');
      setTitle('');
      setType('RIA');
      setBudgetType('traditional');
      setSubmissionStage('full');
      setWorkProgramme('');
      setDestination('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            Create New Proposal
          </DialogTitle>
          <DialogDescription>
            Start a new Horizon Europe funding proposal. You can invite collaborators after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-5 py-4">
            {/* Basic Info */}
            <div className="grid gap-2">
              <Label htmlFor="acronym">Proposal Acronym *</Label>
              <Input
                id="acronym"
                placeholder="e.g. INNOVATE"
                value={acronym}
                onChange={(e) => setAcronym(e.target.value.toUpperCase())}
                className="font-semibold w-48"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="title">Full Title</Label>
              <textarea
                id="title"
                placeholder="Enter the full proposal title (optional)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>

            {/* Submission Stage */}
            <div className="grid gap-3">
              <Label className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                Submission Stage
              </Label>
              <RadioGroup 
                value={submissionStage} 
                onValueChange={(v) => setSubmissionStage(v as SubmissionStage)}
                className="grid grid-cols-2 gap-3"
              >
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="stage_1" id="stage-1" />
                  <Label htmlFor="stage-1" className="cursor-pointer flex-1">
                    <span className="font-medium">Stage 1 of 2</span>
                    <p className="text-xs text-muted-foreground">Two-stage submission process</p>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="full" id="stage-full" />
                  <Label htmlFor="stage-full" className="cursor-pointer flex-1">
                    <span className="font-medium">Full Proposal</span>
                    <p className="text-xs text-muted-foreground">Single-stage submission</p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Proposal Type */}
            <div className="grid gap-2">
              <Label>Action Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ProposalType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select action type" />
                </SelectTrigger>
                <SelectContent>
                  {proposalTypes.map((pt) => (
                    <SelectItem key={pt.value} value={pt.value}>
                      <div className="flex items-center gap-2">
                        <pt.icon className="w-4 h-4 text-muted-foreground" />
                        <span>{pt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {proposalTypes.find((pt) => pt.value === type)?.description}
              </p>
            </div>

            {/* Budget Type */}
            <div className="grid gap-3">
              <Label className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-muted-foreground" />
                Budget Template
              </Label>
              <RadioGroup 
                value={budgetType} 
                onValueChange={(v) => setBudgetType(v as BudgetType)}
                className="grid grid-cols-2 gap-3"
              >
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="traditional" id="budget-traditional" />
                  <Label htmlFor="budget-traditional" className="cursor-pointer flex-1">
                    <span className="font-medium">Standard Budget</span>
                    <p className="text-xs text-muted-foreground">Detailed cost reporting</p>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="lump_sum" id="budget-lumpsum" />
                  <Label htmlFor="budget-lumpsum" className="cursor-pointer flex-1">
                    <span className="font-medium">Lump Sum</span>
                    <p className="text-xs text-muted-foreground">Simplified budget model</p>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Work Programme */}
            <div className="grid gap-2">
              <Label>Work Programme</Label>
              <Select value={workProgramme} onValueChange={handleWorkProgrammeChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select work programme (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {WORK_PROGRAMMES.map((wp) => (
                    <SelectItem key={wp.id} value={wp.id}>
                      <span>{wp.fullName}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Destination */}
            {workProgramme && availableDestinations.length > 0 && (
              <div className="grid gap-2">
                <Label>Destination</Label>
                <Select value={destination} onValueChange={setDestination}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDestinations.map((dest) => (
                      <SelectItem key={dest.id} value={dest.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">{dest.abbreviation}</span>
                          <span className="text-xs text-muted-foreground">{dest.fullName}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!acronym}>
              Create Proposal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
