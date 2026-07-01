import { useState, useRef, useEffect, useCallback } from "react";
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

const CROP_SIZE = 200;

/** Draw the cropped circular avatar onto a canvas context.
 *  Used for BOTH the live preview and the final export — guaranteeing pixel-perfect match. */
function drawCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  natW: number, natH: number,
  size: number, zoom: number, posX: number, posY: number,
) {
  const minDim = Math.min(natW, natH);
  // scale so that at zoom=1 the shortest side fills the circle
  const s = (zoom * size) / minDim;

  ctx.clearRect(0, 0, size, size);

  // circular clip
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // position image center at canvas center + drag offset, then scale
  const imgW = natW * s;
  const imgH = natH * s;
  const dx = (size - imgW) / 2 + posX * (size / CROP_SIZE);
  const dy = (size - imgH) / 2 + posY * (size / CROP_SIZE);

  ctx.drawImage(img as CanvasImageSource, dx, dy, imgW, imgH);
  ctx.restore();
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
  const [, setPreviewImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState([1]);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [naturalDims, setNaturalDims] = useState({ width: 0, height: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const loadedImgRef = useRef<HTMLImageElement | null>(null);

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
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        loadedImgRef.current = img;
        setNaturalDims({ width: img.naturalWidth, height: img.naturalHeight });
        setPreviewImage(dataUrl);
        setZoom([1]);
        setPosition({ x: 0, y: 0 });
        setCropDialogOpen(true);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const baseWidth = naturalDims.width === 0 ? 0 : (naturalDims.width / Math.min(naturalDims.width, naturalDims.height)) * CROP_SIZE;
  const baseHeight = naturalDims.height === 0 ? 0 : (naturalDims.height / Math.min(naturalDims.width, naturalDims.height)) * CROP_SIZE;

  const clampPosition = useCallback((pos: { x: number; y: number }, z: number) => {
    const maxX = Math.max(0, (baseWidth * z - CROP_SIZE) / 2);
    const maxY = Math.max(0, (baseHeight * z - CROP_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, pos.x)),
      y: Math.min(maxY, Math.max(-maxY, pos.y)),
    };
  }, [baseWidth, baseHeight]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const raw = { x: e.clientX - dragStart.x, y: e.clientY - dragStart.y };
    setPosition(clampPosition(raw, zoom[0]));
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleZoomChange = (val: number[]) => {
    setZoom(val);
    setPosition(prev => clampPosition(prev, val[0]));
  };

  // Redraw preview canvas whenever zoom/position/image changes
  useEffect(() => {
    if (!cropDialogOpen || naturalDims.width === 0) return;

    const draw = () => {
      const canvas = previewCanvasRef.current;
      const img = loadedImgRef.current;
      if (!canvas || !img) return false;
      canvas.width = CROP_SIZE;
      canvas.height = CROP_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      drawCrop(ctx, img, naturalDims.width, naturalDims.height, CROP_SIZE, zoom[0], position.x, position.y);
      return true;
    };

    // Canvas may not be mounted yet when dialog first opens; retry once after a frame
    if (!draw()) {
      const raf = requestAnimationFrame(() => draw());
      return () => cancelAnimationFrame(raf);
    }
  }, [zoom, position, naturalDims, cropDialogOpen]);

  const cropAndUpload = async () => {
    if (!loadedImgRef.current || !exportCanvasRef.current) return;

    setUploading(true);

    try {
      const canvas = exportCanvasRef.current;
      const outputSize = 256;
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      const img = loadedImgRef.current;

      // Use the SAME drawCrop function as the preview — just at 256px instead of 200px
      drawCrop(ctx, img, naturalDims.width, naturalDims.height, outputSize, zoom[0], position.x, position.y);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        }, 'image/jpeg', 0.9);
      });

      const fileName = `${userId}/avatar-${Date.now()}.jpg`;

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

      const { data: { publicUrl } } = supabase.storage
        .from('profile-avatars')
        .getPublicUrl(fileName);

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
        <div
          className="relative group cursor-pointer"
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <Avatar className="w-20 h-20 border-2 border-border">
            <AvatarImage src={currentAvatarUrl || undefined} />
            <AvatarFallback className="text-xl bg-primary/10 text-primary font-medium">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
          <div
            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
          >
            <Camera className="w-6 h-6 text-white" />
          </div>
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
          onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
          className="hidden"
        />
      </div>

      {/* Hidden canvas for export */}
      <canvas ref={exportCanvasRef} className="hidden" />

      {/* Crop Dialog */}
      <Dialog open={cropDialogOpen} onOpenChange={setCropDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crop profile photo</DialogTitle>
            <DialogDescription>
              Drag to reposition and use the slider to zoom
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Canvas-based crop preview */}
            <div
              className="relative w-[200px] h-[200px] mx-auto cursor-move"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <canvas
                ref={previewCanvasRef}
                width={CROP_SIZE}
                height={CROP_SIZE}
                className="w-[200px] h-[200px] rounded-full ring-2 ring-border"
              />
            </div>

            {/* Zoom slider */}
            <div className="space-y-2 px-4">
              <label className="text-sm text-muted-foreground">Zoom</label>
              <Slider
                value={zoom}
                onValueChange={handleZoomChange}
                min={1}
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
