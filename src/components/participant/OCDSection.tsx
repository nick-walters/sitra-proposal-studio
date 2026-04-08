import { useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Upload, CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface OCDSectionProps {
  visible: boolean;
  templateExists: boolean;
  hasUploadedOcd: boolean;
  uploadedAt?: string;
  downloadingPrefilled: boolean;
  onDownloadTemplate: () => void;
  onUploadSigned: (file: File) => void;
  onDownloadSigned?: () => void;
  canEdit: boolean;
  /** true when the proposal is Horizon Europe (RIA/IA/CSA) */
  isHorizonEurope?: boolean;
}

export function OCDSection({
  visible,
  templateExists,
  hasUploadedOcd,
  uploadedAt,
  downloadingPrefilled,
  onDownloadTemplate,
  onUploadSigned,
  onDownloadSigned,
  canEdit,
  isHorizonEurope = true,
}: OCDSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  if (!visible || !templateExists) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert('Only PDF files are accepted.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      await onUploadSigned(file);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Appendix: Ownership Control Declaration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Instructions */}
        <div className="space-y-3 text-sm text-foreground">
          <p className="italic">
            For detailed explanations about the ownership control assessment procedure, see the{' '}
            <a
              href="https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/guidance-on-participation-in-eu-calls-with-ownership-and-control-restrictions_en.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-0.5"
            >
              Guidance on participation in EU calls with ownership and control restrictions
              <ExternalLink className="w-3 h-3" />
            </a>
            .
          </p>

          <p className="italic">
            {isHorizonEurope
              ? 'Beneficiaries, affiliated entities, and associated partners must always provide the form; and subcontractors must provide it only if required by the call conditions.'
              : 'Beneficiaries and affiliated entities must always provide the form; associated partners and subcontractors must provide it only if required by the call conditions.'}
            {' '}Entities that are validated as public bodies by the Central Validation
            Service are exempted since they will automatically be considered as controlled by their
            country.
          </p>

          <p className="italic">
            Supporting documents do not have to be provided at application stage, but will be
            requested later on. You will receive a task notification asking you to upload the documents
            to your PIC account in the Portal Participant Register.
          </p>

          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-warning shrink-0" />
            <p className="italic">
              The information should reflect the situation at the moment you sign this declaration.
              Please be aware that additional information or clarifications may also be requested
              later on, in case there are open questions about your ownership/control status.
            </p>
          </div>

          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-warning shrink-0" />
            <p className="italic">
              Please note that the information in this declaration may be reused in case you apply to
              other EU calls that have ownership/control restrictions.
            </p>
          </div>

          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 text-warning shrink-0" />
            <p className="italic">
              Please also note that you must inform the granting authority in case of changes in your
              ownership and control structure during the project implementation, if these could impact
              the ownership/control requirements.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
          {/* Download pre-filled template */}
          <Button
            variant="outline"
            size="sm"
            onClick={onDownloadTemplate}
            disabled={downloadingPrefilled}
            className="gap-1.5"
          >
            {downloadingPrefilled ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Download empty Ownership Control Declaration template (.docx)
          </Button>

          {/* Upload signed OCD */}
          {canEdit && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant={hasUploadedOcd ? 'outline' : 'default'}
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="gap-1.5"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {hasUploadedOcd ? 'Replace filled & signed Ownership Control Declaration (.pdf)' : 'Upload filled & signed Ownership Control Declaration (.pdf)'}
              </Button>
            </>
          )}

          {/* Upload status */}
          {hasUploadedOcd && uploadedAt && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
              Uploaded {format(new Date(uploadedAt), 'dd MMM yyyy')}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
