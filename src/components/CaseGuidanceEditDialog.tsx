import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { saveCaseGuidanceOverride, type ResolvedCaseGuidance } from '@/hooks/useCaseGuidance';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  guidance: ResolvedCaseGuidance | null;
  onSaved: () => void;
}

/**
 * Proposal-specific case guidance. Written to the proposal's own subsection
 * row, never to the shared default, so other proposals are untouched.
 */
export function CaseGuidanceEditDialog({ isOpen, onClose, guidance, onSaved }: Props) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) setText(guidance?.content ?? '');
  }, [isOpen, guidance?.content]);

  const save = async (value: string) => {
    if (!guidance?.templateId) return;
    setSaving(true);
    const ok = await saveCaseGuidanceOverride(guidance.templateId, value);
    setSaving(false);
    if (!ok) return;
    toast.success(value.trim() ? 'Guidance saved for this proposal' : 'Reverted to the default guidance');
    onSaved();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Guidance for {guidance?.title ?? 'this subsection'}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          This guidance applies to this proposal only. Other proposals keep the default, and your
          text survives template version changes. Clear the box to fall back to the default.
        </p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          placeholder="Write guidance suited to this project's cases…"
        />
        <DialogFooter className="gap-2">
          {guidance?.isOverride && (
            <Button variant="outline" disabled={saving} onClick={() => save('')}>
              Revert to default
            </Button>
          )}
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving || !guidance?.templateId} onClick={() => save(text)}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
