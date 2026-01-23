import { Section } from "@/types/proposal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, BookOpen, Wand2, BarChart3, Route, History, FileText, Info } from "lucide-react";
import { useState, useCallback } from "react";
import { RichTextEditor } from "./RichTextEditor";
import { GrammarChecker } from "./GrammarChecker";
import { CitationDialog } from "./CitationDialog";
import { ImageGeneratorDialog } from "./ImageGeneratorDialog";
import { InsertFigureDialog } from "./InsertFigureDialog";
import { ImpactPathwayGenerator } from "./ImpactPathwayGenerator";
import { SectionVersionHistoryDialog } from "./SectionVersionHistoryDialog";
import { GuidelinesDialog } from "./GuidelinesDialog";
import { WordCountBadge } from "./WordCountBadge";
import { SaveIndicator } from "./SaveIndicator";
import { useSectionContent } from "@/hooks/useSectionContent";
import { Skeleton } from "@/components/ui/skeleton";

interface Reference {
  authors: string[];
  year: number | null;
  title: string;
  journal: string | null;
  volume: string | null;
  pages: string | null;
  doi: string | null;
}

interface DocumentEditorProps {
  section: Section | null;
  proposalId: string;
  proposalAcronym: string;
  readOnly?: boolean;
  topicId?: string;
  workProgramme?: string;
  destination?: string;
}

