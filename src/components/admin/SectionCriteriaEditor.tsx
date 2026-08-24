import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { AdminRichTextField } from '@/components/admin/AdminRichTextField';
import { ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Backend editing for the CRITERIA category.
 *
 * Criteria are a guideline category of their own (`card_guidelines.guideline_type
 * = 'criteria'`) and attach to a whole SECTION (`card_guideline_sections`),
 * unlike Commission guidance, which attaches per block template. Content is
 * stored as HTML, exactly as the guidelines dialog renders it.
 */
interface Row {
  id: string;
  content: string;
  order_index: number;
}

export function SectionCriteriaEditor({ sectionId }: { sectionId: string }) {
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const { data: criteria = [] } = useQuery({
    queryKey: ['admin-section-criteria', sectionId],
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase
        .from('card_guideline_sections')
        .select('card_guidelines(id, content, order_index, guideline_type, is_active)')
        .eq('section_source_id', sectionId);
      return (data ?? [])
        .map((l) => (l as any).card_guidelines)
        .filter((g: any) => g && g.guideline_type === 'criteria' && g.is_active)
        .map((g: any) => ({ id: g.id, content: g.content, order_index: g.order_index }))
        .sort((a: Row, b: Row) => a.order_index - b.order_index);
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-section-criteria', sectionId] });
    queryClient.invalidateQueries({ queryKey: ['section-criteria'] });
  };

  const save = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from('card_guidelines')
        .update({ content })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Criterion saved');
      invalidate();
    },
    onError: () => toast.error('Failed to save the criterion'),
  });

  const add = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('card_guidelines')
        .insert({
          guideline_type: 'criteria',
          content: 'New evaluation criterion',
          order_index: criteria.length,
        })
        .select('id')
        .single();
      if (error) throw error;
      const { error: linkError } = await supabase
        .from('card_guideline_sections')
        .insert({ guideline_id: data.id, section_source_id: sectionId });
      if (linkError) throw linkError;
    },
    onSuccess: invalidate,
    onError: () => toast.error('Failed to add the criterion'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('card_guidelines').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: () => toast.error('Failed to delete the criterion'),
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-destructive" />
          Criteria ({criteria.length})
        </h4>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => add.mutate()}
          disabled={add.isPending}
        >
          <Plus className="w-3.5 h-3.5" />
          Add criterion
        </Button>
      </div>

      {criteria.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No criteria attached to this section.
        </p>
      )}

      {criteria.map((c) => (
        <div
          key={c.id}
          className="rounded-lg border-2 border-destructive bg-destructive/5 p-3 space-y-2"
        >
          <AdminRichTextField
            value={drafts[c.id] ?? c.content}
            onChange={(html) => setDrafts((d) => ({ ...d, [c.id]: html }))}
            minHeight="7rem"
            className="bg-background"
          />

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive gap-1"
              onClick={() => remove.mutate(c.id)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
            <Button
              size="sm"
              disabled={save.isPending || (drafts[c.id] ?? c.content) === c.content}
              onClick={() => save.mutate({ id: c.id, content: drafts[c.id] ?? c.content })}
            >
              Save
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
