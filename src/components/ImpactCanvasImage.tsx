import { useStorageUrl } from '@/hooks/useStorageUrl';

interface Props {
  /** Stored storage path (or absolute URL) of the uploaded image. */
  src: string;
  alt?: string;
  /** Object fit — canvas images stretch to the element box by default. */
  fit?: 'fill' | 'contain';
}

/**
 * Read-only image renderer for canvas image elements. Resolves private
 * storage paths to signed URLs and fills the element box. Shared by the
 * canvas editor and the read-only renderer (B2.1 / PDF / PNG).
 */
export function ImpactCanvasImage({ src, alt = '', fit = 'contain' }: Props) {
  const resolved = useStorageUrl(src);
  if (!resolved) {
    return <div style={{ width: '100%', height: '100%', background: 'transparent' }} />;
  }
  return (
    <img
      src={resolved}
      alt={alt}
      crossOrigin="anonymous"
      draggable={false}
      style={{
        width: '100%',
        height: '100%',
        objectFit: fit,
        display: 'block',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    />
  );
}
