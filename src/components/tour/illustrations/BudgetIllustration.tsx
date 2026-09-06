import { ParticipantBubble } from "@/components/B31Pill";
import { Frame, money, useLoop } from "./shared";

/**
 * Step 2 — a small lump-sum budget table for Sitra. One personnel figure
 * changes and the indirect costs, the column total and the grand total follow.
 */
export function BudgetIllustration() {
  const phase = useLoop(2, 2600, 1);
  const wp2Personnel = phase === 0 ? 120000 : 168000;

  const personnel = [96000, wp2Personnel, 72000];
  const purchases = [8000, 12000, 15000];
  const indirect = personnel.map((p, i) => (p + purchases[i]) * 0.25);
  const totals = personnel.map((p, i) => p + purchases[i] + indirect[i]);

  const sum = (row: number[]) => row.reduce((a, b) => a + b, 0);

  const rows: { label: string; values: number[]; calculated: boolean; total: boolean }[] = [
    { label: "A. Personnel costs", values: personnel, calculated: false, total: false },
    { label: "C. Purchase costs", values: purchases, calculated: false, total: false },
    { label: "E. Indirect costs (25%)", values: indirect, calculated: true, total: false },
    { label: "F. Total costs", values: totals, calculated: true, total: true },
  ];

  return (
    <Frame>
      <div className="mb-2 flex items-center gap-2">
        <ParticipantBubble number={1} shortName="Sitra" size="caption" />
        <span className="text-[11px] text-muted-foreground">Lump sum budget (€)</span>
      </div>

      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="py-1 pr-2 text-left font-medium">Cost category</th>
            <th className="px-2 py-1 text-right font-medium">WP1</th>
            <th className="px-2 py-1 text-right font-medium">WP2</th>
            <th className="px-2 py-1 text-right font-medium">WP3</th>
            <th className="pl-2 py-1 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.label}
              className={[
                "border-b border-border/60",
                row.calculated ? "bg-muted/40 text-muted-foreground" : "",
                row.total ? "font-semibold text-foreground" : "",
              ].join(" ")}
            >
              <td className="py-[5px] pr-2 text-left">{row.label}</td>
              {row.values.map((value, i) => {
                const changing = row.label.startsWith("A.") && i === 1;
                const derived = row.calculated && i === 1;
                return (
                  <td
                    key={i}
                    className={[
                      "px-2 py-[5px] text-right tabular-nums transition-colors duration-500",
                      changing ? "rounded-sm bg-primary/15 font-semibold text-primary" : "",
                      derived ? "text-foreground" : "",
                    ].join(" ")}
                  >
                    {money(value)}
                  </td>
                );
              })}
              <td className="pl-2 py-[5px] text-right tabular-nums font-semibold text-foreground">
                {money(sum(row.values))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-semibold">
            <td className="py-[6px] pr-2 text-left">Requested EU contribution</td>
            <td colSpan={3} />
            <td className="pl-2 py-[6px] text-right tabular-nums text-primary">{money(sum(totals))}</td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-2 text-[10px] text-muted-foreground">
        Change one figure and the indirect costs, totals and the requested contribution recalculate.
      </p>
    </Frame>
  );
}
