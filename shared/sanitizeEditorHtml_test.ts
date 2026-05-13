import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sanitizeEditorHtml } from "./sanitizeEditorHtml.ts";

// ============================================================================
// Corruption-strip suite
// Asserts the sanitiser removes ADDGenAI-style residue, AI-injected classes,
// inline event handlers, JS in styles, and disallowed data attributes.
// ============================================================================

Deno.test("strips contenteditable, draggable, spellcheck, tabindex", () => {
  const input = `<p contenteditable="true" draggable="true" spellcheck="false" tabindex="0">x</p>`;
  const out = sanitizeEditorHtml(input);
  assert(!out.includes("contenteditable"), `leaked contenteditable: ${out}`);
  assert(!out.includes("draggable"), `leaked draggable: ${out}`);
  assert(!out.includes("spellcheck"), `leaked spellcheck: ${out}`);
  assert(!out.includes("tabindex"), `leaked tabindex: ${out}`);
});

Deno.test("strips inline event handlers (onclick, onerror)", () => {
  const input = `<p onclick="alert(1)">x</p><img src="x" onerror="alert(1)">`;
  const out = sanitizeEditorHtml(input);
  assert(!/on(click|error)=/i.test(out), `leaked event handler: ${out}`);
});

Deno.test("strips javascript: and expression() in style", () => {
  const input = `<p style="color: red; background: javascript:alert(1); width: expression(alert(1))">x</p>`;
  const out = sanitizeEditorHtml(input);
  assert(!/javascript:/i.test(out), `leaked javascript: ${out}`);
  assert(!/expression\(/i.test(out), `leaked expression(): ${out}`);
});

Deno.test("strips unknown classes (font-claude, ai-residue)", () => {
  const input = `<p class="font-claude figure-caption ai-residue">x</p>`;
  const out = sanitizeEditorHtml(input);
  assert(!out.includes("font-claude"), `leaked font-claude: ${out}`);
  assert(!out.includes("ai-residue"), `leaked ai-residue: ${out}`);
  assertStringIncludes(out, "figure-caption");
});

Deno.test("strips unknown data-* attributes", () => {
  const input = `<span data-bogus="x" data-claude-id="y" data-wp-color="#fff">x</span>`;
  const out = sanitizeEditorHtml(input);
  assert(!out.includes("data-bogus"), `leaked data-bogus: ${out}`);
  assert(!out.includes("data-claude-id"), `leaked data-claude-id: ${out}`);
  assertStringIncludes(out, 'data-wp-color="#fff"');
});

Deno.test("strips disallowed tags (script, iframe, object)", () => {
  const input = `<p>ok</p><script>alert(1)</script><iframe src="evil"></iframe><object data="evil"></object>`;
  const out = sanitizeEditorHtml(input);
  assert(!/<script/i.test(out), `leaked <script>: ${out}`);
  assert(!/<iframe/i.test(out), `leaked <iframe>: ${out}`);
  assert(!/<object/i.test(out), `leaked <object>: ${out}`);
  assertStringIncludes(out, "<p>ok</p>");
});

// ============================================================================
// Preservation suite
// Asserts the sanitiser KEEPS legitimate proposal content intact.
// ============================================================================

Deno.test("preserves inline-ref badges with style, data-wp-color, data-ref-type", () => {
  const input = `<span class="inline-ref" style="border-color: #2563EB" data-wp-color="#2563EB" data-ref-type="wp" data-wp-reference="WP1">WP1</span>`;
  const out = sanitizeEditorHtml(input);
  assertStringIncludes(out, 'class="inline-ref"');
  assertStringIncludes(out, "border-color: #2563EB");
  assertStringIncludes(out, 'data-wp-color="#2563EB"');
  assertStringIncludes(out, 'data-ref-type="wp"');
  assertStringIncludes(out, 'data-wp-reference="WP1"');
});

Deno.test("preserves <table class='he-table'> with body content", () => {
  const input = `<table class="he-table"><tbody><tr><td>cell</td></tr></tbody></table>`;
  const out = sanitizeEditorHtml(input);
  assertStringIncludes(out, 'class="he-table"');
  assertStringIncludes(out, "<tbody>");
  assertStringIncludes(out, "<td>cell</td>");
});

Deno.test("preserves <p class='figure-caption'>", () => {
  const input = `<p class="figure-caption">Figure 1.</p>`;
  const out = sanitizeEditorHtml(input);
  assertStringIncludes(out, 'class="figure-caption"');
  assertStringIncludes(out, "Figure 1.");
});

Deno.test("preserves bold, italic, underline, lists, headings", () => {
  const input = `<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><p><strong>b</strong> <em>i</em> <u>u</u></p><ul><li>a</li></ul><ol><li>n</li></ol>`;
  const out = sanitizeEditorHtml(input);
  ["<h1>H1", "<h2>H2", "<h3>H3", "<h4>H4", "<strong>b", "<em>i", "<u>u", "<ul>", "<li>a", "<ol>", "<li>n"].forEach((needle) => {
    assertStringIncludes(out, needle);
  });
});

Deno.test("preserves inline SVG (chevrons / diamond badges)", () => {
  const input = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M5 12l5 5L20 7" stroke="#2563EB" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="10" fill="#2563EB"/></svg>`;
  const out = sanitizeEditorHtml(input);
  assertStringIncludes(out, "<svg");
  assertStringIncludes(out, "<path");
  assertStringIncludes(out, "<circle");
  assertStringIncludes(out, 'd="M5 12l5 5L20 7"');
  assertStringIncludes(out, 'cx="12"');
  assertStringIncludes(out, 'fill="#2563EB"');
  assertStringIncludes(out, 'stroke="#2563EB"');
});

Deno.test("preserves allowed style properties (text-align, width)", () => {
  const input = `<p style="text-align: center; width: 50%; color: red">x</p>`;
  const out = sanitizeEditorHtml(input);
  assertStringIncludes(out, "text-align: center");
  assertStringIncludes(out, "width: 50%");
  assertStringIncludes(out, "color: red");
});

// ============================================================================
// Smoke: empty input is safe
// ============================================================================

Deno.test("returns empty string for empty/null input", () => {
  assertEquals(sanitizeEditorHtml(""), "");
  // @ts-expect-error intentional null
  assertEquals(sanitizeEditorHtml(null), "");
});
