import { Section } from "@/types/proposal";
import { EditorToolbar } from "./EditorToolbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Info, Video, ImageIcon } from "lucide-react";
import { useState } from "react";

interface DocumentEditorProps {
  section: Section | null;
  proposalAcronym: string;
}

export function DocumentEditor({ section, proposalAcronym }: DocumentEditorProps) {
  const [content, setContent] = useState(section?.content || '');

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
    <div className="flex-1 flex flex-col min-h-0">
      <EditorToolbar />
      
      <div className="flex-1 overflow-auto p-6 bg-muted/30">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Section Header */}
          <div className="flex items-center gap-3 mb-6">
            <Badge variant="outline" className="text-primary border-primary">
              Section {section.number}
            </Badge>
            {section.wordLimit && (
              <Badge variant="secondary">
                Word limit: {section.wordLimit}
              </Badge>
            )}
            {section.pageLimit && (
              <Badge variant="secondary">
                Page limit: {section.pageLimit}
              </Badge>
            )}
          </div>

          {/* Guidelines Panel */}
          {section.guidelines && (
            <Card className="p-4 bg-accent/50 border-primary/20">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-medium text-sm text-primary mb-2">Guidelines</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {section.guidelines.text}
                  </p>
                  {(section.guidelines.imageUrl || section.guidelines.videoUrl) && (
                    <div className="flex items-center gap-3 mt-3">
                      {section.guidelines.imageUrl && (
                        <button className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                          <ImageIcon className="w-3.5 h-3.5" />
                          View image guide
                        </button>
                      )}
                      {section.guidelines.videoUrl && (
                        <button className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                          <Video className="w-3.5 h-3.5" />
                          Watch video guide
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* Document Page */}
          <div className="document-page animate-fade-in">
            {/* Page Header */}
            <h1 className="document-h1 text-foreground mb-6">
              {section.number} {section.title}
            </h1>

            {/* Editable Content Area */}
            <div
              className="document-content min-h-[400px] outline-none"
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => setContent(e.currentTarget.textContent || '')}
              style={{ fontFamily: '"Times New Roman", Times, serif' }}
            >
              {content || (
                <span className="text-muted-foreground italic">
                  Click here to start writing...
                </span>
              )}
            </div>

            {/* Page Footer */}
            <div className="mt-auto pt-8 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
              <span>{proposalAcronym}</span>
              <span>Section {section.number}: {section.title}</span>
              <span>Page 1 of 1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
