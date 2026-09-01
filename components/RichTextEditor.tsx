"use client";

import { useEffect, useRef, useState } from "react";

// Base/default size (12px = 9pt @96dpi) intentionally matches the size used
// for "ผู้ตรวจสอบ" / "ผู้อนุมัติ" under the signature line elsewhere in the
// document, per the user's request that ordinary body text look consistent
// with that reference point — both on screen and in the exported PDF (see
// DETAILS_BASE_PT in MemorandumPdfButton.tsx and the 9pt body class in
// MemoPrintPreview.tsx).
const BASE_FONT_PX = 12;

const FONT_SIZES = [
  { label: "Small", px: 10 },
  { label: "Normal", px: BASE_FONT_PX },
  { label: "Large", px: 16 },
  { label: "X-Large", px: 20 },
];

const COLORS = [
  { label: "Black", value: "#111827" },
  { label: "Red", value: "#c0392b" },
  { label: "Blue", value: "#2563eb" },
  { label: "Green", value: "#2e4e1d" },
  { label: "Orange", value: "#c2410c" },
];

// One indent "step" — 4 non-breaking spaces rather than a literal tab
// character. A raw "\t" is deliberately neutralized to a single space
// further downstream (see lib/memoRichText.ts's parseRichText, used by
// both the print preview and the PDF export), and plain regular spaces
// collapse to one in normal HTML rendering —   (nbsp) is the one
// character that both survives sanitizeMemoHtml unchanged and renders
// as real, non-collapsing width in every place this HTML ends up.
const INDENT = "    ";

// Wraps the current selection in a <span style="..."> with the given
// declaration, splitting text nodes at the selection boundary as needed.
// Used for font size / color instead of execCommand("fontSize"/"foreColor"),
// whose cross-browser output (legacy <font size="N">, inconsistent handling
// under styleWithCSS) is unpredictable — a plain span is exactly what
// lib/memoRichText.ts's sanitizer/parser expects.
function applyStyleToSelection(styleDecl: string) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const span = document.createElement("span");
  span.setAttribute("style", styleDecl);
  try {
    range.surroundContents(span);
  } catch {
    // Selection crosses element boundaries (e.g. spans part of a <b>..</b>
    // plus plain text) — surroundContents can't wrap that directly.
    const contents = range.extractContents();
    span.appendChild(contents);
    range.insertNode(span);
  }
  sel.removeAllRanges();
  const newRange = document.createRange();
  newRange.selectNodeContents(span);
  sel.addRange(newRange);
}

function unwrapStyledSpansInSelection() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const root = container.nodeType === 1 ? (container as Element) : container.parentElement;
  if (!root) return;
  root.querySelectorAll("span[style]").forEach((span) => {
    if (!range.intersectsNode(span)) return;
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  });
}

export default function RichTextEditor({
  name,
  defaultValue,
  onChange,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState(defaultValue || "");
  const [empty, setEmpty] = useState(!defaultValue);

  // Set the initial content once — after this, the browser owns the DOM
  // inside the editor. Re-rendering innerHTML from React state on every
  // keystroke would reset the cursor position.
  useEffect(() => {
    if (editorRef.current && defaultValue) {
      editorRef.current.innerHTML = defaultValue;
    }
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
      // Unsupported in some browsers — Enter still inserts a break, just
      // not necessarily wrapped in <p>. Not fatal.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    const el = editorRef.current;
    if (!el) return;
    const next = el.innerHTML === "<br>" ? "" : el.innerHTML;
    setHtml(next);
    setEmpty(el.textContent?.trim().length === 0);
    onChange?.(next);
  }

  function withFocus(fn: () => void) {
    editorRef.current?.focus();
    fn();
    sync();
  }

  // Tab has no native "indent this text" behavior inside a contentEditable
  // — by default the browser just moves focus to the next focusable
  // element (the next toolbar button/field), so a memo author had no way
  // to indent a paragraph at all. Shift+Tab removes one indent step from
  // the start of the current line; plain Tab adds one at the cursor.
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    e.preventDefault();

    if (e.shiftKey) {
      outdentCurrentLine();
    } else {
      document.execCommand("insertText", false, INDENT);
    }
    sync();
  }

  // Removes up to one INDENT step of leading nbsp/space from the start of
  // the line the cursor is currently on.
  function outdentCurrentLine() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent || "";
    const before = text.slice(0, range.startOffset);
    const m = before.match(/[  ]{1,4}$/);
    if (!m) return;
    const removeLen = m[0].length;
    node.textContent = text.slice(0, range.startOffset - removeLen) + text.slice(range.startOffset);
    const newRange = document.createRange();
    newRange.setStart(node, range.startOffset - removeLen);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  const btnClass =
    "rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50";

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-1.5 rounded-t-md border border-b-0 border-gray-300 bg-gray-50 p-1.5">
        <button type="button" className={`${btnClass} font-bold`} onMouseDown={(e) => e.preventDefault()} onClick={() => withFocus(() => document.execCommand("bold"))}>
          B
        </button>
        <button type="button" className={`${btnClass} italic`} onMouseDown={(e) => e.preventDefault()} onClick={() => withFocus(() => document.execCommand("italic"))}>
          I
        </button>
        <button type="button" className={`${btnClass} underline`} onMouseDown={(e) => e.preventDefault()} onClick={() => withFocus(() => document.execCommand("underline"))}>
          U
        </button>

        <span className="mx-1 h-5 w-px bg-gray-300" />

        <select
          className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs text-gray-700"
          defaultValue=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const px = Number(e.target.value);
            if (px) withFocus(() => applyStyleToSelection(`font-size:${px}px`));
            e.target.value = "";
          }}
        >
          <option value="" disabled>
            Size
          </option>
          {FONT_SIZES.map((s) => (
            <option key={s.px} value={s.px}>
              {s.label}
            </option>
          ))}
        </select>

        <span className="mx-1 h-5 w-px bg-gray-300" />

        {COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            title={c.label}
            className="h-6 w-6 rounded border border-gray-300"
            style={{ backgroundColor: c.value }}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => withFocus(() => applyStyleToSelection(`color:${c.value}`))}
          />
        ))}
        <input
          type="color"
          title="Custom color"
          className="h-6 w-7 cursor-pointer rounded border border-gray-300 p-0"
          onMouseDown={(e) => e.preventDefault()}
          onChange={(e) => withFocus(() => applyStyleToSelection(`color:${e.target.value}`))}
        />

        <span className="mx-1 h-5 w-px bg-gray-300" />

        <button
          type="button"
          className={btnClass}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            withFocus(() => {
              document.execCommand("removeFormat");
              unwrapStyledSpansInSelection();
            })
          }
        >
          Clear
        </button>
      </div>

      <div className="relative">
        {empty && placeholder && (
          <div className="pointer-events-none absolute left-2 top-1.5 text-sm text-gray-400">{placeholder}</div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          onBlur={sync}
          onKeyDown={handleKeyDown}
          style={{ fontSize: `${BASE_FONT_PX}px` }}
          className="min-h-[140px] w-full rounded-b-md border border-gray-300 px-2 py-1.5 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>

      {/* Posted as a normal form field — MemorandumForm reads this with FormData, unchanged from when it was a <textarea name="details">. A "required" attribute here wouldn't do anything useful (hidden inputs are skipped by native form validation), so emptiness is checked in MemorandumForm's submit handler and again server-side in createMemorandum. */}
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
