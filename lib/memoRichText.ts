// Shared rich-text handling for the Memorandum "Details" field.
//
// The field is authored with RichTextEditor (components/RichTextEditor.tsx),
// which only ever produces a small, known set of tags/styles. This module
// is the single place that (a) sanitizes that HTML before it's stored or
// re-rendered, and (b) turns sanitized HTML into a plain data structure
// (paragraphs of styled "runs") that both the on-screen preview and the
// jsPDF export can walk without needing a DOM — this file has no DOM
// dependency, so it works the same in a Next.js server action (Node) and
// in the browser.
//
// Older memorandums predate this editor and have `details` as plain text
// (possibly with literal "\n" newlines, no tags at all). Both functions
// below detect that case — "no '<' in the string" — and treat each
// newline-separated line as its own unstyled paragraph, so old memos keep
// rendering/exporting correctly with no data migration needed.

export type RichRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string | null; // CSS color, e.g. "#c0392b"
  fontSize: number | null; // px, e.g. 10 / 14 / 18 / 24
};

export type RichParagraph = RichRun[];

const ALLOWED_TAGS = new Set(["p", "div", "br", "b", "strong", "i", "em", "u", "span"]);
const BLOCK_TAGS = new Set(["p", "div"]);

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const RGB_COLOR_RE = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)$/;
const NAMED_COLOR_RE = /^[a-zA-Z]{3,20}$/; // e.g. "red", "black" — matches execCommand output

function isSafeColor(value: string): boolean {
  const v = value.trim();
  return HEX_COLOR_RE.test(v) || RGB_COLOR_RE.test(v) || NAMED_COLOR_RE.test(v);
}

function parseStyleAttr(style: string): { color: string | null; fontSize: number | null } {
  let color: string | null = null;
  let fontSize: number | null = null;
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (prop === "color" && isSafeColor(value)) {
      color = value;
    } else if (prop === "font-size") {
      const m = value.match(/^(\d+(?:\.\d+)?)px$/);
      if (m) {
        const n = Math.round(Number(m[1]));
        if (n >= 6 && n <= 96) fontSize = n;
      }
    }
  }
  return { color, fontSize };
}

function decodeEntities(text: string): string {
  return text
  // "&nbsp;" -> a *real* U+00A0 non-breaking space, not a plain " ".
  // The browser's own HTML serializer escapes every literal U+00A0 a user
  // typed (e.g. via Tab-to-indent, see components/RichTextEditor.tsx) to
  // "&nbsp;" when it builds editorRef.current.innerHTML — so by the time
  // that HTML reaches here, an indent is "&nbsp;" text, not a raw NBSP
  // byte. Decoding it to a plain space used to throw the indent away: a
  // run of plain spaces is "collapsible whitespace" under normal CSS
  // (see the .memo-rich-body rendering in MemoPrintPreview.tsx, which has
  // no white-space:pre/pre-wrap) and the browser collapses it down to a
  // single space, so Tab-indented paragraphs looked un-indented in the
  // print preview / exported PDF even though they were fine in the editor
  // itself. A real U+00A0 is never collapsible, so it survives.
  .replace(/&nbsp;/g, " ")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, "&");
}

function encodeEntities(text: string): string {
  return text
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");
}

type Token =
  | { kind: "text"; text: string }
| { kind: "open"; tag: string; attrs: Record<string, string> }
| { kind: "close"; tag: string }
| { kind: "selfclose"; tag: string; attrs: Record<string, string> };

// Small hand-rolled tokenizer — not a general HTML5 parser, but sufficient
// (and safe) for the constrained output our own editor produces. Anything
// that isn't a recognized "<tag ...>" / "</tag>" shape is treated as plain
// text, so a raw "<" a user typed can never be misread as markup.
function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = html.length;
  let textBuf = "";

const flushText = () => {
  if (textBuf) {
    tokens.push({ kind: "text", text: textBuf });
    textBuf = "";
  }
};

while (i < n) {
  if (html[i] !== "<") {
    textBuf += html[i];
    i++;
    continue;
  }

  // Comments and doctype/processing-instructions: skip entirely.
  if (html.startsWith("<!--", i)) {
    const end = html.indexOf("-->", i + 4);
    i = end === -1 ? n : end + 3;
    continue;
  }
  if (html[i + 1] === "!" || html[i + 1] === "?") {
    const end = html.indexOf(">", i);
    i = end === -1 ? n : end + 1;
    continue;
  }

  const isClose = html[i + 1] === "/";
  const tagMatch = html.slice(i + (isClose ? 2 : 1)).match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  if (!tagMatch) {
    // Stray "<" that isn't a real tag — keep as literal text.
  textBuf += "<";
    i++;
    continue;
  }
  const tag = tagMatch[1].toLowerCase();
  const gtIdx = html.indexOf(">", i);
  if (gtIdx === -1) {
    textBuf += html.slice(i);
    break;
  }
  const rawTag = html.slice(i, gtIdx + 1);
  flushText();

  if (isClose) {
    tokens.push({ kind: "close", tag });
  } else {
    const selfClosing = /\/\s*>$/.test(rawTag);
    const attrs: Record<string, string> = {};
    const attrSrc = rawTag.slice(1 + tag.length, rawTag.length - (selfClosing ? 2 : 1));
    const attrRe = /([a-zA-Z-]+)\s*=\s*"([^"]*)"|([a-zA-Z-]+)\s*=\s*'([^']*)'/g;
    let m: RegExpExecArray | null;
    while ((m = attrRe.exec(attrSrc))) {
      const key = (m[1] || m[3]).toLowerCase();
      const val = m[2] !== undefined ? m[2] : m[4];
      attrs[key] = val;
    }
    tokens.push({ kind: selfClosing || tag === "br" ? "selfclose" : "open", tag, attrs });
  }
  i = gtIdx + 1;
}
  flushText();
  return tokens;
}

