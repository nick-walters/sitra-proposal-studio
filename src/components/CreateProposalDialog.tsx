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
import { ProposalType } from "@/types/proposal";
import { useState } from "react";
import { FileText, Beaker, Lightbulb, Users } from "lucide-react";

interface CreateProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateProposal: (data: { acronym: string; title: string; type: ProposalType }) => void;
}

const proposalTypes = [
  {
    value: 'RIA' as ProposalType,
    label: 'Research and Innovation Action (RIA)',
    description: 'Primarily research activities with some innovation elements',
    icon: Beaker,
  },
  {
    value: 'IA' as ProposalType,
    label: 'Innovation Action (IA)',
    description: 'Primarily innovation activities, closer to market',
    icon: Lightbulb,
  },
  {
    value: 'CSA' as ProposalType,
    label: 'Coordination and Support Action (CSA)',
    description: 'Supporting and coordination measures',
    icon: Users,
  },
  {
    value: 'OTHER' as ProposalType,
    label: 'Other',
    description: 'Custom proposal type',
    icon: FileText,
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (acronym && title) {
      onCreateProposal({ acronym, title, type });
      setAcronym('');
      setTitle('');
      setType('RIA');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
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
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="acronym">Proposal Acronym</Label>
              <Input
                id="acronym"
                placeholder="e.g., INNOVATE"
                value={acronym}
                onChange={(e) => setAcronym(e.target.value.toUpperCase())}
                className="font-semibold"
              />
              <p className="text-xs text-muted-foreground">
                A short, memorable name for your proposal
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="title">Full Title</Label>
              <Input
                id="title"
                placeholder="Enter the full proposal title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Proposal Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ProposalType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select proposal type" />
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
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!acronym || !title}>
              Create Proposal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
