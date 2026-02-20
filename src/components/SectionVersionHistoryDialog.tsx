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
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  History, 
  RotateCcw, 
  User, 
  Clock, 
  FileText,
  Loader2,
  ChevronRight,
  Pin,
  PinOff,
  Info,
  ChevronDown,
  Star,
  Tag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isToday, isYesterday, differenceInDays, startOfWeek, startOfMonth } from "date-fns";
import { useProposalRole } from "@/hooks/useProposalRole";

interface SectionVersion {
  id: string;
  created_at: string;
  content: string | null;
  created_by: string | null;
  version_number: number;
  is_auto_save: boolean;
  label: string | null;
  is_pinned: boolean;
  is_major: boolean;
}

interface SectionVersionHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  sectionId: string;
  sectionTitle: string;
  onRestoreVersion: (content: string) => void;
}

/** Get byte size of content string */
function getContentSize(content: string | null): number {
  if (!content) return 0;
  return new Blob([content]).size;
}

/** Format bytes to human-readable */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/** Get word count from HTML content */
function getWordCount(content: string | null): number {
  if (!content) return 0;
  const plainText = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plainText.split(/\s+/).filter(word => word.length > 0).length;
}

/** Get time group label */
function getTimeGroup(dateString: string): string {
  const date = new Date(dateString);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  if (date >= weekStart) return 'This Week';
  const monthStart = startOfMonth(now);
  if (date >= monthStart) return 'This Month';
  return 'Older';
}

function getRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return format(date, "dd MMM");
}

function VersionListItem({ version, isLatest, isSelected, displayNumber, contentSize, relativeTime, profileName, onSelect }: {
  version: SectionVersion;
  isLatest: boolean;
  isSelected: boolean;
  displayNumber: string;
  contentSize: string;
  relativeTime: string;
  profileName?: string;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-3 rounded-md transition-colors ${
        isSelected ? 'bg-accent' : 'hover:bg-muted/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm truncate ${version.is_major ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>
              Version {displayNumber}
            </span>
            {isLatest && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Latest</Badge>
            )}
            {version.is_major && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0">
                <Star className="w-2.5 h-2.5 mr-0.5" />Major
              </Badge>
            )}
            {version.is_pinned && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                <Pin className="w-2.5 h-2.5 mr-0.5" />Pinned
              </Badge>
            )}
            {version.is_auto_save && !version.is_major && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">Auto</Badge>
            )}
          </div>
          {version.label && (
            <p className="text-xs text-primary font-bold mt-0.5 truncate flex items-center gap-1">
              <Tag className="w-3 h-3 flex-shrink-0" />
              {version.label}
            </p>
          )}
          <div className="grid grid-cols-3 gap-1 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <Clock className="w-3 h-3 flex-shrink-0" />
              {relativeTime}
            </span>
            <span className="truncate">{contentSize}</span>
            {profileName ? (
              <span className="flex items-center gap-1 truncate">
                <User className="w-3 h-3 flex-shrink-0" />
                {profileName}
              </span>
            ) : <span />}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>
    </button>
  );
}

