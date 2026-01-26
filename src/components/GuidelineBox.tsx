import { Info, Lightbulb, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type GuidelineType = 'official' | 'sitra_tip' | 'evaluation';

interface GuidelineBoxProps {
  type: GuidelineType;
  title: string;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}

const guidelineConfig = {
  official: {
    icon: Info,
    label: "Official guidelines from the European Commission",
    borderColor: "border-blue-500",
    titleColor: "text-blue-600",
    bgColor: "bg-blue-50/50",
    iconColor: "text-blue-500",
    textColor: "text-blue-700",
  },
  sitra_tip: {
    icon: Lightbulb,
    label: "Sitra's tips",
    borderColor: "border-gray-800",
    titleColor: "text-gray-900",
    bgColor: "bg-gray-50/50",
    iconColor: "text-gray-800",
    textColor: "text-gray-700",
  },
  evaluation: {
    icon: ClipboardCheck,
    label: "Evaluation Criteria",
    borderColor: "border-amber-500",
    titleColor: "text-amber-700",
    bgColor: "bg-amber-50/50",
    iconColor: "text-amber-600",
    textColor: "text-amber-700",
  },
};

export function GuidelineBox({ type, title, children, className, compact = false }: GuidelineBoxProps) {
  const config = guidelineConfig[type];
  const Icon = config.icon;

  // Compact inline version for Part A forms
  if (compact) {
    return (
      <div className={cn("flex items-start gap-2 text-sm", className)}>
        <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", config.iconColor)} />
        <span className={config.textColor}>{children}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border-2 p-4",
        config.borderColor,
        config.bgColor,
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 flex-shrink-0", config.iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-col gap-1 mb-2">
            <span className={cn("text-xs font-medium uppercase tracking-wide", config.titleColor)}>
              {config.label}
            </span>
            {title && (
              <h4 className={cn("font-semibold", config.titleColor)}>
                {title}
              </h4>
            )}
          </div>
          <div className="text-sm text-gray-600 prose prose-sm max-w-none">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline guideline for Part A forms - just icon + text (neutral gray styling)
export function InlineGuideline({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2 text-sm", className)}>
      <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{children}</span>
    </div>
  );
}

// Convenience components for each type
export function OfficialGuideline({ title, children, className, compact }: Omit<GuidelineBoxProps, 'type'>) {
  return <GuidelineBox type="official" title={title} className={className} compact={compact}>{children}</GuidelineBox>;
}

export function SitraTip({ title, children, className, compact }: Omit<GuidelineBoxProps, 'type'>) {
  return <GuidelineBox type="sitra_tip" title={title} className={className} compact={compact}>{children}</GuidelineBox>;
}

export function EvaluationCriteria({ title, children, className, compact }: Omit<GuidelineBoxProps, 'type'>) {
  return <GuidelineBox type="evaluation" title={title} className={className} compact={compact}>{children}</GuidelineBox>;
}
