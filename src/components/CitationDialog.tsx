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
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, CheckCircle2, AlertCircle, BookOpen, Library, Plus, PenLine, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import DOMPurify from "dompurify";
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
  onUpdateReference?: (refId: string, updates: Partial<Omit<ProposalReference, 'id' | 'proposal_id' | 'created_at'>>) => Promise<boolean>;
  /** Proposal-wide citation display order, by internal citation_number. */
  citationDisplayOrder?: Map<number, number>;
}

export function CitationDialog({
  isOpen,
  onClose,
  onInsertCitation,
  proposalReferences,
  isLoadingReferences,
  nextCitationNumber,
  onUpdateReference,
  citationDisplayOrder,
}: CitationDialogProps) {
  const [activeTab, setActiveTab] = useState<string>('library');
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundReference, setFoundReference] = useState<Reference | null>(null);
  const [formattedCitation, setFormattedCitation] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  // Manual entry state
  const [manualAuthors, setManualAuthors] = useState('');
  const [manualYear, setManualYear] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualJournal, setManualJournal] = useState('');
  const [manualVolume, setManualVolume] = useState('');
  const [manualPages, setManualPages] = useState('');
  const [manualDoi, setManualDoi] = useState('');
  const [manualFormatted, setManualFormatted] = useState('');

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

    resetAndClose();
  };

  const handleRejectAndWriteManually = () => {
    // Pre-fill manual fields from the rejected lookup if available
    if (foundReference) {
      setManualAuthors(foundReference.authors.join(', '));
      setManualYear(foundReference.year?.toString() || '');
      setManualTitle(foundReference.title);
      setManualJournal(foundReference.journal || '');
      setManualVolume(foundReference.volume || '');
      setManualPages(foundReference.pages || '');
      setManualDoi(foundReference.doi || '');
      setManualFormatted(formattedCitation);
    }
    setFoundReference(null);
    setFormattedCitation('');
    setIsVerified(false);
    setNeedsVerification(false);
    setActiveTab('manual');
  };

  const handleManualInsert = () => {
    if (!manualTitle.trim()) {
      toast.error("Please enter at least a title");
      return;
    }

    const reference: Reference = {
      authors: manualAuthors.split(',').map(a => a.trim()).filter(Boolean),
      year: manualYear ? parseInt(manualYear) : null,
      title: manualTitle.trim(),
      journal: manualJournal.trim() || null,
      volume: manualVolume.trim() || null,
      pages: manualPages.trim() || null,
      doi: manualDoi.trim() || null,
    };

    // Build formatted citation if not provided
    let formatted = manualFormatted.trim();
    if (!formatted) {
      const parts: string[] = [];
      if (reference.authors.length > 0) parts.push(reference.authors.join(', '));
      if (reference.year) parts.push(`(${reference.year})`);
      if (reference.title) parts.push(reference.title);
      if (reference.journal) parts.push(`*${reference.journal}*`);
      if (reference.volume) parts.push(reference.volume);
      if (reference.pages) parts.push(`:${reference.pages}`);
      if (reference.doi) parts.push(`DOI: ${reference.doi}`);
      formatted = parts.join('. ');
    }

    const existingRef = proposalReferences.find(
      ref =>
        (ref.doi && ref.doi === reference.doi) ||
        (ref.title.toLowerCase() === reference.title.toLowerCase() &&
          ref.year === reference.year)
    );

    if (existingRef) {
      toast.warning("This reference has already been cited. Using existing citation number.");
      onInsertCitation(reference, formatted, existingRef.citation_number);
    } else {
      onInsertCitation(reference, formatted, nextCitationNumber);
    }

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
    setManualAuthors('');
    setManualYear('');
    setManualTitle('');
    setManualJournal('');
    setManualVolume('');
    setManualPages('');
    setManualDoi('');
    setManualFormatted('');
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
            Choose from existing citations, look up by DOI/title, or write manually.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="library" className="flex items-center gap-1.5">
              <Library className="w-4 h-4" />
              Library
              {proposalReferences.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {proposalReferences.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="add" className="flex items-center gap-1.5">
              <Search className="w-4 h-4" />
              Lookup
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-1.5">
              <PenLine className="w-4 h-4" />
              Manual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="mt-4">
            <CitationLibrary
              references={proposalReferences}
              isLoading={isLoadingReferences}
              onSelectReference={handleInsertFromLibrary}
              onUpdateReference={onUpdateReference}
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
                  <Label className="text-xs text-muted-foreground">Formatted citation:</Label>
                  <p className="text-xs mt-1 p-2 bg-muted rounded" 
                     dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(formattedCitation.replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'), { ALLOWED_TAGS: ['em', 'strong'] }) }} 
                  />
                </div>

                <div className="flex gap-2">
                  {needsVerification && (
                    <Button variant="outline" size="sm" onClick={handleVerify} className="flex-1">
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Confirm Correct
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleRejectAndWriteManually} className="flex-1 text-muted-foreground">
                    <X className="w-4 h-4 mr-1" />
                    Incorrect — Write Manually
                  </Button>
                </div>
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

          <TabsContent value="manual" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="manual-title" className="text-xs">Title *</Label>
                <Input
                  id="manual-title"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Article or book title"
                  className="h-8 text-sm"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="manual-authors" className="text-xs">Authors</Label>
                <Input
                  id="manual-authors"
                  value={manualAuthors}
                  onChange={(e) => setManualAuthors(e.target.value)}
                  placeholder="Author A, Author B, Author C"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-year" className="text-xs">Year</Label>
                <Input
                  id="manual-year"
                  value={manualYear}
                  onChange={(e) => setManualYear(e.target.value)}
                  placeholder="2024"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-doi" className="text-xs">DOI</Label>
                <Input
                  id="manual-doi"
                  value={manualDoi}
                  onChange={(e) => setManualDoi(e.target.value)}
                  placeholder="10.1234/..."
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-journal" className="text-xs">Journal / Source</Label>
                <Input
                  id="manual-journal"
                  value={manualJournal}
                  onChange={(e) => setManualJournal(e.target.value)}
                  placeholder="Journal name"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="manual-volume" className="text-xs">Volume</Label>
                  <Input
                    id="manual-volume"
                    value={manualVolume}
                    onChange={(e) => setManualVolume(e.target.value)}
                    placeholder="Vol."
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="manual-pages" className="text-xs">Pages</Label>
                  <Input
                    id="manual-pages"
                    value={manualPages}
                    onChange={(e) => setManualPages(e.target.value)}
                    placeholder="1–10"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manual-formatted" className="text-xs">Full formatted citation (optional override)</Label>
              <Textarea
                id="manual-formatted"
                value={manualFormatted}
                onChange={(e) => setManualFormatted(e.target.value)}
                placeholder="If left empty, a citation will be auto-generated from the fields above."
                rows={2}
                className="text-sm"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button variant="outline" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button onClick={handleManualInsert} disabled={!manualTitle.trim()}>
                Insert Citation
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