export function SectionVersionHistoryDialog({
  isOpen,
  onClose,
  proposalId,
  sectionId,
  sectionTitle,
  onRestoreVersion
}: SectionVersionHistoryDialogProps) {
  const [versions, setVersions] = useState<SectionVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<SectionVersion | null>(null);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [retentionOpen, setRetentionOpen] = useState(false);

  const { roleTier } = useProposalRole(proposalId);
  const canManageVersions = roleTier === 'coordinator';

  useEffect(() => {
    if (isOpen && proposalId && sectionId) {
      loadVersions();
      // Run thinning when dialog opens
      Promise.resolve(supabase.rpc('thin_section_versions' as any, { p_proposal_id: proposalId })).catch(() => {});
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
        .limit(200);

      if (error) throw error;

      // Deduplicate by version_number, keeping the latest entry
      const seen = new Map<number, SectionVersion>();
      for (const v of (data || []) as SectionVersion[]) {
        if (!seen.has(v.version_number)) {
          seen.set(v.version_number, v);
        }
      }
      setVersions(Array.from(seen.values()));

      // Load profile names for creators
      const creatorIds = [...new Set(data?.map(v => v.created_by).filter(Boolean))];
      if (creatorIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles_basic')
          .select('id, full_name, first_name, last_name')
          .in('id', creatorIds);
        
        if (profileData) {
          const profileMap: Record<string, string> = {};
          profileData.forEach(p => {
            profileMap[p.id] = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown User';
          });
          setProfiles(profileMap);
        }
      }
    } catch (error) {
      console.error('Error loading versions:', error);
      toast.error("Failed to load version history");
    } finally {
      setIsLoading(false);
    }
  };

  // Separate pinned versions and group the rest by time period
  const pinnedVersions = useMemo(() => {
    return versions.filter(v => v.is_pinned).sort((a, b) => b.version_number - a.version_number);
  }, [versions]);

  const groupedVersions = useMemo(() => {
    const unpinned = versions.filter(v => !v.is_pinned);
    const groups: { label: string; versions: SectionVersion[] }[] = [];
    const groupMap = new Map<string, SectionVersion[]>();

    for (const v of unpinned) {
      const group = getTimeGroup(v.created_at);
      if (!groupMap.has(group)) groupMap.set(group, []);
      groupMap.get(group)!.push(v);
    }

    const order = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
    for (const label of order) {
      const items = groupMap.get(label);
      if (items && items.length > 0) {
        groups.push({ label, versions: items });
      }
    }
    return groups;
  }, [versions]);

  // Compute display version numbers as "major.minor"
  const displayVersionNumbers = useMemo(() => {
    const sorted = [...versions].sort((a, b) => a.version_number - b.version_number);
    const map = new Map<string, string>();
    let major = 0;
    let minor = 0;
    for (const v of sorted) {
      if (v.is_major) {
        major++;
        minor = 0;
      } else {
        if (major === 0) major = 1; // first version
        minor++;
      }
      map.set(v.id, `${major}.${minor}`);
    }
    return map;
  }, [versions]);

  // Build a map of version_number -> previous version for deltas
  const versionDeltaMap = useMemo(() => {
    const sorted = [...versions].sort((a, b) => a.version_number - b.version_number);
    const map = new Map<string, { wordDelta: number; sizeDelta: number }>();
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) {
        map.set(sorted[i].id, { wordDelta: getWordCount(sorted[i].content), sizeDelta: getContentSize(sorted[i].content) });
      } else {
        const prevWords = getWordCount(sorted[i - 1].content);
        const currWords = getWordCount(sorted[i].content);
        const prevSize = getContentSize(sorted[i - 1].content);
        const currSize = getContentSize(sorted[i].content);
        map.set(sorted[i].id, { wordDelta: currWords - prevWords, sizeDelta: currSize - prevSize });
      }
    }
    return map;
  }, [versions]);

  const handleRestore = async (version: SectionVersion) => {
    try {
      onRestoreVersion(version.content || '');
      toast.success("Version restored successfully!");
      onClose();
    } catch (error) {
      console.error('Error restoring version:', error);
      toast.error("Failed to restore version");
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "dd/MM/yyyy 'at' HH:mm");
  };

  const handleSaveLabel = async (version: SectionVersion, newLabel: string) => {
    const trimmed = newLabel.trim() || null;
    try {
      const updateData: Record<string, any> = { label: trimmed };
      if (trimmed) updateData.is_major = true; // labeling auto-promotes to major

      const { error } = await supabase
        .from('section_versions')
        .update(updateData)
        .eq('id', version.id);
      if (error) throw error;

      setVersions(prev => prev.map(v =>
        v.id === version.id ? { ...v, label: trimmed, is_major: trimmed ? true : v.is_major } : v
      ));
      setSelectedVersion(prev => prev?.id === version.id ? { ...prev, label: trimmed, is_major: trimmed ? true : prev.is_major } : prev);
      setEditingLabel(false);
    } catch (error) {
      console.error('Error saving label:', error);
      toast.error("Failed to save label");
    }
  };

  const handleTogglePin = async (version: SectionVersion) => {
    const newPinned = !version.is_pinned;
    
    // Check pin limit (max 3)
    if (newPinned) {
      const currentPinnedCount = versions.filter(v => v.is_pinned).length;
      if (currentPinnedCount >= 3) {
        toast.error("Maximum 3 pinned versions allowed. Unpin one first.");
        return;
      }
    }
    
    try {
      const updateData: Record<string, any> = { is_pinned: newPinned };
      if (newPinned) updateData.is_major = true; // pinning auto-promotes

      const { error } = await supabase
        .from('section_versions')
        .update(updateData)
        .eq('id', version.id);
      if (error) throw error;

      setVersions(prev => prev.map(v =>
        v.id === version.id ? { ...v, is_pinned: newPinned, is_major: newPinned ? true : v.is_major } : v
      ));
      setSelectedVersion(prev => prev?.id === version.id ? { ...prev, is_pinned: newPinned, is_major: newPinned ? true : prev.is_major } : prev);
      toast.success(newPinned ? "Version pinned" : "Version unpinned");
    } catch (error) {
      console.error('Error toggling pin:', error);
      toast.error("Failed to update pin");
    }
  };

  const formatDelta = (delta: number, unit: string) => {
    if (delta === 0) return null;
    const sign = delta > 0 ? '+' : '';
    return `${sign}${unit === 'size' ? formatSize(Math.abs(delta)) : delta} ${unit === 'size' ? '' : 'words'}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[750px] max-h-[80vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Version History: {sectionTitle}
          </DialogTitle>
          <DialogDescription>
            View and restore previous versions of this section. Versions are saved automatically every 5 minutes when significant changes are detected.
          </DialogDescription>
        </DialogHeader>

        {/* Retention Policy Info Box */}
        <Collapsible open={retentionOpen} onOpenChange={setRetentionOpen}>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
            <Info className="w-3 h-3" />
            <span>How versions are retained</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${retentionOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 space-y-2">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1 pr-4 font-medium">Age</th>
                    <th className="text-left py-1 font-medium">Versions kept</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="py-0.5 pr-4">0–7 days</td><td>All versions</td></tr>
                  <tr><td className="py-0.5 pr-4">7–30 days</td><td>1 per hour</td></tr>
                  <tr><td className="py-0.5 pr-4">30–90 days</td><td>1 per day</td></tr>
                  <tr><td className="py-0.5 pr-4">90+ days</td><td>1 per week</td></tr>
                </tbody>
              </table>
              <p className="italic">Pinned, labeled, and major versions are never automatically removed.</p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex gap-4 min-h-0 flex-1">
          {/* Version List */}
          <ScrollArea className="flex-1 border border-border rounded-md">
            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : versions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-center p-4">
                <FileText className="w-10 h-10 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No versions saved yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Versions are saved automatically as you edit
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {/* Pinned versions at top */}
                {pinnedVersions.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-3 pt-2 pb-1 flex items-center gap-1">
                      <Pin className="w-3 h-3" /> Pinned
                    </p>
                    {pinnedVersions.map((version) => {
                      const isLatest = version.version_number === Math.max(...versions.map(v => v.version_number));
                      return (
                        <VersionListItem
                          key={version.id}
                          version={version}
                          isLatest={isLatest}
                          isSelected={selectedVersion?.id === version.id}
                          displayNumber={displayVersionNumbers.get(version.id) || String(version.version_number)}
                          contentSize={formatSize(getContentSize(version.content))}
                          relativeTime={getRelativeTime(version.created_at)}
                          profileName={version.created_by ? profiles[version.created_by] : undefined}
                          onSelect={() => { setSelectedVersion(version); setEditingLabel(false); }}
                        />
                      );
                    })}
                    <Separator className="my-1" />
                  </div>
                )}
                {groupedVersions.map(group => (
                  <div key={group.label}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-3 pt-2 pb-1">
                      {group.label}
                    </p>
                    {group.versions.map((version) => {
                      const isLatest = version.version_number === Math.max(...versions.map(v => v.version_number));
                      return (
                        <VersionListItem
                          key={version.id}
                          version={version}
                          isLatest={isLatest}
                          isSelected={selectedVersion?.id === version.id}
                          displayNumber={displayVersionNumbers.get(version.id) || String(version.version_number)}
                          contentSize={formatSize(getContentSize(version.content))}
                          relativeTime={getRelativeTime(version.created_at)}
                          profileName={version.created_by ? profiles[version.created_by] : undefined}
                          onSelect={() => { setSelectedVersion(version); setEditingLabel(false); }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Version Details */}
          <ScrollArea className="w-72 border border-border rounded-md p-4">
            {selectedVersion ? (
              <div className="space-y-4">
                <div>
                  <h4 className={`text-sm ${selectedVersion.is_major ? 'font-semibold' : 'font-medium'}`}>
                    Version {displayVersionNumbers.get(selectedVersion.id) || selectedVersion.version_number}
                  </h4>

                  {/* Label display / editing */}
                  {canManageVersions ? (
                    editingLabel ? (
                      <Input
                        autoFocus
                        value={labelDraft}
                        onChange={(e) => setLabelDraft(e.target.value)}
                        onBlur={() => handleSaveLabel(selectedVersion, labelDraft)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveLabel(selectedVersion, labelDraft);
                          if (e.key === 'Escape') setEditingLabel(false);
                        }}
                        placeholder="e.g. Final submitted version"
                        className="h-7 text-xs mt-1"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setLabelDraft(selectedVersion.label || '');
                          setEditingLabel(true);
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground mt-1 flex items-center gap-1 transition-colors"
                      >
                        <Tag className="w-3 h-3" />
                        {selectedVersion.label || 'Add label…'}
                      </button>
                    )
                  ) : selectedVersion.label ? (
                    <p className="text-xs text-primary mt-1 flex items-center gap-1">
                      <Tag className="w-3 h-3" />
                      {selectedVersion.label}
                    </p>
                  ) : null}

                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(selectedVersion.created_at)}
                  </p>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Words</p>
                    <p className="text-sm font-medium">{getWordCount(selectedVersion.content)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Size</p>
                    <p className="text-sm font-medium">{formatSize(getContentSize(selectedVersion.content))}</p>
                  </div>
                </div>

                {/* Delta from previous version */}
                {(() => {
                  const delta = versionDeltaMap.get(selectedVersion.id);
                  if (!delta) return null;
                  const wordStr = formatDelta(delta.wordDelta, 'words');
                  const sizeStr = formatDelta(delta.sizeDelta, 'size');
                  if (!wordStr && !sizeStr) return null;
                  return (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Change from previous</p>
                      <div className="flex gap-2">
                        {wordStr && (
                          <Badge variant="outline" className={`text-[10px] ${delta.wordDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {wordStr}
                          </Badge>
                        )}
                        {sizeStr && (
                          <Badge variant="outline" className={`text-[10px] ${delta.sizeDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {sizeStr}
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {selectedVersion.created_by && profiles[selectedVersion.created_by] && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Saved by</p>
                    <p className="text-sm flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {profiles[selectedVersion.created_by]}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Preview</p>
                  <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded max-h-24 overflow-hidden">
                    {selectedVersion.content
                      ?.replace(/<[^>]+>/g, ' ')
                      .replace(/&nbsp;/g, ' ')
                      .substring(0, 200) || 'Empty content'}
                    {(selectedVersion.content?.length || 0) > 200 && '...'}
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  {canManageVersions && (
                    <Button
                      onClick={() => handleTogglePin(selectedVersion)}
                      variant="outline"
                      size="sm"
                      className="w-full gap-2 text-xs"
                    >
                      {selectedVersion.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                      {selectedVersion.is_pinned ? 'Unpin Version' : 'Pin Version'}
                    </Button>
                  )}
                  <Button
                    onClick={() => handleRestore(selectedVersion)}
                    className="w-full gap-2"
                    variant="outline"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restore This Version
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <History className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Select a version to view details
                </p>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
