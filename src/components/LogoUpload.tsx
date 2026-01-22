import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Loader2, Sparkles, X, Download } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

interface LogoUploadProps {
  currentUrl: string | null;
  onUpload: (url: string) => void;
  proposalAcronym: string;
  proposalTitle: string;
  disabled?: boolean;
}

// Generate a consistent color from acronym
function getAcronymColor(acronym: string): string {
  const colors = [
    'hsl(221, 83%, 53%)', // Blue
    'hsl(142, 76%, 36%)', // Green
    'hsl(262, 83%, 58%)', // Purple
    'hsl(24, 95%, 53%)',  // Orange
    'hsl(346, 77%, 50%)', // Red
    'hsl(199, 89%, 48%)', // Cyan
  ];
  let hash = 0;
  for (let i = 0; i < acronym.length; i++) {
    hash = acronym.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
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
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
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
      setGeneratedImageUrl(null);
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
      const keywords = proposalTitle.split(' ').slice(0, 3).join(' ');
      const { data, error } = await supabase.functions.invoke('generate-image', {
        body: {
          prompt: `Create a simple, bold logo icon for "${proposalAcronym}". Requirements: maximum 2 colors only (use one primary color and white or black), flat design with no gradients, fills the entire square canvas edge-to-edge, abstract geometric or symbolic shape representing "${keywords}", professional and modern, suitable for EU research project. No text, no letters, just an iconic symbol.`,
        },
      });

      if (error) throw error;
      if (data?.imageUrl) {
        onUpload(data.imageUrl);
        setGeneratedImageUrl(data.imageUrl);
        toast.success('Logo generated successfully');
      }
    } catch (error) {
      console.error('Failed to generate logo:', error);
      toast.error('Failed to generate logo');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadLogo = async () => {
    const urlToDownload = generatedImageUrl || currentUrl;
    if (!urlToDownload) return;

    try {
      const response = await fetch(urlToDownload);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${proposalAcronym}-logo.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Logo downloaded');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to download logo');
    }
  };

  const handleRemoveLogo = () => {
    onUpload('');
    setGeneratedImageUrl(null);
    toast.success('Logo removed');
  };

  const acronymColor = getAcronymColor(proposalAcronym);

  return (
    <div className="flex flex-col gap-4">
      {/* Logo Preview */}
      <div className="relative w-28 h-28 rounded-xl border bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
        {currentUrl ? (
          <>
            <img
              src={currentUrl}
              alt={proposalAcronym}
              className="w-full h-full object-cover"
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
          <div 
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: acronymColor }}
          >
            <span className="text-3xl font-bold text-white tracking-tight">
              {proposalAcronym.substring(0, 3).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Upload Controls */}
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          {/* File Upload */}
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
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="gap-1.5"
          >
            {isUploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Upload
          </Button>

          {/* AI Generation */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateLogo}
            disabled={isGenerating}
            className="gap-1.5"
          >
            {isGenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            Generate
          </Button>

          {/* Download button - only show if there's a logo */}
          {currentUrl && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadLogo}
              className="gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
