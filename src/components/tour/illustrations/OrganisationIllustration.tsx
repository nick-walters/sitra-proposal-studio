import { ParticipantBubble } from "@/components/B31Pill";
import { Building2, DatabaseBackup, Check } from "lucide-react";
import { Frame, PanelLabel, usePrefersReducedMotion } from "./shared";

const FIELDS: [string, string][] = [
  ["Legal name", "Suomen itsenäisyyden juhlarahasto"],
  ["PIC", "999 887 766"],
  ["Country", "Finland"],
  ["Main contact", "Aino Virtanen"],
  ["Expertise", "Foresight, systems change"],
];

/** Step 1 — the participant card, copied across to the portal and backed up. */
export function OrganisationIllustration() {
  const reduced = usePrefersReducedMotion();
  const flow = reduced ? "" : "animate-[tour-dash_1.6s_linear_infinite]";

  return (
    <Frame>
      <div className="flex h-full items-center gap-3">
        {/* The participant card */}
        <div className="w-[46%] shrink-0 rounded-md border border-border bg-background p-3">
          <div className="mb-2 flex items-center gap-2">
            <ParticipantBubble number={1} shortName="Sitra" showCrown size="caption" />
            <span className="text-[11px] text-muted-foreground">Beneficiary</span>
          </div>
          <dl className="space-y-[5px]">
            {FIELDS.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</dt>
                <dd className="truncate rounded-sm border border-border bg-muted/40 px-1.5 py-[3px] text-[11px] text-foreground">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Arrows */}
        <svg viewBox="0 0 60 200" className="h-full w-[14%]" aria-hidden="true">
          <defs>
            <marker id="tour-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="hsl(var(--primary))" />
            </marker>
          </defs>
          <path
            d="M2,100 C25,100 25,55 58,55"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            markerEnd="url(#tour-arrow)"
            className={flow}
          />
          <path
            d="M2,100 C25,100 25,148 58,148"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="1.5"
            strokeDasharray="5 4"
            markerEnd="url(#tour-arrow)"
            className={flow}
          />
        </svg>

        {/* Destinations */}
        <div className="flex h-full flex-1 flex-col justify-center gap-3">
          <div className="rounded-md border border-border bg-muted/30 p-2.5">
            <PanelLabel>
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Funding &amp; Tenders Portal
              </span>
            </PanelLabel>
            <p className="text-[11px] leading-snug text-foreground">
              Sitra copies your details across. You only check them.
            </p>
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-[2px] text-[10px] text-primary">
              <Check className="h-3 w-3" /> Checked by partner
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-2.5">
            <PanelLabel>
              <span className="inline-flex items-center gap-1">
                <DatabaseBackup className="h-3 w-3" /> Nightly backup
              </span>
            </PanelLabel>
            <p className="text-[11px] leading-snug text-foreground">
              Kept safe every night, whether or not the portal is open.
            </p>
          </div>
        </div>
      </div>

      <style>{`@keyframes tour-dash { to { stroke-dashoffset: -18; } }`}</style>
    </Frame>
  );
}