/**
* Re-serializes tokens back to a safe HTML string: only ALLOWED_TAGS survive
* as tags (everything else is dropped but its text content is kept, except
* script/style whose content is dropped too); only `style` on `span` is
* kept, and only the color/font-size declarations `parseStyleAttr` accepts.
*/
export function sanitizeMemoHtml(html: string): string {
  if (!html.includes("<")) {
    // Legacy plain text — nothing to sanitize, and no tags to strip.
  return html;
  }

const tokens = tokenize(html);
  let out = "";
  const skipContentStack: string[] = []; // tags whose text content we're dropping (script/style)

for (const t of tokens) {
  if (t.kind === "text") {
    if (skipContentStack.length === 0) out += encodeEntities(decodeEntities(t.text));
    continue;
  }
  const tag = t.tag;
  if (t.kind === "close") {
    if (skipContentStack.length && skipContentStack[skipContentStack.length - 1] === tag) {
      skipContentStack.pop();
      continue;
    }
    if (ALLOWED_TAGS.has(tag) && tag !== "br") out += `</${tag}>`;
    continue;
  }
  // open or selfclose
  if (tag === "script" || tag === "style") {
    if (t.kind === "open") skipContentStack.push(tag);
    continue;
  }
  if (skipContentStack.length) continue;

  if (!ALLOWED_TAGS.has(tag)) continue; // unknown tag: drop the tag, keep its (later) text
  if (tag === "br") {
    out += "<br>";
    continue;
  }
  if (tag === "span") {
    const { color, fontSize } = parseStyleAttr(t.attrs.style || "");
    const decls: string[] = [];
    if (color) decls.push(`color:${color}`);
    if (fontSize) decls.push(`font-size:${fontSize}px`);
    out += decls.length ? `<span style="${decls.join(";")}">` : `<span>`;
    continue;
  }
  out += `<${tag}>`;
}
  return out;
}

const EMPTY_RUN_STYLE = { bold: false, italic: false, underline: false, color: null as string | null, fontSize: null as number | null };

/** Parses already-sanitized HTML (or legacy plain text) into paragraphs of styled runs. */
export function parseRichText(html: string): RichParagraph[] {
  if (!html.includes("<")) {
    // Legacy plain text: each "\n"-separated line is its own paragraph.
  // (Tab characters are neutralized the same way the PDF fix does —
  // see components/MemorandumPdfButton.tsx — so old bugged exports
  // stay fixed even through this new rich-text path.)
  return html
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => (line ? [{ text: line, ...EMPTY_RUN_STYLE }] : []));
  }

const tokens = tokenize(sanitizeMemoHtml(html));
  const paragraphs: RichParagraph[] = [[]];
  const styleStack: { bold: boolean; italic: boolean; underline: boolean; color: string | null; fontSize: number | null }[] = [
    { ...EMPTY_RUN_STYLE },
    ];

const current = () => styleStack[styleStack.length - 1];
  const pushRun = (text: string) => {
    if (!text) return;
    const s = current();
    paragraphs[paragraphs.length - 1].push({ text, ...s });
  };
  const newParagraph = () => {
    if (paragraphs[paragraphs.length - 1].length > 0) paragraphs.push([]);
  };

for (const t of tokens) {
  if (t.kind === "text") {
    pushRun(decodeEntities(t.text).replace(/\t/g, " "));
    continue;
  }
  if (t.kind === "selfclose" && t.tag === "br") {
    newParagraph();
    continue;
  }
  if (t.kind === "open") {
    const s = current();
    if (t.tag === "b" || t.tag === "strong") styleStack.push({ ...s, bold: true });
    else if (t.tag === "i" || t.tag === "em") styleStack.push({ ...s, italic: true });
    else if (t.tag === "u") styleStack.push({ ...s, underline: true });
    else if (t.tag === "span") {
      const { color, fontSize } = parseStyleAttr(t.attrs.style || "");
      styleStack.push({ ...s, color: color ?? s.color, fontSize: fontSize ?? s.fontSize });
    } else styleStack.push({ ...s });
    continue;
  }
  if (t.kind === "close") {
    if (BLOCK_TAGS.has(t.tag)) newParagraph();
    if (styleStack.length > 1) styleStack.pop();
    continue;
  }
}

return paragraphs.filter((p, idx, arr) => !(p.length === 0 && idx === arr.length - 1));
}
