import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { 
  ProposalType, 
  BudgetType,
  SubmissionStage,
  WORK_PROGRAMMES, 
  getDestinationsForWorkProgramme,
} from "@/types/proposal";
import { useTemplates } from "@/hooks/useTemplates";
import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { FileText, Lightbulb, Users, Layers, Calculator, Rocket, ExternalLink, CalendarIcon, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
    topicUrl?: string;
    deadline?: Date;
    templateTypeId?: string;
    usesFstp?: boolean;
    isTwoStageSecondStage?: boolean;
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
  const { templateTypes, fundingProgrammes, loading: templatesLoading } = useTemplates();
  const [acronym, setAcronym] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<ProposalType>('RIA');
  const [budgetType, setBudgetType] = useState<BudgetType>('traditional');
  const [submissionStage, setSubmissionStage] = useState<SubmissionStage>('full');
  const [workProgramme, setWorkProgramme] = useState<string>('');
  const [destination, setDestination] = useState<string>('');
  const [topicUrl, setTopicUrl] = useState<string>('');
  const [deadline, setDeadline] = useState<Date | undefined>(undefined);
  const [templateTypeId, setTemplateTypeId] = useState<string>('');
  const [usesFstp, setUsesFstp] = useState<boolean>(false);
  const [isTwoStageSecondStage, setIsTwoStageSecondStage] = useState<boolean | null>(null);

  // Get destinations filtered by selected work programme
  const availableDestinations = useMemo(() => {
    if (!workProgramme) return [];
    return getDestinationsForWorkProgramme(workProgramme);
  }, [workProgramme]);

  // Filter template types based on selected action type and stage
  const filteredTemplateTypes = useMemo(() => {
    return templateTypes.filter(tt => {
      // Match template code with proposal type (RIA, IA, CSA)
      const typeMatch = tt.code.toUpperCase().includes(type);
      
      // For stage 1, look for templates that indicate stage 1
      if (submissionStage === 'stage_1') {
        return typeMatch && (tt.code.toLowerCase().includes('stage1') || tt.name.toLowerCase().includes('stage 1'));
      }
      
      // For full proposals, exclude stage 1 templates
      return typeMatch && !tt.code.toLowerCase().includes('stage1') && !tt.name.toLowerCase().includes('stage 1');
    });
  }, [templateTypes, type, submissionStage]);

  // Auto-select template if only one available
  useEffect(() => {
    if (filteredTemplateTypes.length === 1) {
      setTemplateTypeId(filteredTemplateTypes[0].id);
    } else if (!filteredTemplateTypes.find(t => t.id === templateTypeId)) {
      setTemplateTypeId('');
    }
  }, [filteredTemplateTypes, templateTypeId]);

  const handleWorkProgrammeChange = (value: string) => {
    setWorkProgramme(value);
    setDestination(''); // Reset destination when work programme changes
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (acronym) {
      toast.info('Creating your proposal — it will open shortly…', { duration: 5000 });
      onCreateProposal({ 
        acronym, 
        title, 
        type,
        budgetType,
        submissionStage,
        workProgramme: workProgramme || undefined,
        destination: destination || undefined,
        topicUrl: topicUrl || undefined,
        deadline: deadline || undefined,
        templateTypeId: templateTypeId || undefined,
        usesFstp,
        isTwoStageSecondStage: submissionStage === 'full' ? (isTwoStageSecondStage ?? false) : false,
      });
      // Reset form
      setAcronym('');
      setTitle('');
      setType('RIA');
      setBudgetType('traditional');
      setSubmissionStage('full');
      setWorkProgramme('');
      setDestination('');
      setTopicUrl('');
      setDeadline(undefined);
      setTemplateTypeId('');
      setUsesFstp(false);
      setIsTwoStageSecondStage(null);
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
                onChange={(e) => setAcronym(e.target.value)}
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
                onValueChange={(v) => {
                  setSubmissionStage(v as SubmissionStage);
                  if (v === 'stage_1') {
                    setIsTwoStageSecondStage(null);
                  }
                }}
                className="grid grid-cols-2 gap-3"
              >
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="stage_1" id="stage-1" />
                  <Label htmlFor="stage-1" className="cursor-pointer flex-1">
                    <span className="font-medium">Pre-Proposal</span>
                    <p className="text-xs text-muted-foreground">Stage 1 of 2</p>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="full" id="stage-full" />
                  <Label htmlFor="stage-full" className="cursor-pointer flex-1">
                    <span className="font-medium">Full Proposal</span>
                    <p className="text-xs text-muted-foreground">Single-stage or stage 2 of 2</p>
                  </Label>
                </div>
              </RadioGroup>

              {/* Two-stage question for full proposals */}
              {submissionStage === 'full' && (
                <div className="mt-2 p-3 border rounded-lg bg-muted/30">
                  <Label className="text-sm font-medium">
                    Is this proposal a one-stage proposal, or the second stage in a two-stage proposal?
                  </Label>
                  <RadioGroup 
                    value={isTwoStageSecondStage === true ? 'two_stage' : isTwoStageSecondStage === false ? 'one_stage' : ''}
                    onValueChange={(v) => setIsTwoStageSecondStage(v === 'two_stage')}
                    className="mt-2 flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="one_stage" id="one-stage" />
                      <Label htmlFor="one-stage" className="cursor-pointer font-normal">
                        One-stage proposal
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="two_stage" id="two-stage" />
                      <Label htmlFor="two-stage" className="cursor-pointer font-normal">
                        Second stage in a two-stage proposal
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
              )}
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

            {/* Template Type Selection */}
            {filteredTemplateTypes.length > 0 && (
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  Proposal Template
                </Label>
                <Select value={templateTypeId} onValueChange={setTemplateTypeId}>
                  <SelectTrigger>
                    <SelectValue placeholder={templatesLoading ? "Loading templates..." : "Select template (optional)"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTemplateTypes.map((tt) => (
                      <SelectItem key={tt.id} value={tt.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{tt.code}</span>
                          <span className="text-muted-foreground">-</span>
                          <span>{tt.name}</span>
                          {tt.funding_programme && (
                            <Badge variant="secondary" className="text-xs ml-1">
                              {tt.funding_programme.short_name || tt.funding_programme.name}
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {templateTypeId && (
                  <p className="text-xs text-green-600">
                    ✓ Template sections will be loaded automatically
                  </p>
                )}
                {!templateTypeId && filteredTemplateTypes.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Select a template to use predefined sections and guidelines
                  </p>
                )}
              </div>
            )}

            {templatesLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading available templates...
              </div>
            )}

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
                    <span className="font-medium">Actual costs</span>
                    <p className="text-xs text-muted-foreground">Detailed cost reporting</p>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="lump_sum" id="budget-lumpsum" />
                  <Label htmlFor="budget-lumpsum" className="cursor-pointer flex-1">
                    <span className="font-medium">Lump sum</span>
                    <p className="text-xs text-muted-foreground">Simplified budget model</p>
                  </Label>
                </div>
              </RadioGroup>
              
              {/* FSTP Checkbox */}
              <div className="flex items-center space-x-2 mt-1">
                <Checkbox 
                  id="uses-fstp" 
                  checked={usesFstp} 
                  onCheckedChange={(checked) => setUsesFstp(checked === true)}
                />
                <Label htmlFor="uses-fstp" className="text-sm cursor-pointer">
                  Financial support to third parties (FSTP) is possible under this topic
                </Label>
              </div>
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
                        <div className="flex flex-col items-start text-left">
                          <span className="font-medium">{dest.abbreviation}</span>
                          <span className="text-xs text-muted-foreground">{dest.fullName}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Topic URL */}
            <div className="grid gap-2">
              <Label htmlFor="topicUrl" className="flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
                Topic URL
              </Label>
              <Input
                id="topicUrl"
                type="url"
                placeholder="https://ec.europa.eu/info/funding-tenders/opportunities/portal/..."
                value={topicUrl}
                onChange={(e) => setTopicUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Link to the official call page on the Funding & Tenders Portal
              </p>
            </div>

            {/* Deadline */}
            <div className="grid gap-2">
              <Label className="flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                Submission Deadline
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !deadline && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {deadline ? format(deadline, "PPP") : <span>Select deadline (optional)</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={deadline}
                    onSelect={setDeadline}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                    disabled={(date) => date < new Date()}
                  />
                </PopoverContent>
              </Popover>
            </div>
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
