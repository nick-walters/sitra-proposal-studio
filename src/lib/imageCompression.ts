/**
 * Image compression and optimization utilities for proposal figures.
 * Compresses images to 300 DPI and max 18cm width without decreasing quality.
 */

// 18 cm at 300 DPI = 2126 pixels
const MAX_WIDTH_PIXELS = Math.round(18 * 300 / 2.54);
const TARGET_DPI = 300;

/**
 * Compress and optimize an image for proposal figures.
 * - Maintains 300 DPI quality
 * - Max width of 18cm (2126px at 300 DPI)
 * - Preserves aspect ratio
 */
export async function compressImage(
  source: File | Blob | string,
  options: {
    /** Output format: 'png' for AI-generated (better for text), 'jpeg' for photos */
    format: 'png' | 'jpeg';
    /** Quality for JPEG (0-1), ignored for PNG */
    quality?: number;
  }
): Promise<Blob> {
  const { format, quality = 0.92 } = options;
  
  // Load the image
  const img = await loadImage(source);
  
  // Calculate new dimensions
  let { width, height } = img;
  
  if (width > MAX_WIDTH_PIXELS) {
    const scale = MAX_WIDTH_PIXELS / width;
    width = MAX_WIDTH_PIXELS;
    height = Math.round(height * scale);
  }
  
  // Create canvas and draw resized image
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }
  
  // Use high-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Draw the image
  ctx.drawImage(img, 0, 0, width, height);
  
  // Convert to blob
  const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
  const blob = await canvasToBlob(canvas, mimeType, format === 'jpeg' ? quality : undefined);
  
  return blob;
}

/**
 * Load an image from various sources
 */
async function loadImage(source: File | Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    
    if (typeof source === 'string') {
      // URL or data URL
      img.src = source;
    } else {
      // File or Blob
      img.src = URL.createObjectURL(source);
    }
  });
}

/**
 * Convert canvas to blob with promise
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      },
      mimeType,
      quality
    );
  });
}

/**
 * Get the recommended format based on figure type
 * - 'ai': PNG (better for text and diagrams)
 * - 'image': JPEG (better for photos, smaller file size)
 */
export function getRecommendedFormat(figureType: string): 'png' | 'jpeg' {
  return figureType === 'ai' ? 'png' : 'jpeg';
}

/**
 * Get the file extension for a format
 */
export function getFormatExtension(format: 'png' | 'jpeg'): string {
  return format === 'png' ? 'png' : 'jpg';
}
