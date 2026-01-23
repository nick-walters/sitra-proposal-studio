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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, ImageIcon, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateProposalFilePath, uploadProposalFile } from "@/lib/proposalStorage";

interface ImageGeneratorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertImage: (imageUrl: string) => void;
  proposalId: string;
  sectionNumber?: string;
}

export function ImageGeneratorDialog({ isOpen, onClose, onInsertImage, proposalId, sectionNumber }: ImageGeneratorDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.info("Please describe the image you want to generate");
      return;
    }

    setIsGenerating(true);
    setGeneratedImage(null);

    try {
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: { prompt: prompt.trim() }
      });

      if (error) throw error;

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (data.imageUrl) {
        setGeneratedImage(data.imageUrl);
        toast.success("Image generated successfully!");
      } else {
        toast.error("Failed to generate image");
      }
    } catch (error) {
      console.error('Image generation error:', error);
      toast.error("Failed to generate image. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsert = async () => {
    if (!generatedImage) return;
    
    setIsUploading(true);
    try {
      // Fetch the generated image and upload to proposal storage
      const response = await fetch(generatedImage);
      const blob = await response.blob();
      
      // Generate a descriptive filename based on section and prompt
      const sectionPrefix = sectionNumber ? `section-${sectionNumber.replace(/\./g, '-')}` : 'ai';
      const promptSlug = prompt.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 30);
      const filename = `${sectionPrefix}-${promptSlug || 'generated'}.png`;
      
      // Upload to the proposal's figures folder
      const filePath = generateProposalFilePath(proposalId, 'figures', filename, {
        prefix: 'ai-generated',
        addTimestamp: true,
      });
      
      const { url, error } = await uploadProposalFile(blob, filePath, {
        contentType: 'image/png',
      });
      
      if (error) throw error;
      if (!url) throw new Error('Failed to get public URL');
      
      onInsertImage(url);
      handleClose();
    } catch (error) {
      console.error('Failed to upload generated image:', error);
      toast.error("Failed to save image to proposal storage");
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setPrompt('');
    setGeneratedImage(null);
    onClose();
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    
    const link = document.createElement('a');
    link.href = generatedImage;
    link.download = `generated-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            AI Image Generator
          </DialogTitle>
          <DialogDescription>
            Describe the image you want to create. The AI will generate a professional image suitable for your proposal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="image-prompt">Image Description</Label>
            <Textarea
              id="image-prompt"
              placeholder="E.g. a diagram showing the workflow of renewable energy distribution in urban areas, with solar panels, wind turbines, and smart grid connections..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="mt-1.5 min-h-[100px]"
            />
          </div>

          <Button 
            onClick={handleGenerate} 
            disabled={isGenerating || !prompt.trim()}
            className="w-full gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating Image...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate Image
              </>
            )}
          </Button>

          {generatedImage && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden border border-border">
                <img 
                  src={generatedImage} 
                  alt="Generated" 
                  className="w-full h-auto max-h-[300px] object-contain bg-muted"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDownload}
                  className="gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleInsert} 
            disabled={!generatedImage || isUploading}
            className="gap-2"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <ImageIcon className="w-4 h-4" />
                Insert Image
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
