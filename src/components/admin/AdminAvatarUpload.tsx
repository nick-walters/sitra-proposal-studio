import { useState, useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Camera, Loader2 } from "lucide-react";

interface AdminAvatarUploadProps {
  userId: string;
  avatarUrl: string | null;
  initials: string;
  onAvatarChange: (userId: string, newUrl: string) => void;
}

export function AdminAvatarUpload({ userId, avatarUrl, initials, onAvatarChange }: AdminAvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState([1]);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Please select an image"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be < 5MB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setImgDims({ width: img.naturalWidth, height: img.naturalHeight });
        setPreviewImage(url);
        setZoom([1]);
        setPosition({ x: 0, y: 0 });
        setCropOpen(true);
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const CROP_SIZE = 200;

  const baseWidth = imgDims.width === 0 ? 0 : (imgDims.width / Math.min(imgDims.width, imgDims.height)) * CROP_SIZE;
  const baseHeight = imgDims.height === 0 ? 0 : (imgDims.height / Math.min(imgDims.width, imgDims.height)) * CROP_SIZE;

  const clampPosition = (pos: { x: number; y: number }, z: number) => {
    const maxX = Math.max(0, (baseWidth * z - CROP_SIZE) / 2);
    const maxY = Math.max(0, (baseHeight * z - CROP_SIZE) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, pos.x)),
      y: Math.min(maxY, Math.max(-maxY, pos.y)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition(clampPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }, zoom[0]));
  };
  const handleMouseUp = () => setIsDragging(false);
  const handleZoomChange = (val: number[]) => {
    setZoom(val);
    setPosition(prev => clampPosition(prev, val[0]));
  };

  const cropAndUpload = async () => {
    if (!previewImage || !canvasRef.current) return;
    setUploading(true);
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");

      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = previewImage; });

      const out = 256;
      canvas.width = out;
      canvas.height = out;
      // Compute source rectangle directly from crop parameters
      const minDim = Math.min(img.naturalWidth, img.naturalHeight);
      const srcSize = minDim / zoom[0];
      const srcCenterX = img.naturalWidth / 2 - (position.x * minDim) / (CROP_SIZE * zoom[0]);
      const srcCenterY = img.naturalHeight / 2 - (position.y * minDim) / (CROP_SIZE * zoom[0]);

      ctx.beginPath();
      ctx.arc(out / 2, out / 2, out / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, out, out);
      ctx.drawImage(
        img,
        srcCenterX - srcSize / 2, srcCenterY - srcSize / 2, srcSize, srcSize,
        0, 0, out, out
      );

      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), "image/jpeg", 0.9));
      const fileName = `${userId}/avatar-${Date.now()}.jpg`;

      // Remove old avatar
      if (avatarUrl) {
        const oldPath = avatarUrl.split("/profile-avatars/")[1];
        if (oldPath) await supabase.storage.from("profile-avatars").remove([oldPath]);
      }

      const { error: upErr } = await supabase.storage.from("profile-avatars").upload(fileName, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;

      const { data: { publicUrl } } = supabase.storage.from("profile-avatars").getPublicUrl(fileName);
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", userId);
      if (updErr) throw updErr;

      onAvatarChange(userId, publicUrl);
      setCropOpen(false);
      setPreviewImage(null);
      toast.success("Profile photo updated");
    } catch (err) {
      console.error(err);
      toast.error("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
        <Avatar className="h-8 w-8">
          <AvatarImage src={avatarUrl || undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera className="w-3.5 h-3.5 text-white" />
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      <canvas ref={canvasRef} className="hidden" />

      <Dialog open={cropOpen} onOpenChange={setCropOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crop Profile Photo</DialogTitle>
            <DialogDescription>Drag to reposition and use the slider to zoom</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div
              className="relative w-[200px] h-[200px] mx-auto rounded-full overflow-hidden bg-muted cursor-move ring-2 ring-border"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {previewImage && imgDims.width > 0 && (
                  <img
                    src={previewImage}
                    alt="Preview"
                    className="absolute select-none pointer-events-none"
                    style={{
                      width: `${baseWidth * zoom[0]}px`,
                      height: `${baseHeight * zoom[0]}px`,
                      left: `${CROP_SIZE / 2 - (baseWidth * zoom[0]) / 2 + position.x}px`,
                      top: `${CROP_SIZE / 2 - (baseHeight * zoom[0]) / 2 + position.y}px`,
                    }}
                    draggable={false}
                  />
              )}
            </div>
            <div className="space-y-2 px-4">
              <label className="text-sm text-muted-foreground">Zoom</label>
              <Slider value={zoom} onValueChange={handleZoomChange} min={1} max={3} step={0.1} className="w-full" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setCropOpen(false); setPreviewImage(null); }} disabled={uploading}>Cancel</Button>
              <Button onClick={cropAndUpload} disabled={uploading}>
                {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Uploading...</> : "Save Photo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