export function DocumentEditor({ 
  section, 
  proposalId, 
  proposalAcronym, 
  readOnly = false,
  topicId,
  workProgramme,
  destination,
}: DocumentEditorProps) {
  const [isGrammarOpen, setIsGrammarOpen] = useState(false);
  const [isCitationOpen, setIsCitationOpen] = useState(false);
  const [isImageGenOpen, setIsImageGenOpen] = useState(false);
  const [isFigureDialogOpen, setIsFigureDialogOpen] = useState(false);
  const [isImpactPathwayOpen, setIsImpactPathwayOpen] = useState(false);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [isGuidelinesOpen, setIsGuidelinesOpen] = useState(false);
  const [references, setReferences] = useState<Reference[]>([]);
  const [footnotes, setFootnotes] = useState<Array<{ number: number; citation: string }>>([]);

  // Use the section content hook for database persistence and real-time updates
  // IMPORTANT: Always call hooks with the same parameters to avoid "rendered more hooks" error
  const sectionContentHook = useSectionContent({
    proposalId: proposalId || '',
    sectionId: section?.id || '',
  });
  
  const { content, setContent, loading, saving, lastSaved } = sectionContentHook;

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
  }, [setContent]);

  const handleInsertCitation = useCallback((reference: Reference, formattedCitation: string, citationNumber: number) => {
    // Add superscript citation to content
    const superscript = `<sup>${citationNumber}</sup>`;
    setContent(content + superscript);
    
    // Add to references if new
    if (!references.some(r => r.doi === reference.doi)) {
      setReferences(prev => [...prev, reference]);
      setFootnotes(prev => [...prev, { number: citationNumber, citation: formattedCitation }]);
    }
  }, [references, content, setContent]);

  const handleInsertImage = useCallback((imageUrl: string) => {
    const imgTag = `<img src="${imageUrl}" alt="Generated image" class="max-w-full h-auto my-4" />`;
    setContent(content + imgTag);
  }, [content, setContent]);

  const handleInsertFigure = useCallback((figure: { figureNumber: string; title: string }) => {
    const figureRef = `<span class="figure-reference text-primary cursor-pointer hover:underline">(see Figure ${figure.figureNumber})</span>`;
    setContent(content + figureRef);
  }, [content, setContent]);

  const handleApplyGrammarSuggestion = useCallback((original: string, replacement: string) => {
    setContent(content.replace(original, replacement));
  }, [content, setContent]);

  const handleInsertImpactContent = useCallback((impactContent: string) => {
    setContent(content + impactContent);
  }, [content, setContent]);

  const handleRestoreVersion = useCallback((restoredContent: string) => {
    setContent(restoredContent);
  }, [setContent]);

  // Check if this is the B2.1 section (impact pathways)
  const isImpactSection = section?.id === 'b2-1' || section?.number === '2.1';
  // Strip HTML for grammar checking
  const plainText = content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

  if (!section) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
            <Info className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground">Select a section to begin editing</h3>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Choose a section from the navigation panel on the left
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Fixed toolbar container */}
      <div className="sticky top-0 z-10 bg-background">
        {/* Features Toolbar */}
        <div className="flex items-center justify-between p-2 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            {/* Guidelines button - first, non-AI feature */}
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2"
              onClick={() => setIsGuidelinesOpen(true)}
            >
              <FileText className="w-4 h-4" />
              Guidelines
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setIsGrammarOpen(true)}>
              <Sparkles className="w-4 h-4" />
              Grammar Check
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2" 
              onClick={() => setIsCitationOpen(true)}
              disabled={readOnly}
            >
              <BookOpen className="w-4 h-4" />
              Add Citation
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2" 
              onClick={() => setIsImageGenOpen(true)}
              disabled={readOnly}
            >
              <Wand2 className="w-4 h-4" />
              AI Image
            </Button>
            {/* Only show Insert Figure for Part B sections */}
            {section && !section.isPartA && (
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2" 
                onClick={() => setIsFigureDialogOpen(true)}
                disabled={readOnly}
              >
                <BarChart3 className="w-4 h-4" />
                Insert Figure
              </Button>
            )}
            {/* Impact Pathway Generator for B2.1 section */}
            {isImpactSection && (
              <Button 
                variant="outline" 
                size="sm" 
                className="gap-2 bg-primary/5 border-primary/30 hover:bg-primary/10" 
                onClick={() => setIsImpactPathwayOpen(true)}
                disabled={readOnly}
              >
                <Route className="w-4 h-4" />
                Impact Pathways
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              className="gap-2 text-muted-foreground" 
              onClick={() => setIsVersionHistoryOpen(true)}
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">History</span>
            </Button>
            <WordCountBadge content={content} wordLimit={section.wordLimit} />
            {!readOnly && <SaveIndicator saving={saving} lastSaved={lastSaved} />}
          </div>
        </div>

        {/* Formatting Toolbar - rendered by RichTextEditor but we need to extract it */}
      </div>

      <div className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Section Header - word/page limits only */}
          {(section.wordLimit || section.pageLimit) && (
            <div className="flex items-center gap-3 mb-6">
              {section.wordLimit && (
                <Badge variant="secondary">Word limit: {section.wordLimit}</Badge>
              )}
              {section.pageLimit && (
                <Badge variant="secondary">Page limit: {section.pageLimit}</Badge>
              )}
            </div>
          )}

          {/* Document Page with Rich Text Editor */}
          <div className="document-page animate-fade-in">
            <h1 className="document-h1 text-foreground mb-6">{section.number} {section.title}</h1>
            
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : (
              <RichTextEditor
                content={content}
                onChange={readOnly ? () => {} : handleContentChange}
                onInsertImage={() => setIsImageGenOpen(true)}
              />
            )}

            {/* Footnotes */}
            {footnotes.length > 0 && (
              <div className="mt-8 pt-4 border-t border-border">
                <div className="space-y-1">
                  {footnotes.map((fn) => (
                    <p key={fn.number} className="text-[8pt] text-muted-foreground" 
                       dangerouslySetInnerHTML={{ 
                         __html: `<sup>${fn.number}</sup> ${fn.citation.replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}` 
                       }} 
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Page Footer */}
            <div className="mt-auto pt-8 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
              <span>{proposalAcronym}</span>
              <span>Section {section.number}: {section.title}</span>
              <span>Page 1 of 1</span>
            </div>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <GrammarChecker
        text={plainText}
        onApplySuggestion={handleApplyGrammarSuggestion}
        isOpen={isGrammarOpen}
        onClose={() => setIsGrammarOpen(false)}
      />
      <CitationDialog
        isOpen={isCitationOpen}
        onClose={() => setIsCitationOpen(false)}
        onInsertCitation={handleInsertCitation}
        existingReferences={references}
        nextCitationNumber={references.length + 1}
      />
      <ImageGeneratorDialog
        isOpen={isImageGenOpen}
        onClose={() => setIsImageGenOpen(false)}
        onInsertImage={handleInsertImage}
      />
      <InsertFigureDialog
        isOpen={isFigureDialogOpen}
        onClose={() => setIsFigureDialogOpen(false)}
        proposalId={proposalId}
        currentSectionId={section?.id || ''}
        onInsertFigure={handleInsertFigure}
      />
      <ImpactPathwayGenerator
        isOpen={isImpactPathwayOpen}
        onClose={() => setIsImpactPathwayOpen(false)}
        proposalId={proposalId}
        topicId={topicId}
        workProgramme={workProgramme}
        destination={destination}
        onInsertContent={handleInsertImpactContent}
      />
      <SectionVersionHistoryDialog
        isOpen={isVersionHistoryOpen}
        onClose={() => setIsVersionHistoryOpen(false)}
        proposalId={proposalId}
        sectionId={section?.id || ''}
        sectionTitle={`${section?.number || ''} ${section?.title || ''}`}
        onRestoreVersion={handleRestoreVersion}
      />
      <GuidelinesDialog
        isOpen={isGuidelinesOpen}
        onClose={() => setIsGuidelinesOpen(false)}
        sectionTitle={`${section?.number || ''} ${section?.title || ''}`}
        guidelines={section?.guidelinesArray || []}
      />
    </div>
  );
}
