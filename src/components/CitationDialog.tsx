import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, CheckCircle2, AlertCircle, BookOpen, Library, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CitationLibrary } from "./CitationLibrary";
import { ProposalReference } from "@/hooks/useProposalReferences";

interface Reference {
  authors: string[];
  year: number | null;
  title: string;
  journal: string | null;
  volume: string | null;
  pages: string | null;
  doi: string | null;
}

interface CitationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertCitation: (reference: Reference, formattedCitation: string, citationNumber: number) => void;
  proposalReferences: ProposalReference[];
  isLoadingReferences: boolean;
  nextCitationNumber: number;
}

export function CitationDialog({
  isOpen,
  onClose,
  onInsertCitation,
  proposalReferences,
  isLoadingReferences,
  nextCitationNumber
}: CitationDialogProps) {
  const [activeTab, setActiveTab] = useState<string>('library');
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundReference, setFoundReference] = useState<Reference | null>(null);
  const [formattedCitation, setFormattedCitation] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) {
      toast.info("Please enter a DOI, title, or author");
      return;
    }

    setIsSearching(true);
    setFoundReference(null);
    setIsVerified(false);
    setNeedsVerification(false);

    try {
      const { data, error } = await supabase.functions.invoke('lookup-reference', {
        body: { query: query.trim() }
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.message || data.error);
        return;
      }

      setFoundReference(data.reference);
      setFormattedCitation(data.formattedCitation);
      setIsVerified(data.verified);
      setNeedsVerification(!data.verified);

      if (data.verified) {
        toast.success("Reference found and verified!");
      } else {
        toast.info(data.message || "Please verify this is the correct reference");
      }
    } catch (error) {
      console.error('Reference lookup error:', error);
      toast.error("Failed to lookup reference. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleConfirm = () => {
    if (!foundReference) return;

    // Check for duplicates in proposal references
    const existingRef = proposalReferences.find(
      ref => 
        (ref.doi && ref.doi === foundReference.doi) || 
        (ref.title.toLowerCase() === foundReference.title.toLowerCase() && 
          ref.year === foundReference.year)
    );

    if (existingRef) {
      toast.warning("This reference has already been cited. Using existing citation number.");
      onInsertCitation(foundReference, formattedCitation, existingRef.citation_number);
    } else {
      onInsertCitation(foundReference, formattedCitation, nextCitationNumber);
    }

    // Reset and close
    resetAndClose();
  };

  const handleInsertFromLibrary = (ref: ProposalReference) => {
    const reference: Reference = {
      authors: ref.authors || [],
      year: ref.year,
      title: ref.title,
      journal: ref.journal,
      volume: ref.volume,
      pages: ref.pages,
      doi: ref.doi,
    };
    
    onInsertCitation(reference, ref.formatted_citation || '', ref.citation_number);
    resetAndClose();
  };

  const resetAndClose = () => {
    setQuery('');
    setFoundReference(null);
    setFormattedCitation('');
    setIsVerified(false);
    setNeedsVerification(false);
    setActiveTab('library');
    onClose();
  };

  const handleVerify = () => {
    setIsVerified(true);
    setNeedsVerification(false);
    toast.success("Reference verified!");
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && resetAndClose()}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Add Citation
          </DialogTitle>
          <DialogDescription>
            Choose from existing citations or add a new one by DOI or title.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="library" className="flex items-center gap-1.5">
              <Library className="w-4 h-4" />
              Citation Library
              {proposalReferences.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {proposalReferences.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="add" className="flex items-center gap-1.5">
              <Plus className="w-4 h-4" />
              Add New
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-4">
            <CitationLibrary
              references={proposalReferences}
              isLoading={isLoadingReferences}
              onSelectReference={handleInsertFromLibrary}
            />
          </TabsContent>

          <TabsContent value="add" className="mt-4 space-y-4">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="reference-query" className="sr-only">Reference</Label>
                <Input
                  id="reference-query"
                  placeholder="Enter DOI (e.g. 10.1234/...) or author, year, title..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
              </div>
              <Button onClick={handleSearch} disabled={isSearching}>
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>

            {foundReference && (
              <Card className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{foundReference.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {foundReference.authors.join(', ')}
                      {foundReference.year && ` (${foundReference.year})`}
                    </p>
                    {foundReference.journal && (
                      <p className="text-xs text-muted-foreground">
                        <em>{foundReference.journal}</em>
                        {foundReference.volume && ` ${foundReference.volume}`}
                        {foundReference.pages && `:${foundReference.pages}`}
                      </p>
                    )}
                    {foundReference.doi && (
                      <p className="text-xs text-primary mt-1">
                        DOI: {foundReference.doi}
                      </p>
                    )}
                  </div>
                  {isVerified ? (
                    <Badge variant="secondary" className="bg-success/10 text-success border-success/20 gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Needs verification
                    </Badge>
                  )}
                </div>

                <div className="pt-2 border-t border-border">
                  <Label className="text-xs text-muted-foreground">Formatted Citation:</Label>
                  <p className="text-xs mt-1 p-2 bg-muted rounded" 
                     dangerouslySetInnerHTML={{ __html: formattedCitation.replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>') }} 
                  />
                </div>

                {needsVerification && (
                  <Button variant="outline" size="sm" onClick={handleVerify} className="w-full">
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Confirm This Is Correct
                  </Button>
                )}
              </Card>
            )}

            {activeTab === 'add' && (
              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={resetAndClose}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirm} 
                  disabled={!foundReference || (needsVerification && !isVerified)}
                >
                  Insert Citation
                </Button>
              </DialogFooter>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
