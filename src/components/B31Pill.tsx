import React from 'react';
import { Crown } from 'lucide-react';
import { RISK_COLORS } from '@/lib/constants';

export type B31PillSize = 'document' | 'caption' | 'role' | 'toolbar';

export interface B31PillProps {
  /** The text to display inside the pill */
  children: React.ReactNode;
  /** Visual variant */
  variant: 'filled' | 'outline';
  /** Background/border colour. For 'filled' this is the background; for 'outline' it is the border+text colour. */
  color: string;
  /** Text colour override. Default: white for filled, the color prop for outline. */
  textColor?: string;
  /** Size preset */
  size?: B31PillSize;
  /** Optional icon before text (e.g. Crown for leaders) */
  icon?: React.ReactNode;
  /** Optional remove button (×). Provide callback. */
  onRemove?: () => void;
  /** Optional click handler */
  onClick?: () => void;
  /** Additional className */
  className?: string;
  /** Additional inline style (wins over preset styles) */
  style?: React.CSSProperties;
}

const SIZE_STYLES: Record<B31PillSize, React.CSSProperties> = {
  document: { fontSize: '11pt', height: '17px', padding: '0 5px' },
  caption: { fontSize: '8pt', height: '17px', padding: '0 4px' },
  role: { fontSize: '9pt', padding: '0 5px' },
  toolbar: { fontSize: '7pt', height: '13px', padding: '1px 4px' },
};

export function B31Pill({
  children,
  variant,
  color,
  textColor,
  size = 'document',
  icon,
  onRemove,
  onClick,
  className,
  style,
}: B31PillProps) {
  const variantStyle: React.CSSProperties =
    variant === 'filled'
      ? {
          backgroundColor: color,
          color: textColor || '#ffffff',
          border: `1.5px solid ${color}`,
        }
      : {
          backgroundColor: '#ffffff',
          color: textColor || color,
          border: `1.5px solid ${color}`,
        };

  return (
    <span
      onClick={onClick}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Times New Roman', Times, serif",
        fontWeight: 700,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        verticalAlign: 'baseline',
        borderRadius: '9999px',
        ...SIZE_STYLES[size],
        ...variantStyle,
        ...style,
      }}
    >
      {icon}
      {children}
      {onRemove && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{ cursor: 'pointer', marginLeft: '2px' }}
        >
          ×
        </span>
      )}
    </span>
  );
}

/** WP bubble — filled pill with WP colour */
export function WPBubble({
  wpNumber,
  wpColor,
  shortName,
  children,
  onRemove,
  ...rest
}: {
  wpNumber?: number;
  wpColor: string;
  shortName?: string;
  children?: React.ReactNode;
  onRemove?: () => void;
} & Omit<B31PillProps, 'variant' | 'color' | 'children'>) {
  return (
    <B31Pill variant="filled" color={wpColor} onRemove={onRemove} {...rest}>
      {children ?? `WP${wpNumber}${shortName ? `: ${shortName}` : ''}`}
    </B31Pill>
  );
}

/** Participant bubble — filled black pill */
export function ParticipantBubble({
  number,
  shortName,
  showCrown,
  children,
  ...rest
}: {
  number?: number | null;
  shortName?: string;
  showCrown?: boolean;
  children?: React.ReactNode;
} & Omit<B31PillProps, 'variant' | 'color' | 'children'>) {
  return (
    <B31Pill
      variant="filled"
      color="#000000"
      icon={
        showCrown ? (
          <Crown className="h-2.5 w-2.5 mr-0.5 fill-white" strokeWidth={0} />
        ) : undefined
      }
      {...rest}
    >
      {children ?? `${number != null ? `${number}. ` : ''}${shortName ?? ''}`}
    </B31Pill>
  );
}

/** Risk badge — outline pill with L/M/H colour coding */
export function RiskBadge({
  level,
  ...rest
}: {
  level: 'L' | 'M' | 'H' | null;
} & Omit<B31PillProps, 'variant' | 'color' | 'children'>) {
  const color = level ? RISK_COLORS[level] || '#9ca3af' : '#9ca3af';
  const { style: extraStyle, ...restNoStyle } = rest;
  return (
    <B31Pill
      variant="outline"
      color={color}
      {...restNoStyle}
      style={{ width: '19px', height: '17px', padding: 0, position: 'relative', top: '-1.4px', ...extraStyle }}
    >
      {level || '–'}
    </B31Pill>
  );
}
