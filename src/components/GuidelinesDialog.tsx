import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GuidelineBox, GuidelineType } from "./GuidelineBox";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Guideline {
  id: string;
  type: GuidelineType;
  title: string;
  content: string;
}

interface GuidelinesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  sectionTitle: string;
  guidelines: Guideline[];
}

export function GuidelinesDialog({ isOpen, onClose, sectionTitle, guidelines }: GuidelinesDialogProps) {
  // Sort guidelines: evaluation first, then official, then sitra_tip
  const sortedGuidelines = [...guidelines].sort((a, b) => {
    const order: Record<GuidelineType, number> = {
      evaluation: 0,
      official: 1,
      sitra_tip: 2,
    };
    return order[a.type] - order[b.type];
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Guidelines for {sectionTitle}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4">
            {sortedGuidelines.length > 0 ? (
              sortedGuidelines.map((guideline) => (
                <GuidelineBox
                  key={guideline.id}
                  type={guideline.type}
                  title={guideline.title}
                >
                  {guideline.content}
                </GuidelineBox>
              ))
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No guidelines available for this section.
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
