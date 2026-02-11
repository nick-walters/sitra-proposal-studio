import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, Loader2, AlertTriangle } from "lucide-react";
import { Proposal } from "@/types/proposal";
import { supabase } from "@/integrations/supabase/client";

interface DuplicateProposalDialogProps {
  isOpen: boolean;
  onClose: () => void;
  proposal: Proposal;
  onDuplicate: (newAcronym: string, newTitle: string) => Promise<void>;
}

export function DuplicateProposalDialog({
  isOpen,
  onClose,
  proposal,
  onDuplicate,
}: DuplicateProposalDialogProps) {
  const [loading, setLoading] = useState(false);
  const [acronym, setAcronym] = useState('');
  const [title, setTitle] = useState(proposal.title);

  // Determine the next copy number when dialog opens
  useEffect(() => {
    if (!isOpen) return;
    setTitle(proposal.title);

    const findNextCopyNumber = async () => {
      // Strip existing "(copy N)" suffix to get the base acronym
      const baseAcronym = proposal.acronym.replace(/\s*\(copy \d+\)$/i, '');

      const { data } = await supabase
        .from('proposals')
        .select('acronym')
        .ilike('acronym', `${baseAcronym} (copy %)`);

      const existingNumbers = (data || [])
        .map(p => {
          const match = p.acronym.match(/\(copy (\d+)\)$/i);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);

      const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
      setAcronym(`${baseAcronym} (copy ${nextNumber})`);
    };

    findNextCopyNumber();
  }, [isOpen, proposal.acronym, proposal.title]);

  const handleDuplicate = async () => {
    if (!acronym.trim() || !title.trim()) return;
    
    setLoading(true);
    try {
      await onDuplicate(acronym, title);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5" />
            Duplicate Proposal
          </DialogTitle>
          <DialogDescription>
            Create a copy of this proposal for resubmission with a similar consortium and content.
          </DialogDescription>
        </DialogHeader>

        <Alert variant="default" className="bg-amber-50 border-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            This function should only be used for a resubmission with a similar consortium and similar content.
            The new proposal will be created as a draft.
          </AlertDescription>
        </Alert>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="acronym">New Acronym</Label>
            <Input
              id="acronym"
              value={acronym}
              onChange={(e) => setAcronym(e.target.value)}
              placeholder="Enter new acronym"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">New Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter new title"
            />
          </div>

          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-1">The following will be copied:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>All section content (Part A & Part B)</li>
              <li>Consortium partners and team members</li>
              <li>Budget items and allocations</li>
              <li>Work packages and tasks</li>
              <li>Ethics assessment</li>
              <li>Figures and references</li>
            </ul>
            <p className="mt-2 text-xs font-medium">Access:</p>
            <ul className="list-disc list-inside space-y-0.5 text-xs">
              <li>Only Coordinators from the original will retain access</li>
              <li>Editors and Viewers will not be copied</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleDuplicate} 
            disabled={loading || !acronym.trim() || !title.trim()}
            className="gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Duplicating...
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Create Duplicate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
