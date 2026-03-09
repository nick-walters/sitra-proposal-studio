import { useStorageUrl } from '@/hooks/useStorageUrl';

interface StorageImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** The stored path or URL from the database */
  storedPath: string | null | undefined;
}

/**
 * Image component that resolves storage file paths to fresh signed URLs.
 * Use this instead of <img src={logoUrl}> for any image stored in proposal-files bucket.
 */
export function StorageImage({ storedPath, alt, ...props }: StorageImageProps) {
  const resolvedUrl = useStorageUrl(storedPath);

  if (!resolvedUrl) return null;

  return <img src={resolvedUrl} alt={alt} {...props} />;
}
