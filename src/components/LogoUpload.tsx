import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Loader2, Sparkles, X, FileText } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface LogoUploadProps {
  currentUrl: string | null;
  onUpload: (url: string) => void;
  proposalAcronym: string;
  proposalTitle: string;
  disabled?: boolean;
}

export function LogoUpload({
  currentUrl,
  onUpload,
  proposalAcronym,
  proposalTitle,
  disabled = false,
}: LogoUploadProps) {
  const { user } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [urlInput, setUrlInput] = useState(currentUrl || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('proposal-logos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('proposal-logos')
        .getPublicUrl(fileName);

      onUpload(publicUrl);
      setUrlInput(publicUrl);
      toast.success('Logo uploaded successfully');
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload logo');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleGenerateLogo = async () => {
    setIsGenerating(true);
    try {
      const keywords = proposalTitle.split(' ').slice(0, 5).join(', ');
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: {
          prompt: `Simple, modern, minimalist logo for a research project called "${proposalAcronym}". Keywords: ${keywords}. Clean design, professional, suitable for EU funding proposal.`,
        },
      });

      if (error) throw error;
      if (data?.imageUrl) {
        onUpload(data.imageUrl);
        setUrlInput(data.imageUrl);
        toast.success('Logo generated successfully');
      }
    } catch (error) {
      console.error('Failed to generate logo:', error);
      toast.error('Failed to generate logo');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUrlSubmit = () => {
    if (urlInput && urlInput !== currentUrl) {
      onUpload(urlInput);
      toast.success('Logo URL updated');
    }
  };

  const handleRemoveLogo = () => {
    onUpload('');
    setUrlInput('');
    toast.success('Logo removed');
  };

  return (
    <div className="flex items-start gap-6">
      {/* Logo Preview */}
      <div className="relative w-32 h-32 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/50 overflow-hidden flex-shrink-0">
        {currentUrl ? (
          <>
            <img
              src={currentUrl}
              alt={proposalAcronym}
              className="w-full h-full object-contain"
            />
            {!disabled && (
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-1 right-1 h-6 w-6"
                onClick={handleRemoveLogo}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </>
        ) : (
          <FileText className="w-12 h-12 text-muted-foreground/50" />
        )}
      </div>

      {/* Upload Controls */}
      <div className="flex-1 space-y-3">
        {!disabled && (
          <>
            {/* File Upload */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
                disabled={isUploading}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="gap-2"
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Upload Logo
              </Button>
            </div>

            {/* URL Input */}
            <div className="space-y-2">
              <Label htmlFor="logoUrl">Or enter URL</Label>
              <div className="flex gap-2">
                <Input
                  id="logoUrl"
                  placeholder="https://..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <Button
                  variant="secondary"
                  onClick={handleUrlSubmit}
                  disabled={!urlInput || urlInput === currentUrl}
                >
                  Apply
                </Button>
              </div>
            </div>

            {/* AI Generation */}
            <Button
              variant="outline"
              onClick={handleGenerateLogo}
              disabled={isGenerating}
              className="gap-2"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Auto-generate from keywords
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
