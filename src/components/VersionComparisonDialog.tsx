import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  GitCompare, 
  Loader2,
  ArrowLeftRight,
  Plus,
  Minus,
  Equal
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface SectionVersion {
  id: string;
  created_at: string;
  content: string | null;
  created_by: string | null;
  version_number: number;
  is_auto_save: boolean;
}

interface VersionComparisonDialogProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  sectionId: string;
  sectionTitle: string;
  currentContent?: string;
}

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
  lineNumber: { left?: number; right?: number };
}

// Simple diff algorithm to compare two texts
function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const diff: DiffLine[] = [];
  
  // Simple LCS-based diff
  const lcs = getLCS(oldLines, newLines);
  
  let oldIdx = 0;
  let newIdx = 0;
  let leftLineNum = 1;
  let rightLineNum = 1;
  
  for (const commonLine of lcs) {
    // Add removed lines (in old but not in common)
    while (oldIdx < oldLines.length && oldLines[oldIdx] !== commonLine) {
      diff.push({
        type: 'removed',
        content: oldLines[oldIdx],
        lineNumber: { left: leftLineNum++ }
      });
      oldIdx++;
    }
    
    // Add added lines (in new but not in common)
    while (newIdx < newLines.length && newLines[newIdx] !== commonLine) {
      diff.push({
        type: 'added',
        content: newLines[newIdx],
        lineNumber: { right: rightLineNum++ }
      });
      newIdx++;
    }
    
    // Add unchanged line
    if (oldIdx < oldLines.length && newIdx < newLines.length) {
      diff.push({
        type: 'unchanged',
        content: commonLine,
        lineNumber: { left: leftLineNum++, right: rightLineNum++ }
      });
      oldIdx++;
      newIdx++;
    }
  }
  
  // Add remaining removed lines
  while (oldIdx < oldLines.length) {
    diff.push({
      type: 'removed',
      content: oldLines[oldIdx],
      lineNumber: { left: leftLineNum++ }
    });
    oldIdx++;
  }
  
  // Add remaining added lines
  while (newIdx < newLines.length) {
    diff.push({
      type: 'added',
      content: newLines[newIdx],
      lineNumber: { right: rightLineNum++ }
    });
    newIdx++;
  }
  
  return diff;
}

