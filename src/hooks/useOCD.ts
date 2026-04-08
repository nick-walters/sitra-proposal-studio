import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { uploadProposalFile, getProposalFileSignedUrl } from '@/lib/proposalStorage';
import { toast } from 'sonner';
import { saveAs } from 'file-saver';

interface OcdUpload {
  participantId: string;
  filePath: string;
  uploadedAt: string;
}

interface UseOCDReturn {
  requiresOcd: boolean;
  templatePath: string | null;
  uploads: Record<string, OcdUpload>;
  loading: boolean;
  toggleRequiresOcd: (value: boolean) => Promise<void>;
  uploadTemplate: (file: File) => Promise<void>;
  uploadSignedOcd: (participantId: string, file: File) => Promise<void>;
  downloadPrefilled: (participantId: string) => Promise<void>;
  downloadSignedOcd: (participantId: string) => Promise<void>;
  downloadingFor: string | null;
  compileOcds: () => Promise<void>;
  compiling: boolean;
}

export function useOCD(proposalId: string | undefined): UseOCDReturn {
  const [requiresOcd, setRequiresOcd] = useState(false);
  const [templatePath, setTemplatePath] = useState<string | null>(null);
  const [uploads, setUploads] = useState<Record<string, OcdUpload>>({});
  const [loading, setLoading] = useState(true);
  const [downloadingFor, setDownloadingFor] = useState<string | null>(null);
  const [compiling, setCompiling] = useState(false);

  // Fetch OCD state
  useEffect(() => {
    if (!proposalId) {
      setLoading(false);
      return;
    }

    const fetchOcdState = async () => {
      setLoading(true);

      // Fetch proposal OCD settings
      const { data: proposal } = await supabase
        .from('proposals')
        .select('requires_ocd, ocd_template_path')
        .eq('id', proposalId)
        .maybeSingle();

      if (proposal) {
        setRequiresOcd((proposal as any).requires_ocd ?? false);
        setTemplatePath((proposal as any).ocd_template_path ?? null);
      }

      // Fetch OCD uploads
      const { data: ocdUploads } = await supabase
        .from('participant_ocd_uploads' as any)
        .select('participant_id, file_path, uploaded_at')
        .eq('proposal_id', proposalId);

      if (ocdUploads) {
        const uploadsMap: Record<string, OcdUpload> = {};
        for (const u of ocdUploads as any[]) {
          uploadsMap[u.participant_id] = {
            participantId: u.participant_id,
            filePath: u.file_path,
            uploadedAt: u.uploaded_at,
          };
        }
        setUploads(uploadsMap);
      }

      setLoading(false);
    };

    fetchOcdState();
  }, [proposalId]);

  const toggleRequiresOcd = useCallback(async (value: boolean) => {
    if (!proposalId) return;

    const { error } = await supabase
      .from('proposals')
      .update({ requires_ocd: value } as any)
      .eq('id', proposalId);

    if (error) {
      toast.error('Failed to update OCD requirement');
      return;
    }

    setRequiresOcd(value);
    toast.success(value ? 'Ownership Control Declarations enabled' : 'Ownership Control Declarations disabled');
  }, [proposalId]);

  const uploadTemplate = useCallback(async (file: File) => {
    if (!proposalId) return;

    const filePath = `${proposalId}/ocd/template-${Date.now()}.docx`;
    const { error } = await uploadProposalFile(file, filePath, {
      upsert: true,
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    if (error) {
      toast.error('Failed to upload template');
      return;
    }

    // Update proposal with template path
    const { error: updateError } = await supabase
      .from('proposals')
      .update({ ocd_template_path: filePath } as any)
      .eq('id', proposalId);

    if (updateError) {
      toast.error('Failed to save template path');
      return;
    }

    setTemplatePath(filePath);
    toast.success('OCD template uploaded successfully');
  }, [proposalId]);

  const uploadSignedOcd = useCallback(async (participantId: string, file: File) => {
    if (!proposalId) return;

    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are accepted');
      return;
    }

    const filePath = `${proposalId}/ocd/signed/${participantId}.pdf`;
    const { error } = await uploadProposalFile(file, filePath, {
      upsert: true,
      contentType: 'application/pdf',
    });

    if (error) {
      toast.error('Failed to upload signed OCD');
      return;
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Upsert the upload record
    const { error: dbError } = await supabase
      .from('participant_ocd_uploads' as any)
      .upsert({
        proposal_id: proposalId,
        participant_id: participantId,
        file_path: filePath,
        uploaded_by: user.id,
      } as any, {
        onConflict: 'proposal_id,participant_id',
      });

    if (dbError) {
      console.error('Failed to record OCD upload:', dbError);
      toast.error('Failed to record upload');
      return;
    }

    setUploads(prev => ({
      ...prev,
      [participantId]: {
        participantId,
        filePath,
        uploadedAt: new Date().toISOString(),
      },
    }));

    toast.success('Signed OCD uploaded successfully');
  }, [proposalId]);

  const downloadPrefilled = useCallback(async (participantId: string) => {
    if (!proposalId || !templatePath) return;

    setDownloadingFor(participantId);
    try {
      const { data, error } = await supabase.functions.invoke('ocd-prefill', {
        body: { proposalId, participantId },
      });

      if (error) throw error;

      // The function returns a base64 encoded docx
      if (data?.fileBase64 && data?.filename) {
        const binaryString = atob(data.fileBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        saveAs(blob, data.filename);
      } else {
        toast.error('Failed to generate pre-filled template');
      }
    } catch (err) {
      console.error('Failed to download pre-filled template:', err);
      toast.error('Failed to download template');
    } finally {
      setDownloadingFor(null);
    }
  }, [proposalId, templatePath]);

  const compileOcds = useCallback(async () => {
    if (!proposalId) return;

    setCompiling(true);
    try {
      const { data, error } = await supabase.functions.invoke('compile-ocds', {
        body: { proposalId },
      });

      if (error) throw error;

      if (data?.fileBase64) {
        const binaryString = atob(data.fileBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/pdf' });
        saveAs(blob, data.filename || 'Ownership_Control_Declarations.pdf');
      } else {
        toast.error('Failed to compile OCDs');
      }
    } catch (err) {
      console.error('Failed to compile OCDs:', err);
      toast.error('Failed to compile OCDs');
    } finally {
      setCompiling(false);
    }
  }, [proposalId]);

  const downloadSignedOcd = useCallback(async (participantId: string) => {
    const upload = uploads[participantId];
    if (!upload?.filePath) return;

    try {
      const { url, error } = await getProposalFileSignedUrl(upload.filePath);
      if (error || !url) {
        toast.error('Failed to get download link');
        return;
      }

      const response = await fetch(url);
      const blob = await response.blob();
      saveAs(blob, `OCD-signed-${participantId.slice(0, 8)}.pdf`);
    } catch (err) {
      console.error('Failed to download signed OCD:', err);
      toast.error('Failed to download signed OCD');
    }
  }, [uploads]);

  return {
    requiresOcd,
    templatePath,
    uploads,
    loading,
    toggleRequiresOcd,
    uploadTemplate,
    uploadSignedOcd,
    downloadPrefilled,
    downloadSignedOcd,
    downloadingFor,
    compileOcds,
    compiling,
  };
}
