import { useState, useRef, useEffect, useCallback } from "react";
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

const CROP_SIZE = 200;

/** Draw the cropped circular avatar onto a canvas context.
 *  Used for BOTH the live preview and the final export. */
function drawCrop(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  natW: number, natH: number,
  size: number, zoom: number, posX: number, posY: number,
) {
  const minDim = Math.min(natW, natH);
  const s = (zoom * size) / minDim;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const imgW = natW * s;
  const imgH = natH * s;
  const dx = (size - imgW) / 2 + posX * (size / CROP_SIZE);
  const dy = (size - imgH) / 2 + posY * (size / CROP_SIZE);

  ctx.drawImage(img, dx, dy, imgW, imgH);
  ctx.restore();
}

export function AdminAvatarUpload({ userId, avatarUrl, initials, onAvatarChange }: AdminAvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [, setPreviewImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState([1]);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imgDims, setImgDims] = useState({ width: 0, height: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const loadedImgRef = useRef<HTMLImageElement | null>(null);

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
        loadedImgRef.current = img;
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

  const baseWidth = imgDims.width === 0 ? 0 : (imgDims.width / Math.min(imgDims.width, imgDims.height)) * CROP_SIZE;
  const baseHeight = imgDims.height === 0 ? 0 : (imgDims.height / Math.min(imgDims.width, imgDims.height)) * CROP_SIZE;

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
    setPosition(clampPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }, zoom[0]));
  };
  const handleMouseUp = () => setIsDragging(false);
  const handleZoomChange = (val: number[]) => {
    setZoom(val);
    setPosition(prev => clampPosition(prev, val[0]));
  };

  // Redraw preview canvas whenever zoom/position/image changes
  useEffect(() => {
    if (!cropOpen || imgDims.width === 0) return;

    const draw = () => {
      const canvas = previewCanvasRef.current;
      const img = loadedImgRef.current;
      if (!canvas || !img) return false;
      canvas.width = CROP_SIZE;
      canvas.height = CROP_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      drawCrop(ctx, img, imgDims.width, imgDims.height, CROP_SIZE, zoom[0], position.x, position.y);
      return true;
    };

    if (!draw()) {
      const raf = requestAnimationFrame(() => draw());
      return () => cancelAnimationFrame(raf);
    }
  }, [zoom, position, imgDims, cropOpen]);

  const cropAndUpload = async () => {
    if (!loadedImgRef.current || !exportCanvasRef.current) return;
    setUploading(true);
    try {
      const canvas = exportCanvasRef.current;
      const out = 256;
      canvas.width = out;
      canvas.height = out;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No canvas context");

      const img = loadedImgRef.current;
      drawCrop(ctx, img, imgDims.width, imgDims.height, out, zoom[0], position.x, position.y);

      const blob = await new Promise<Blob>((res, rej) => canvas.toBlob(b => b ? res(b) : rej(), "image/jpeg", 0.9));
      const fileName = `${userId}/avatar-${Date.now()}.jpg`;

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
      <button
        type="button"
        className="relative group cursor-pointer rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => fileRef.current?.click()}
        aria-label="Upload avatar"
        title="Upload avatar"
      >
        <Avatar className="flex-shrink-0" style={{ width: 50, height: 50 }}>
          <AvatarImage src={avatarUrl || undefined} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera className="w-3.5 h-3.5 text-white" />
        </div>
      </button>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      <canvas ref={exportCanvasRef} className="hidden" />

      <Dialog open={cropOpen} onOpenChange={setCropOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crop profile photo</DialogTitle>
            <DialogDescription>Drag to reposition and use the slider to zoom</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
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
