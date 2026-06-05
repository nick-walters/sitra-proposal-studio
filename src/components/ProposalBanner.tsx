import { SITRA_LOGO_BASE64 } from '@/lib/sitraLogo';

interface ProposalBannerProps {
  acronym: string;
  title: string;
  topicId?: string | null;
  topicTitle?: string | null;
  proposalType?: string | null;
  className?: string;
}

/**
 * Non-editable proposal banner shown at the top of section B1.1 in the editor
 * and at the top of PDF/Word exports. Pure presentation — not part of the
 * TipTap editor content. Rendered identically in editor and exports (export
 * pipelines may add bleed-to-edge styling via CSS).
 */
export function ProposalBanner({ acronym, title, topicId, topicTitle, proposalType, className }: ProposalBannerProps) {
  const topicLine = topicId || topicTitle || proposalType
    ? `${topicId || ''}${topicId && topicTitle ? ': ' : ''}${topicTitle || ''}${proposalType ? ` (${proposalType})` : ''}`
    : '';

  return (
    <div
      data-proposal-banner="true"
      contentEditable={false}
      suppressContentEditableWarning
      className={className}
      style={{
        background: '#000',
        color: '#fff',
        padding: '1.5cm 1.5cm 12pt 1.5cm',
        width: '100%',
        boxSizing: 'border-box',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <img
        src={SITRA_LOGO_BASE64}
        alt="Sitra"
        style={{
          float: 'right',
          height: '1cm',
          width: 'auto',
          display: 'block',
          marginLeft: '0.5cm',
          marginBottom: '0.25cm',
        }}
      />
      {topicLine && (
        <div
          style={{
            fontFamily: "'Times New Roman', Times, serif",
            fontSize: '8pt',
            lineHeight: 1,
            color: '#fff',
            textAlign: 'left',
            marginTop: '0pt',
            marginBottom: '6pt',
          }}
        >
          {topicLine}
        </div>
      )}
      <div
        style={{
          fontFamily: "'Arial Black', Arial, sans-serif",
          fontWeight: 900,
          fontSize: '16pt',
          lineHeight: 1.2,
          color: '#fff',
          textAlign: 'left',
        }}
      >
        {acronym}
      </div>
      <div
        style={{
          fontFamily: "'Arial Black', Arial, sans-serif",
          fontWeight: 900,
          fontSize: '14pt',
          lineHeight: 1.2,
          color: '#fff',
          textAlign: 'left',
        }}
      >
        {title}
      </div>
    </div>
  );
}

