/**
 * THE PLATFORM-WIDE CASE GUIDANCE DEFAULTS
 *
 * The case draft editor resolves each subsection's guidance as
 * `case_subsection_templates.guideline` (the proposal's own override) falling
 * back to `case_guideline_defaults` (the Sitra default, one row per subsection
 * key). Only the override was reachable from the UI; the defaults themselves
 * lived in the database and nowhere else, which is why the backend showed two
 * empty guideline blocks and none of the tips writers actually see.
 *
 * This panel is the missing half. It edits `case_guideline_defaults` directly,
 * so a change here becomes the default for EVERY proposal at once — and every
 * proposal that has written its own guidance keeps winning, because the
 * override is a separate row that this never touches.
 *
 * The defaults are not versioned with the template: the table carries no
 * version column deliberately, so publishing or switching a template version
 * leaves them exactly as they are.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Info, Pencil, Save, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminRichTextField } from '@/components/admin/AdminRichTextField';
import { GuidanceHtml } from '@/components/GuidanceHtml';
import {
  useCaseGuidelineDefaults,
  type CaseGuidelineDefault,
} from '@/hooks/useCaseGuidance';

export function CaseGuidanceDefaultsPanel({ editable }: { editable: boolean }) {
  const { data: defaults = [], isLoading } = useCaseGuidelineDefaults();
  const [open, setOpen] = useState(true);

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <span className="font-semibold">Case subsection guidance</span>
          <Badge variant="outline" className="ml-1">
            {defaults.length} default{defaults.length === 1 ? '' : 's'}
          </Badge>
        </button>

        {open && (
          <>
            <div className="flex items-start gap-2 rounded-md border border-blue-300 bg-blue-50 p-3 text-xs text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                These are the tips shown beside each case draft subsection on every proposal.
                They are platform-wide and are <b>not</b> tied to a template version, so
                publishing a new version leaves them untouched. A proposal whose coordinator has
                written its own guidance keeps that text — an override always wins over the
                default below.
              </p>
            </div>

            {isLoading && (
              <p className="text-xs text-muted-foreground">Loading the defaults…</p>
            )}
            {!isLoading && defaults.length === 0 && (
              <p className="text-xs text-muted-foreground">No case guidance defaults are seeded.</p>
            )}

            {defaults.map((d) => (
              <DefaultRow key={d.key} row={d} editable={editable} />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DefaultRow({ row, editable }: { row: CaseGuidelineDefault; editable: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(row.content ?? '');
  const [dirty, setDirty] = useState(false);

  // A refetch that brings new text in must not clobber an edit in progress.
  useEffect(() => {
    if (!dirty) setContent(row.content ?? '');
  }, [row.content, dirty]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('case_guideline_defaults')
        .update({ content })
        .eq('key', row.key);
      if (error) throw error;
    },
    onSuccess: () => {
      setDirty(false);
      setEditing(false);
      toast.success(`“${row.title}” default guidance saved for every proposal.`);
      qc.invalidateQueries({ queryKey: ['case-guideline-defaults'] });
    },
    onError: (e: Error) =>
      toast.error(e.message || 'Could not save the default guidance'),
  });

  const cancel = () => {
    setContent(row.content ?? '');
    setDirty(false);
    setEditing(false);
  };

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">{row.title}</span>
        <code className="rounded bg-muted px-1 text-[11px] text-muted-foreground">{row.key}</code>
        {dirty && <Badge variant="secondary">Unsaved</Badge>}
        {editable && !editing && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1 px-2"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </div>

      {/* Read first, edit on request — the same shape as every other
          guideline entry in Sections & guidelines. */}
      {!editing ? (
        content.replace(/<[^>]*>/g, '').trim() ? (
          <GuidanceHtml html={content} className="text-sm text-muted-foreground" />
        ) : (
          <p className="text-sm italic text-muted-foreground">No default guidance yet.</p>
        )
      ) : (
        <>
          <AdminRichTextField
            value={content}
            onChange={(html) => {
              setContent(html);
              setDirty(true);
            }}
            minHeight="4rem"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="gap-2" onClick={cancel}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              <Save className="h-4 w-4" />
              {save.isPending ? 'Saving…' : 'Save default'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default CaseGuidanceDefaultsPanel;
