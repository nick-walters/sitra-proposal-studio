import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Network, Plus, Trash2, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface WPDraft {
  id: string;
  number: number;
  short_name: string | null;
  color: string;
}

interface Dependency {
  id: string;
  from_wp_id: string;
  to_wp_id: string;
}

interface WPDependencySelectorProps {
  proposalId: string;
  isCoordinator: boolean;
}

export function WPDependencySelector({ proposalId, isCoordinator }: WPDependencySelectorProps) {
  const queryClient = useQueryClient();
  const [fromWp, setFromWp] = useState<string>('');
  const [toWp, setToWp] = useState<string>('');

  // Fetch WP drafts
  const { data: wpDrafts = [] } = useQuery({
    queryKey: ['wp-drafts-deps', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wp_drafts')
        .select('id, number, short_name, color')
        .eq('proposal_id', proposalId)
        .order('number');
      if (error) throw error;
      return data as WPDraft[];
    },
  });

  // Fetch existing dependencies
  const { data: dependencies = [] } = useQuery({
    queryKey: ['wp-dependencies', proposalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wp_dependencies')
        .select('id, from_wp_id, to_wp_id')
        .eq('proposal_id', proposalId);
      if (error) throw error;
      return data as Dependency[];
    },
  });

  // Add dependency mutation
  const addMutation = useMutation({
    mutationFn: async () => {
      if (!fromWp || !toWp) return;
      
      // Check for duplicates
      const exists = dependencies.some(
        (d) => d.from_wp_id === fromWp && d.to_wp_id === toWp
      );
      if (exists) {
        throw new Error('This dependency already exists');
      }

      // Check for self-reference
      if (fromWp === toWp) {
        throw new Error('A WP cannot depend on itself');
      }

      const { error } = await supabase.from('wp_dependencies').insert({
        proposal_id: proposalId,
        from_wp_id: fromWp,
        to_wp_id: toWp,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-dependencies', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-dependencies-pert', proposalId] });
      setFromWp('');
      setToWp('');
      toast.success('Dependency added');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to add dependency');
    },
  });

  // Delete dependency mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wp_dependencies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wp-dependencies', proposalId] });
      queryClient.invalidateQueries({ queryKey: ['wp-dependencies-pert', proposalId] });
      toast.success('Dependency removed');
    },
  });

  const getWpLabel = (wpId: string) => {
    const wp = wpDrafts.find((w) => w.id === wpId);
    if (!wp) return 'Unknown';
    return `WP${wp.number}${wp.short_name ? `: ${wp.short_name}` : ''}`;
  };

  const getWpColor = (wpId: string) => {
    const wp = wpDrafts.find((w) => w.id === wpId);
    return wp?.color || '#888';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Network className="w-4 h-4" />
          WP Dependencies (PERT)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing Dependencies */}
        {dependencies.length > 0 ? (
          <div className="space-y-2">
            {dependencies.map((dep) => (
              <div
                key={dep.id}
                className="flex items-center gap-2 text-sm bg-muted/50 px-3 py-2 rounded"
              >
                <span
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: getWpColor(dep.from_wp_id) }}
                />
                <span className="font-medium">{getWpLabel(dep.from_wp_id)}</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground" />
                <span
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: getWpColor(dep.to_wp_id) }}
                />
                <span className="font-medium">{getWpLabel(dep.to_wp_id)}</span>
                {isCoordinator && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate(dep.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-2">
            No dependencies defined yet.
          </p>
        )}

        {/* Add New Dependency */}
        {isCoordinator && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <Select value={fromWp} onValueChange={setFromWp}>
              <SelectTrigger className="flex-1 h-8 text-sm">
                <SelectValue placeholder="From WP..." />
              </SelectTrigger>
              <SelectContent>
                {wpDrafts.map((wp) => (
                  <SelectItem key={wp.id} value={wp.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded"
                        style={{ backgroundColor: wp.color }}
                      />
                      WP{wp.number}{wp.short_name ? `: ${wp.short_name}` : ''}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />

            <Select value={toWp} onValueChange={setToWp}>
              <SelectTrigger className="flex-1 h-8 text-sm">
                <SelectValue placeholder="To WP..." />
              </SelectTrigger>
              <SelectContent>
                {wpDrafts.map((wp) => (
                  <SelectItem key={wp.id} value={wp.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded"
                        style={{ backgroundColor: wp.color }}
                      />
                      WP{wp.number}{wp.short_name ? `: ${wp.short_name}` : ''}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              size="sm"
              className="h-8"
              onClick={() => addMutation.mutate()}
              disabled={!fromWp || !toWp || addMutation.isPending}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
