import { useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, Loader2, Trash2, Upload } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface ProfilePhotoUploadProps {
  userId: string;
  currentAvatarUrl: string | null;
  firstName: string;
  lastName: string;
  email: string;
  onAvatarChange: (url: string | null) => void;
}

export function ProfilePhotoUpload({
  userId,
  currentAvatarUrl,
  firstName,
  lastName,
  email,
  onAvatarChange,
}: ProfilePhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState([1]);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const getInitials = () => {
    if (firstName || lastName) {
      return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setPreviewImage(event.target?.result as string);
      setZoom([1]);
      setPosition({ x: 0, y: 0 });
      setCropDialogOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const cropAndUpload = async () => {
    if (!previewImage || !canvasRef.current) return;

    setUploading(true);

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = previewImage;
      });

      // Set canvas size (output will be 256x256)
      const outputSize = 256;
      canvas.width = outputSize;
      canvas.height = outputSize;

      // Calculate crop area - match the preview exactly
      const cropSize = 200; // Size of visible crop area in the dialog
      const ratio = outputSize / cropSize;
      
      // Scale the image to fit the crop area, then apply zoom
      const baseScale = cropSize / Math.min(img.width, img.height);
      const scale = baseScale * zoom[0];
      
      const scaledWidth = img.width * scale * ratio;
      const scaledHeight = img.height * scale * ratio;
      
      // Center the image and apply drag offset
      const offsetX = (outputSize - scaledWidth) / 2 + (position.x * ratio);
      const offsetY = (outputSize - scaledHeight) / 2 + (position.y * ratio);

      // Draw circular clip
      ctx.beginPath();
      ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Fill with white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, outputSize, outputSize);

      // Draw the image
      ctx.drawImage(img, offsetX, offsetY, scaledWidth, scaledHeight);

      // Convert to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        }, 'image/jpeg', 0.9);
      });

      // Upload to storage
      const fileName = `${userId}/avatar-${Date.now()}.jpg`;
      
      // Delete old avatar if exists
      if (currentAvatarUrl) {
        const oldPath = currentAvatarUrl.split('/profile-avatars/')[1];
        if (oldPath) {
          await supabase.storage.from('profile-avatars').remove([oldPath]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('profile-avatars')
        .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(fileName);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      onAvatarChange(publicUrl);
      setCropDialogOpen(false);
      setPreviewImage(null);
      toast.success('Profile photo updated');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!currentAvatarUrl) return;

    setUploading(true);
    try {
      const oldPath = currentAvatarUrl.split('/profile-avatars/')[1];
      if (oldPath) {
        await supabase.storage.from('profile-avatars').remove([oldPath]);
      }

      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId);

      if (error) throw error;

      onAvatarChange(null);
      toast.success('Profile photo removed');
    } catch (error) {
      console.error('Error removing avatar:', error);
      toast.error('Failed to remove photo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <div className="relative group">
          <Avatar className="w-20 h-20 border-2 border-border">
            <AvatarImage src={currentAvatarUrl || undefined} />
            <AvatarFallback className="text-xl bg-primary/10 text-primary font-medium">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            disabled={uploading}
          >
            <Camera className="w-6 h-6 text-white" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="gap-2"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload Photo
          </Button>
          {currentAvatarUrl && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemovePhoto}
              disabled={uploading}
              className="gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              Remove
            </Button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Hidden canvas for cropping */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Crop Dialog */}
      <Dialog open={cropDialogOpen} onOpenChange={setCropDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crop Profile Photo</DialogTitle>
            <DialogDescription>
              Drag to reposition and use the slider to zoom
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Crop preview area */}
            <div 
              className="relative w-[200px] h-[200px] mx-auto rounded-full overflow-hidden bg-muted cursor-move border-2 border-border"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
            {previewImage && (
                <img
                  ref={(el) => { imageRef.current = el; }}
                  src={previewImage}
                  alt="Preview"
                  className="absolute select-none pointer-events-none"
                  style={{
                    left: '50%',
                    top: '50%',
                    transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${zoom[0]})`,
                    transformOrigin: 'center',
                    maxWidth: 'none',
                    width: 'auto',
                    height: 'auto',
                    minWidth: '200px',
                    minHeight: '200px',
                    objectFit: 'cover',
                  }}
                  draggable={false}
                />
              )}
            </div>

            {/* Zoom slider */}
            <div className="space-y-2 px-4">
              <label className="text-sm text-muted-foreground">Zoom</label>
              <Slider
                value={zoom}
                onValueChange={setZoom}
                min={0.5}
                max={3}
                step={0.1}
                className="w-full"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setCropDialogOpen(false);
                  setPreviewImage(null);
                }}
                disabled={uploading}
              >
                Cancel
              </Button>
              <Button onClick={cropAndUpload} disabled={uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  'Save Photo'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
