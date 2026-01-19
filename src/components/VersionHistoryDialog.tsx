import { useState, useEffect } from 'react';
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
import { 
  History, 
  RotateCcw, 
  User, 
  Clock, 
  FileText,
  Loader2,
  ChevronRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface Version {
  id: string;
  created_at: string;
  description: string | null;
  created_by: string | null;
  snapshot: any;
}

interface VersionHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  proposalId: string;
  onRestoreVersion: (snapshot: any) => void;
}

export function VersionHistoryDialog({
  isOpen,
  onClose,
  proposalId,
  onRestoreVersion
}: VersionHistoryDialogProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<Version | null>(null);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && proposalId) {
      loadVersions();
    }
  }, [isOpen, proposalId]);

  const loadVersions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('versions')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setVersions(data || []);

      // Load profile names for creators
      const creatorIds = [...new Set(data?.map(v => v.created_by).filter(Boolean))];
      if (creatorIds.length > 0) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', creatorIds);
        
        if (profileData) {
          const profileMap: Record<string, string> = {};
          profileData.forEach(p => {
            profileMap[p.id] = p.full_name || 'Unknown User';
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

  const handleRestore = async (version: Version) => {
    try {
      onRestoreVersion(version.snapshot);
      toast.success("Version restored successfully!");
      onClose();
    } catch (error) {
      console.error('Error restoring version:', error);
      toast.error("Failed to restore version");
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, "MMM d, yyyy 'at' h:mm a");
  };

  const getRelativeTime = (dateString: string) => {
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
    return format(date, "MMM d");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Version History
          </DialogTitle>
          <DialogDescription>
            View and restore previous versions of your proposal. Each save creates a new version.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4 min-h-[400px]">
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
                  Versions are created when you save your proposal
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {versions.map((version, index) => (
                  <button
                    key={version.id}
                    onClick={() => setSelectedVersion(version)}
                    className={`w-full text-left p-3 rounded-md transition-colors ${
                      selectedVersion?.id === version.id
                        ? 'bg-accent'
                        : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">
                            {version.description || `Version ${versions.length - index}`}
                          </span>
                          {index === 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {getRelativeTime(version.created_at)}
                          </span>
                          {version.created_by && profiles[version.created_by] && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {profiles[version.created_by]}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Version Details */}
          <div className="w-64 border border-border rounded-md p-4">
            {selectedVersion ? (
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-sm">Version Details</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDate(selectedVersion.created_at)}
                  </p>
                </div>

                <Separator />

                <div>
                  <p className="text-xs text-muted-foreground mb-1">Description</p>
                  <p className="text-sm">
                    {selectedVersion.description || 'No description provided'}
                  </p>
                </div>

                {selectedVersion.created_by && profiles[selectedVersion.created_by] && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Created by</p>
                    <p className="text-sm flex items-center gap-2">
                      <User className="w-4 h-4" />
                      {profiles[selectedVersion.created_by]}
                    </p>
                  </div>
                )}

                <Separator />

                <Button
                  onClick={() => handleRestore(selectedVersion)}
                  className="w-full gap-2"
                  variant="outline"
                >
                  <RotateCcw className="w-4 h-4" />
                  Restore This Version
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <History className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Select a version to view details
                </p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
