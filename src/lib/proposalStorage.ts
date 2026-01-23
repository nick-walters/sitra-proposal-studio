import { supabase } from '@/integrations/supabase/client';

/**
 * File categories for organizing proposal files
 */
export type FileCategory = 'logo' | 'figures' | 'attachments' | 'exports' | 'participants';

/**
 * Generates a human-readable, organized file path for proposal files.
 * 
 * Structure: {proposalId}/{category}/{descriptive-filename}
 * 
 * Examples:
 * - d687661f-afbc-44fc-ac39-fad26b5d3336/logo/project-logo.png
 * - d687661f-afbc-44fc-ac39-fad26b5d3336/figures/figure-1-1-a-impact-pathway.png
 * - d687661f-afbc-44fc-ac39-fad26b5d3336/participants/partner-1-logo.png
 */
export function generateProposalFilePath(
  proposalId: string,
  category: FileCategory,
  filename: string,
  options?: {
    /** Optional prefix to add context (e.g., figure number, participant number) */
    prefix?: string;
    /** Whether to add timestamp for uniqueness (default: true) */
    addTimestamp?: boolean;
  }
): string {
  const { prefix, addTimestamp = true } = options || {};
  
  // Clean and sanitize the filename
  const extension = filename.split('.').pop()?.toLowerCase() || 'file';
  const baseName = filename
    .replace(/\.[^/.]+$/, '') // Remove extension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Trim leading/trailing hyphens
    .substring(0, 50); // Limit length
  
  // Build the filename
  let finalName = '';
  
  if (prefix) {
    finalName += `${prefix}-`;
  }
  
  finalName += baseName || 'file';
  
  if (addTimestamp) {
    finalName += `-${Date.now()}`;
  }
  
  finalName += `.${extension}`;
  
  return `${proposalId}/${category}/${finalName}`;
}

/**
 * Generates a path for proposal logos
 */
export function generateLogoPath(proposalId: string, originalFilename: string): string {
  return generateProposalFilePath(proposalId, 'logo', originalFilename, {
    prefix: 'project-logo',
    addTimestamp: true,
  });
}

/**
 * Generates a path for figure images
 */
export function generateFigurePath(
  proposalId: string,
  figureNumber: string,
  originalFilename: string
): string {
  // Convert figure number like "1.1.a" to "1-1-a"
  const formattedNumber = figureNumber.replace(/\./g, '-');
  return generateProposalFilePath(proposalId, 'figures', originalFilename, {
    prefix: `figure-${formattedNumber}`,
    addTimestamp: true,
  });
}

/**
 * Generates a path for participant logos
 */
export function generateParticipantLogoPath(
  proposalId: string,
  participantNumber: number,
  originalFilename: string
): string {
  return generateProposalFilePath(proposalId, 'participants', originalFilename, {
    prefix: `partner-${participantNumber}-logo`,
    addTimestamp: false, // Use upsert to replace
  });
}

/**
 * Uploads a file to the proposal-files bucket with proper organization
 */
export async function uploadProposalFile(
  file: File | Blob,
  filePath: string,
  options?: {
    upsert?: boolean;
    contentType?: string;
  }
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const { error: uploadError } = await supabase.storage
      .from('proposal-files')
      .upload(filePath, file, {
        upsert: options?.upsert ?? false,
        contentType: options?.contentType,
      });

    if (uploadError) {
      return { url: null, error: uploadError };
    }

    const { data: { publicUrl } } = supabase.storage
      .from('proposal-files')
      .getPublicUrl(filePath);

    return { url: publicUrl, error: null };
  } catch (error) {
    return { url: null, error: error as Error };
  }
}

/**
 * Deletes a file from the proposal-files bucket
 */
export async function deleteProposalFile(filePath: string): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase.storage
      .from('proposal-files')
      .remove([filePath]);
    
    return { error: error || null };
  } catch (error) {
    return { error: error as Error };
  }
}

/**
 * Extracts the file path from a public URL
 */
export function extractFilePathFromUrl(publicUrl: string): string | null {
  const match = publicUrl.match(/\/proposal-files\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * Lists all files in a proposal's folder
 */
export async function listProposalFiles(
  proposalId: string,
  category?: FileCategory
): Promise<{ files: Array<{ name: string; path: string; createdAt: string }> | null; error: Error | null }> {
  try {
    const folderPath = category ? `${proposalId}/${category}` : proposalId;
    
    const { data, error } = await supabase.storage
      .from('proposal-files')
      .list(folderPath, {
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      return { files: null, error };
    }

    const files = data
      .filter(item => item.name !== '.emptyFolderPlaceholder')
      .map(item => ({
        name: item.name,
        path: `${folderPath}/${item.name}`,
        createdAt: item.created_at,
      }));

    return { files, error: null };
  } catch (error) {
    return { files: null, error: error as Error };
  }
}
