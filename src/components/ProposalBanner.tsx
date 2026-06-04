import { SITRA_LOGO_BASE64 } from '@/lib/sitraLogo';

interface ProposalBannerProps {
  acronym: string;
  title: string;
  className?: string;
}

/**
 * Non-editable proposal banner shown at the top of section B1.1 in the editor
 * and at the top of PDF/Word exports. Pure presentation — not part of the
 * TipTap editor content. Rendered identically in editor and exports (export
 * pipelines may add bleed-to-edge styling via CSS).
 */
export function ProposalBanner({ acronym, title, className }: ProposalBannerProps) {
  return (
    <div
      data-proposal-banner="true"
      contentEditable={false}
      suppressContentEditableWarning
      className={className}
      style={{
        background: '#000',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1.5cm 1.5cm calc(1.5cm + 12pt) 1.5cm',
        width: '100%',
        boxSizing: 'border-box',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
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
        <div>{acronym}</div>
        <div>{title}</div>
      </div>
      <img
        src={SITRA_LOGO_BASE64}
        alt="Sitra"
        style={{ height: '1.5cm', width: 'auto', display: 'block' }}
      />
    </div>
  );
}
