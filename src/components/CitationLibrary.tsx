import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, ExternalLink, CheckCircle2, Pencil, Save, X } from "lucide-react";
import { useState, useMemo } from "react";
import { ProposalReference } from "@/hooks/useProposalReferences";
import { toast } from "sonner";

interface CitationLibraryProps {
  references: ProposalReference[];
  isLoading: boolean;
  onSelectReference: (reference: ProposalReference) => void;
  onUpdateReference?: (refId: string, updates: Partial<Omit<ProposalReference, 'id' | 'proposal_id' | 'created_at'>>) => Promise<boolean>;
  /** Map from internal citation_number to the global display order. Uncited
   * references (not in the map) are sorted last and hidden from the list. */
  displayOrder?: Map<number, number>;
}

export function CitationLibrary({ 
  references, 
  isLoading,
  onSelectReference,
  onUpdateReference,
  displayOrder,
}: CitationLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({
    title: '',
    authors: '',
    year: '',
    journal: '',
    volume: '',
    pages: '',
    doi: '',
    formatted_citation: '',
  });

  const filteredReferences = useMemo(() => {
    if (!searchQuery.trim()) return references;
    
    const query = searchQuery.toLowerCase();
    return references.filter(ref => 
      ref.title.toLowerCase().includes(query) ||
      ref.authors?.some(a => a.toLowerCase().includes(query)) ||
      ref.journal?.toLowerCase().includes(query) ||
      ref.doi?.toLowerCase().includes(query) ||
      ref.year?.toString().includes(query)
    );
  }, [references, searchQuery]);

  const startEditing = (ref: ProposalReference, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(ref.id);
    setEditFields({
      title: ref.title,
      authors: ref.authors?.join(', ') || '',
      year: ref.year?.toString() || '',
      journal: ref.journal || '',
      volume: ref.volume || '',
      pages: ref.pages || '',
      doi: ref.doi || '',
      formatted_citation: ref.formatted_citation || '',
    });
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const saveEditing = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingId || !onUpdateReference) return;
    if (!editFields.title.trim()) {
      toast.error('Title is required');
      return;
    }

    const updates: any = {
      title: editFields.title.trim(),
      authors: editFields.authors.split(',').map(a => a.trim()).filter(Boolean),
      year: editFields.year ? parseInt(editFields.year) : null,
      journal: editFields.journal.trim() || null,
      volume: editFields.volume.trim() || null,
      pages: editFields.pages.trim() || null,
      doi: editFields.doi.trim() || null,
      formatted_citation: editFields.formatted_citation.trim() || null,
    };

    const success = await onUpdateReference(editingId, updates);
    if (success) {
      toast.success('Citation updated');
      setEditingId(null);
    } else {
      toast.error('Failed to update citation');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (references.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">No citations in this proposal yet.</p>
        <p className="text-xs mt-1">Use the "Lookup" or "Manual" tab to add your first citation.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search citations..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Reference list */}
      <ScrollArea className="h-[280px]">
        <div className="space-y-2 pr-3">
          {filteredReferences.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No citations match your search.
            </p>
          ) : (
            filteredReferences.map((ref) => (
              <div
                key={ref.id}
                className="group p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                onClick={() => editingId !== ref.id && onSelectReference(ref)}
              >
                {editingId === ref.id ? (
                  /* Edit mode */
                  <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className="text-xs font-mono">[{ref.citation_number}]</Badge>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelEditing}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={saveEditing}>
                          <Save className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Input
                        value={editFields.title}
                        onChange={(e) => setEditFields(f => ({ ...f, title: e.target.value }))}
                        placeholder="Title *"
                        className="h-7 text-xs"
                      />
                      <Input
                        value={editFields.authors}
                        onChange={(e) => setEditFields(f => ({ ...f, authors: e.target.value }))}
                        placeholder="Authors (comma-separated)"
                        className="h-7 text-xs"
                      />
                      <div className="grid grid-cols-3 gap-1.5">
                        <Input
                          value={editFields.year}
                          onChange={(e) => setEditFields(f => ({ ...f, year: e.target.value }))}
                          placeholder="Year"
                          className="h-7 text-xs"
                        />
                        <Input
                          value={editFields.volume}
                          onChange={(e) => setEditFields(f => ({ ...f, volume: e.target.value }))}
                          placeholder="Volume"
                          className="h-7 text-xs"
                        />
                        <Input
                          value={editFields.pages}
                          onChange={(e) => setEditFields(f => ({ ...f, pages: e.target.value }))}
                          placeholder="Pages"
                          className="h-7 text-xs"
                        />
                      </div>
                      <Input
                        value={editFields.journal}
                        onChange={(e) => setEditFields(f => ({ ...f, journal: e.target.value }))}
                        placeholder="Journal / Source"
                        className="h-7 text-xs"
                      />
                      <Input
                        value={editFields.doi}
                        onChange={(e) => setEditFields(f => ({ ...f, doi: e.target.value }))}
                        placeholder="DOI"
                        className="h-7 text-xs"
                      />
                      <div className="space-y-1">
                        <Label className="text-[10px] text-muted-foreground">Formatted citation</Label>
                        <Textarea
                          value={editFields.formatted_citation}
                          onChange={(e) => setEditFields(f => ({ ...f, formatted_citation: e.target.value }))}
                          placeholder="Full formatted citation text"
                          rows={2}
                          className="text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="shrink-0 text-xs font-mono">
                            [{ref.citation_number}]
                          </Badge>
                          {ref.verified && (
                            <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                          )}
                        </div>
                        <h4 className="font-medium text-sm line-clamp-2 leading-snug">
                          {ref.title}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {ref.authors?.slice(0, 3).join(', ')}
                          {ref.authors && ref.authors.length > 3 && ' et al.'}
                          {ref.year && ` (${ref.year})`}
                        </p>
                        {ref.journal && (
                          <p className="text-xs text-muted-foreground italic line-clamp-1">
                            {ref.journal}
                            {ref.volume && ` ${ref.volume}`}
                            {ref.pages && `:${ref.pages}`}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {onUpdateReference && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2"
                            onClick={(e) => startEditing(ref, e)}
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            Edit
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectReference(ref);
                          }}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Insert
                        </Button>
                      </div>
                    </div>
                    {ref.doi && (
                      <a
                        href={`https://doi.org/${ref.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-3 h-3" />
                        {ref.doi}
                      </a>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Summary */}
      <div className="text-xs text-muted-foreground text-center pt-2 border-t">
        {filteredReferences.length} of {references.length} citations
      </div>
    </div>
  );
}
