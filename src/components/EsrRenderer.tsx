import { parseEsrMarkdown, type Block, type Run } from "@/lib/esrMarkdown";

interface Props {
  markdown: string;
}

function renderRuns(runs: Run[], keyPrefix: string) {
  return runs.map((r, i) => {
    const key = `${keyPrefix}-${i}`;
    if (r.bold) return <strong key={key}>{r.text}</strong>;
    if (r.italic) return <em key={key}>{r.text}</em>;
    return <span key={key}>{r.text}</span>;
  });
}

export function EsrRenderer({ markdown }: Props) {
  const blocks = parseEsrMarkdown(markdown);
  return (
    <div
      className="bg-muted/30 p-6 rounded border max-h-[700px] overflow-y-auto"
      style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: "11pt", lineHeight: 1.4 }}
    >
      {blocks.map((b: Block, idx) => {
        const k = `b-${idx}`;
        if (b.type === "spacer") return <div key={k} style={{ height: "8pt" }} />;
        switch (b.type) {
          case "h1":
            return (
              <h1 key={k} style={{ fontSize: "16pt", fontWeight: 700, margin: "16pt 0 8pt" }}>
                {renderRuns(b.runs, k)}
              </h1>
            );
          case "h2":
            return (
              <h2 key={k} style={{ fontSize: "13pt", fontWeight: 700, margin: "12pt 0 6pt" }}>
                {renderRuns(b.runs, k)}
              </h2>
            );
          case "h3":
            return (
              <h3 key={k} style={{ fontSize: "12pt", fontWeight: 700, margin: "10pt 0 4pt" }}>
                {renderRuns(b.runs, k)}
              </h3>
            );
          case "li":
            return (
              <ul key={k} style={{ margin: "0 0 0 18pt", padding: 0, listStyle: "disc" }}>
                <li style={{ margin: "2pt 0" }}>{renderRuns(b.runs, k)}</li>
              </ul>
            );
          case "p":
          default:
            return (
              <p key={k} style={{ margin: "0 0 8pt" }}>
                {renderRuns(b.runs, k)}
              </p>
            );
        }
      })}
    </div>
  );
}