// Get Longest Common Subsequence
function getLCS(arr1: string[], arr2: string[]): string[] {
  const m = arr1.length;
  const n = arr2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  // Backtrack to find LCS
  const lcs: string[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (arr1[i - 1] === arr2[j - 1]) {
      lcs.unshift(arr1[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  
  return lcs;
}

// Strip HTML for comparison
function stripHtml(html: string): string {
  return html
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n\n+/g, '\n')
    .trim();
}

export function VersionComparisonDialog({
  isOpen,
  onClose,
  proposalId,
  sectionId,
  sectionTitle,
  currentContent = ''
}: VersionComparisonDialogProps) {
  const [versions, setVersions] = useState<SectionVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [leftVersionId, setLeftVersionId] = useState<string>('');
  const [rightVersionId, setRightVersionId] = useState<string>('current');

  useEffect(() => {
    if (isOpen && proposalId && sectionId) {
      loadVersions();
    }
  }, [isOpen, proposalId, sectionId]);

  const loadVersions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('section_versions')
        .select('*')
        .eq('proposal_id', proposalId)
        .eq('section_id', sectionId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      setVersions(data || []);
      
      // Auto-select first two versions for comparison
      if (data && data.length >= 1) {
        setLeftVersionId(data[0].id);
        setRightVersionId('current');
      }
    } catch (error) {
      console.error('Error loading versions:', error);
      toast.error("Failed to load versions");
    } finally {
      setIsLoading(false);
    }
  };

  // Get content for a version
  const getVersionContent = (versionId: string): string => {
    if (versionId === 'current') {
      return stripHtml(currentContent);
    }
    const version = versions.find(v => v.id === versionId);
    return version ? stripHtml(version.content || '') : '';
  };

  // Compute diff between selected versions
  const diff = useMemo(() => {
    if (!leftVersionId || !rightVersionId) return [];
    const leftContent = getVersionContent(leftVersionId);
    const rightContent = getVersionContent(rightVersionId);
    return computeDiff(leftContent, rightContent);
  }, [leftVersionId, rightVersionId, versions, currentContent]);

  // Stats
  const stats = useMemo(() => {
    const added = diff.filter(d => d.type === 'added').length;
    const removed = diff.filter(d => d.type === 'removed').length;
    const unchanged = diff.filter(d => d.type === 'unchanged').length;
    return { added, removed, unchanged };
  }, [diff]);

  const formatVersionLabel = (version: SectionVersion) => {
    const date = format(new Date(version.created_at), "MMM d, HH:mm");
    return `v${version.version_number} - ${date}`;
  };

  const swapVersions = () => {
    const temp = leftVersionId;
    setLeftVersionId(rightVersionId);
    setRightVersionId(temp);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-primary" />
            Compare Versions: {sectionTitle}
          </DialogTitle>
          <DialogDescription>
            Select two versions to compare side-by-side. Changes are highlighted.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-60">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <GitCompare className="w-10 h-10 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No versions to compare</p>
            <p className="text-xs text-muted-foreground mt-1">
              Versions are saved automatically as you edit
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Version Selectors */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Left (older)</label>
                <Select value={leftVersionId} onValueChange={setLeftVersionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {formatVersionLabel(v)}
                      </SelectItem>
                    ))}
                    <SelectItem value="current">Current (unsaved)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={swapVersions}
                className="mt-5"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </Button>
              
              <div className="flex-1">
                <label className="text-xs text-muted-foreground mb-1 block">Right (newer)</label>
                <Select value={rightVersionId} onValueChange={setRightVersionId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select version" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current">Current (unsaved)</SelectItem>
                    {versions.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {formatVersionLabel(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-green-600">
                <Plus className="w-4 h-4" />
                <span>{stats.added} added</span>
              </div>
              <div className="flex items-center gap-1.5 text-red-600">
                <Minus className="w-4 h-4" />
                <span>{stats.removed} removed</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Equal className="w-4 h-4" />
                <span>{stats.unchanged} unchanged</span>
              </div>
            </div>

            {/* Diff View */}
            <ScrollArea className="h-[400px] border rounded-md">
              <div className="font-mono text-sm">
                {diff.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No differences found
                  </div>
                ) : (
                  diff.map((line, idx) => (
                    <div 
                      key={idx}
                      className={cn(
                        "flex border-b border-border/50 last:border-b-0",
                        line.type === 'added' && "bg-green-500/10",
                        line.type === 'removed' && "bg-red-500/10"
                      )}
                    >
                      {/* Line numbers */}
                      <div className="w-12 flex-shrink-0 text-right pr-2 py-1 text-muted-foreground text-xs border-r border-border/50 select-none">
                        {line.lineNumber.left || ''}
                      </div>
                      <div className="w-12 flex-shrink-0 text-right pr-2 py-1 text-muted-foreground text-xs border-r border-border/50 select-none">
                        {line.lineNumber.right || ''}
                      </div>
                      
                      {/* Change indicator */}
                      <div className={cn(
                        "w-6 flex-shrink-0 flex items-center justify-center py-1 border-r border-border/50",
                        line.type === 'added' && "text-green-600",
                        line.type === 'removed' && "text-red-600"
                      )}>
                        {line.type === 'added' && <Plus className="w-3 h-3" />}
                        {line.type === 'removed' && <Minus className="w-3 h-3" />}
                      </div>
                      
                      {/* Content */}
                      <div className={cn(
                        "flex-1 py-1 px-2 whitespace-pre-wrap break-all",
                        line.type === 'added' && "text-green-700 dark:text-green-400",
                        line.type === 'removed' && "text-red-700 dark:text-red-400 line-through"
                      )}>
                        {line.content || '\u00A0'}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {/* Legend */}
            <div className="flex items-center justify-end gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-green-500/20 border border-green-500/30" />
                <span>Added in right version</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded bg-red-500/20 border border-red-500/30" />
                <span>Removed from left version</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
