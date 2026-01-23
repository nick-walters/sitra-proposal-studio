import { useState, useRef, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ImageCropDialogProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  onCrop: (croppedImageUrl: string) => void;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function ImageCropDialog({ isOpen, onClose, imageSrc, onCrop }: ImageCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [cropArea, setCropArea] = useState<CropArea>({ x: 0, y: 0, width: 200, height: 150 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [displayScale, setDisplayScale] = useState(1);
  
  const dragStart = useRef({ x: 0, y: 0, cropX: 0, cropY: 0, cropW: 0, cropH: 0 });

  useEffect(() => {
    if (isOpen) {
      setImageLoaded(false);
      setCropArea({ x: 0, y: 0, width: 200, height: 150 });
    }
  }, [isOpen, imageSrc]);

  const handleImageLoad = useCallback(() => {
    const img = imageRef.current;
    if (!img) return;
    
    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    
    // Calculate display scale to fit in container
    const maxWidth = 500;
    const maxHeight = 400;
    const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
    
    setDisplayScale(scale);
    setImageDimensions({ width: naturalWidth, height: naturalHeight });
    
    // Set initial crop area to center of image
    const cropW = Math.min(200, naturalWidth * scale * 0.8);
    const cropH = Math.min(150, naturalHeight * scale * 0.8);
    const cropX = (naturalWidth * scale - cropW) / 2;
    const cropY = (naturalHeight * scale - cropH) / 2;
    
    setCropArea({ x: cropX, y: cropY, width: cropW, height: cropH });
    setImageLoaded(true);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, action: 'drag' | string) => {
    e.preventDefault();
    
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      cropX: cropArea.x,
      cropY: cropArea.y,
      cropW: cropArea.width,
      cropH: cropArea.height,
    };
    
    if (action === 'drag') {
      setIsDragging(true);
    } else {
      setIsResizing(action);
    }
  }, [cropArea]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging && !isResizing) return;
    
    const deltaX = e.clientX - dragStart.current.x;
    const deltaY = e.clientY - dragStart.current.y;
    const maxX = imageDimensions.width * displayScale;
    const maxY = imageDimensions.height * displayScale;
    
    if (isDragging) {
      let newX = Math.max(0, Math.min(dragStart.current.cropX + deltaX, maxX - cropArea.width));
      let newY = Math.max(0, Math.min(dragStart.current.cropY + deltaY, maxY - cropArea.height));
      setCropArea(prev => ({ ...prev, x: newX, y: newY }));
    } else if (isResizing) {
      let newW = dragStart.current.cropW;
      let newH = dragStart.current.cropH;
      let newX = dragStart.current.cropX;
      let newY = dragStart.current.cropY;
      
      if (isResizing.includes('e')) {
        newW = Math.max(50, Math.min(dragStart.current.cropW + deltaX, maxX - newX));
      }
      if (isResizing.includes('w')) {
        const newWidth = Math.max(50, dragStart.current.cropW - deltaX);
        newX = Math.max(0, dragStart.current.cropX + dragStart.current.cropW - newWidth);
        newW = newWidth;
      }
      if (isResizing.includes('s')) {
        newH = Math.max(50, Math.min(dragStart.current.cropH + deltaY, maxY - newY));
      }
      if (isResizing.includes('n')) {
        const newHeight = Math.max(50, dragStart.current.cropH - deltaY);
        newY = Math.max(0, dragStart.current.cropY + dragStart.current.cropH - newHeight);
        newH = newHeight;
      }
      
      setCropArea({ x: newX, y: newY, width: newW, height: newH });
    }
  }, [isDragging, isResizing, imageDimensions, displayScale, cropArea.width, cropArea.height]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(null);
  }, []);

  const handleCrop = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    
    // Convert display coordinates to actual image coordinates
    const actualX = cropArea.x / displayScale;
    const actualY = cropArea.y / displayScale;
    const actualW = cropArea.width / displayScale;
    const actualH = cropArea.height / displayScale;
    
    canvas.width = actualW;
    canvas.height = actualH;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(
      img,
      actualX, actualY, actualW, actualH,
      0, 0, actualW, actualH
    );
    
    const croppedUrl = canvas.toDataURL('image/png');
    onCrop(croppedUrl);
    onClose();
  }, [cropArea, displayScale, onCrop, onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crop Image</DialogTitle>
        </DialogHeader>
        
        <div 
          ref={containerRef}
          className="relative bg-muted/50 flex items-center justify-center overflow-hidden"
          style={{ minHeight: 300 }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Crop preview"
            className="max-w-full max-h-[400px]"
            style={{ 
              width: imageDimensions.width * displayScale || 'auto',
              height: imageDimensions.height * displayScale || 'auto',
            }}
            onLoad={handleImageLoad}
            draggable={false}
          />
          
          {/* Dark overlay outside crop area */}
          {imageLoaded && (
            <>
              <div 
                className="absolute inset-0 bg-black/50 pointer-events-none"
                style={{
                  clipPath: `polygon(
                    0 0, 100% 0, 100% 100%, 0 100%, 0 0,
                    ${cropArea.x}px ${cropArea.y}px, 
                    ${cropArea.x}px ${cropArea.y + cropArea.height}px, 
                    ${cropArea.x + cropArea.width}px ${cropArea.y + cropArea.height}px, 
                    ${cropArea.x + cropArea.width}px ${cropArea.y}px, 
                    ${cropArea.x}px ${cropArea.y}px
                  )`
                }}
              />
              
              {/* Crop selection box */}
              <div
                className="absolute border-2 border-white cursor-move"
                style={{
                  left: cropArea.x,
                  top: cropArea.y,
                  width: cropArea.width,
                  height: cropArea.height,
                }}
                onMouseDown={(e) => handleMouseDown(e, 'drag')}
              >
                {/* Corner handles */}
                {['nw', 'ne', 'sw', 'se'].map((corner) => (
                  <div
                    key={corner}
                    className={`absolute w-3 h-3 bg-white border border-primary cursor-${corner}-resize`}
                    style={{
                      top: corner.includes('n') ? -6 : undefined,
                      bottom: corner.includes('s') ? -6 : undefined,
                      left: corner.includes('w') ? -6 : undefined,
                      right: corner.includes('e') ? -6 : undefined,
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      handleMouseDown(e, corner);
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        
        {/* Dimension inputs */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm">Width:</Label>
            <Input
              type="number"
              value={Math.round(cropArea.width / displayScale)}
              onChange={(e) => {
                const newW = parseInt(e.target.value) * displayScale;
                if (newW > 0) {
                  setCropArea(prev => ({ 
                    ...prev, 
                    width: Math.min(newW, imageDimensions.width * displayScale - prev.x) 
                  }));
                }
              }}
              className="w-20 h-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm">Height:</Label>
            <Input
              type="number"
              value={Math.round(cropArea.height / displayScale)}
              onChange={(e) => {
                const newH = parseInt(e.target.value) * displayScale;
                if (newH > 0) {
                  setCropArea(prev => ({ 
                    ...prev, 
                    height: Math.min(newH, imageDimensions.height * displayScale - prev.y) 
                  }));
                }
              }}
              className="w-20 h-8"
            />
          </div>
        </div>
        
        <canvas ref={canvasRef} className="hidden" />
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCrop}>Apply Crop</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
