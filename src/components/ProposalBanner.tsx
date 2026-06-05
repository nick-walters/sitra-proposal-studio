import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SITRA_LOGO_BASE64 } from '@/lib/sitraLogo';
import { supabase } from '@/integrations/supabase/client';
import { useProposalRole } from '@/hooks/useProposalRole';

interface ProposalBannerProps {
  acronym: string;
  title: string;
  topicId?: string | null;
  topicTitle?: string | null;
  proposalType?: string | null;
  proposalId?: string;
  className?: string;
}

/**
 * Non-editable proposal banner shown at the top of section B1.1 in the editor
 * and at the top of PDF/Word exports. Topic line & title are auto-composed
 * from A1 data, but a coordinator+ can edit the rendered text in the banner
 * to manually control line breaks. Edits are stored as banner-only overrides
 * (banner_topic_line_override, banner_title_override) and do not affect A1.
 */
export function ProposalBanner({
  acronym,
  title,
  topicId,
  topicTitle,
  proposalType,
  proposalId,
  className,
}: ProposalBannerProps) {
  const computedTopicLine = topicId || topicTitle || proposalType
    ? `${topicId || ''}${topicId && topicTitle ? ': ' : ''}${topicTitle || ''}${proposalType ? ` (${proposalType})` : ''}`
    : '';

  const { roleTier } = useProposalRole(proposalId || '');
  const canEdit = !!proposalId && roleTier === 'coordinator';

  const queryClient = useQueryClient();
  const overrideKey = ['proposal-banner-overrides', proposalId];

  const { data: overrides } = useQuery({
    queryKey: overrideKey,
    enabled: !!proposalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proposals')
        .select('banner_topic_line_override, banner_title_override')
        .eq('id', proposalId!)
        .maybeSingle();
      if (error) throw error;
      return data as { banner_topic_line_override: string | null; banner_title_override: string | null } | null;
    },
  });

  const topicLine = overrides?.banner_topic_line_override ?? computedTopicLine;
  const titleLine = overrides?.banner_title_override ?? title;

  const saveOverride = async (
    field: 'banner_topic_line_override' | 'banner_title_override',
    value: string,
    fallback: string,
  ) => {
    if (!proposalId) return;
    // If the user cleared the field or it matches the auto-computed value, store NULL.
    const next = value.trim() === '' || value === fallback ? null : value;
    await supabase.from('proposals').update({ [field]: next }).eq('id', proposalId);
    queryClient.invalidateQueries({ queryKey: overrideKey });
  };

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
        userSelect: canEdit ? 'text' : 'none',
        WebkitUserSelect: canEdit ? 'text' : 'none',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          float: 'right',
          textAlign: 'center',
          marginLeft: '0.5cm',
          marginBottom: '0.25cm',
        }}
      >
        <img
          src={SITRA_LOGO_BASE64}
          alt="Sitra"
          style={{
            height: '0.8cm',
            width: 'auto',
            display: 'block',
          }}
        />
        <div
          style={{
            fontSize: '10pt',
            lineHeight: 1.0,
            color: '#fff',
            textAlign: 'center',
            marginTop: '2pt',
            whiteSpace: 'nowrap',
          }}
        >
          and partners
        </div>
      </div>
      {topicLine && (
        <EditableLine
          value={topicLine}
          canEdit={canEdit}
          onSave={(v) => saveOverride('banner_topic_line_override', v, computedTopicLine)}
          style={{
            fontFamily: "'Times New Roman', Times, serif",
            fontSize: '8pt',
            lineHeight: 1.15,
            color: '#fff',
            textAlign: 'left',
            marginTop: '0pt',
            marginBottom: '6pt',
          }}
        />
      )}
      <EditableLine
        value={acronym}
        canEdit={false}
        onSave={() => {}}
        style={{
          fontFamily: "'Arial Black', Arial, sans-serif",
          fontWeight: 900,
          fontSize: '18pt',
          lineHeight: 1.2,
          color: '#fff',
          textAlign: 'left',
        }}
      />
      <EditableLine
        value={titleLine}
        canEdit={canEdit}
        onSave={(v) => saveOverride('banner_title_override', v, title)}
        style={{
          fontFamily: "'Arial Black', Arial, sans-serif",
          fontWeight: 900,
          fontSize: '14pt',
          lineHeight: 1.2,
          color: '#fff',
          textAlign: 'left',
        }}
      />
    </div>
  );
}

interface EditableLineProps {
  value: string;
  canEdit: boolean;
  onSave: (value: string) => void;
  style?: React.CSSProperties;
}

function EditableLine({ value, canEdit, onSave, style }: EditableLineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);

  // Keep DOM text in sync with prop value when not actively editing.
  useEffect(() => {
    if (!editing && ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value;
    }
  }, [value, editing]);

  return (
    <div
      ref={ref}
      contentEditable={canEdit}
      suppressContentEditableWarning
      spellCheck={false}
      onFocus={() => setEditing(true)}
      onBlur={(e) => {
        setEditing(false);
        if (canEdit) {
          // innerText preserves manual line breaks (Shift+Enter / Enter)
          onSave(e.currentTarget.innerText);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          // Allow Enter to insert a line break; prevent default block split.
          e.preventDefault();
          document.execCommand('insertLineBreak');
        }
      }}
      title={canEdit ? 'Click to edit — press Enter to insert a line break' : undefined}
      style={{
        // Auto-balance line lengths when wrapping; manual <br>s override.
        textWrap: 'balance',
        whiteSpace: 'pre-line',
        outline: 'none',
        cursor: canEdit ? 'text' : 'default',
        ...style,
      }}
    >
      {value}
    </div>
  );
}
