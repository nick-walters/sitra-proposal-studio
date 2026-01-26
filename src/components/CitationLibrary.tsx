import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Plus, ExternalLink, CheckCircle2 } from "lucide-react";
import { useState, useMemo } from "react";
import { ProposalReference } from "@/hooks/useProposalReferences";

interface CitationLibraryProps {
  references: ProposalReference[];
  isLoading: boolean;
  onSelectReference: (reference: ProposalReference) => void;
}

export function CitationLibrary({ 
  references, 
  isLoading,
  onSelectReference 
}: CitationLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');

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
        <p className="text-xs mt-1">Use the "Add New" tab to add your first citation.</p>
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
                className="group p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => onSelectReference(ref)}
              >
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectReference(ref);
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Insert
                  </Button>
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
