"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiPath } from "sanapp-common-ui";
import { PRIMARY_ROLE_LABELS } from "@/lib/labels";
import { Markdown } from "./Markdown";

type SectionOption = { id: string; label: string; chain: string[]; slugChain: string[] };
type UserOption = { username: string; name: string; primaryRole: string };
type ViewMode = "write" | "split" | "preview";
type EditorAction = "save" | "publish" | "unpublish";

const VISIBILITIES: { value: string; label: string; hint: string; tone: string }[] = [
  { value: "PUBLIC", label: "Public", hint: "Anyone who can reach the intranet — no sign-in needed.", tone: "public" },
  {
    value: "AUTHENTICATED",
    label: "Signed-in users",
    hint: "Every signed-in IIPE user can read this page.",
    tone: "auth",
  },
  {
    value: "RESTRICTED",
    label: "Restricted",
    hint: "Only the roles and people you pick below can read it.",
    tone: "restricted",
  },
];

// One-click change summaries — the version history reads far better when every
// save carries a short "what changed".
const SUMMARY_PRESETS = [
  "Initial version",
  "Added steps",
  "Clarified wording",
  "Fixed typo",
  "Updated screenshots",
  "Added troubleshooting",
  "Restructured sections",
];

// Reusable Markdown blocks, inserted at the caret.
const SNIPPETS: { key: string; label: string; hint: string; body: string }[] = [
  {
    key: "steps",
    label: "Step-by-step",
    hint: "A numbered how-to sequence",
    body: "1. First step\n2. Second step\n3. Third step",
  },
  {
    key: "note",
    label: "Note callout",
    hint: "An aside readers should not miss",
    body: "> **Note:** something worth calling out.",
  },
  {
    key: "warning",
    label: "Important callout",
    hint: "Something that can go wrong",
    body: "> **Important:** do this before that, otherwise it will not work.",
  },
  {
    key: "table",
    label: "Table (3 × 3)",
    hint: "Grid of values with a header row",
    body: "| Item | Details | Notes |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |",
  },
  {
    key: "troubleshooting",
    label: "Troubleshooting",
    hint: "Symptom → fix table",
    body: "## Troubleshooting\n\n| Symptom | What to do |\n| --- | --- |\n|  |  |",
  },
  {
    key: "faq",
    label: "FAQ pair",
    hint: "A question and its answer",
    body: "**Q: What if I am off campus?**\n\nA: Connect to the VPN first, then follow the same steps.",
  },
  {
    key: "code",
    label: "Code / command",
    hint: "A fenced, copyable command",
    body: "```bash\ncommand --flag value\n```",
  },
  {
    key: "contact",
    label: "Contact block",
    hint: "Where to get help",
    body: "## Need help?\n\nRaise a request under **IT Network** in Log Request, or write to support.erp@iipe.ac.in.",
  },
];

// Full starter structures, offered while a brand-new page is still empty.
const TEMPLATES: { key: string; label: string; hint: string; body: (title: string) => string }[] = [
  {
    key: "howto",
    label: "How-to guide",
    hint: "Requirements, steps and troubleshooting",
    body: (t) =>
      `# ${t}\n\nOne line on what this page helps you do.\n\n## Before you start\n\n- Item you need\n- Access you must have\n\n## Steps\n\n1. First step\n2. Second step\n3. Third step\n\n## Troubleshooting\n\n| Symptom | What to do |\n| --- | --- |\n|  |  |\n\n## Need help?\n\nRaise a request under the relevant category in Log Request.`,
  },
  {
    key: "reference",
    label: "Reference / table",
    hint: "Facts and values in a table",
    body: (t) =>
      `# ${t}\n\nShort summary of what this reference covers.\n\n| Item | Details |\n| --- | --- |\n|  |  |\n|  |  |\n\n## Notes\n\n> **Note:** anything readers commonly get wrong.`,
  },
  {
    key: "faq",
    label: "FAQ",
    hint: "Questions and answers",
    body: (t) => `# ${t}\n\n**Q: First question?**\n\nA: The answer.\n\n**Q: Second question?**\n\nA: The answer.`,
  },
  {
    key: "policy",
    label: "Policy / notice",
    hint: "Rules and who they apply to",
    body: (t) =>
      `# ${t}\n\n## Applies to\n\n- Group or role this covers\n\n## What the policy says\n\n1. Rule one\n2. Rule two\n\n## Effective date\n\n> **Note:** updated on <date>.`,
  },
];

const SHORTCUTS = [
  { keys: "Ctrl / ⌘ + B", what: "Bold" },
  { keys: "Ctrl / ⌘ + I", what: "Italic" },
  { keys: "Ctrl / ⌘ + K", what: "Insert a link" },
  { keys: "Ctrl / ⌘ + S", what: "Save a version" },
  { keys: "Tab", what: "Indent two spaces" },
  { keys: "Paste / drop", what: "Upload an image or insert a text file" },
];

/** Any of these extensions can be merged/inserted as text (not just .md). */
const TEXT_FILE_RE = /\.(txt|csv|tsv|json|ya?ml|toml|ini|cfg|conf|env|log|html?|css|scss|jsx?|tsx?|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|bash|zsh|ps1|psm1|bat|cmd|sql|r|pl|lua|scala|xml|diff|patch)$/i;

/** Fenced-code language label for an inserted file, by extension. */
const CODE_LANG_BY_EXT: Record<string, string> = {
  js: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx", mjs: "javascript", cjs: "javascript",
  py: "python", rb: "ruby", go: "go", rs: "rust", java: "java", kt: "kotlin", swift: "swift",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp", php: "php",
  sh: "bash", bash: "bash", zsh: "shell", ps1: "powershell", psm1: "powershell", bat: "batch", cmd: "batch",
  sql: "sql", r: "r", pl: "perl", lua: "lua", scala: "scala",
  html: "html", htm: "html", css: "css", scss: "scss", xml: "xml",
  json: "json", yml: "yaml", yaml: "yaml", toml: "toml", ini: "ini", cfg: "ini", conf: "ini", env: "ini",
  csv: "csv", tsv: "tsv", diff: "diff", patch: "diff",
};

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || ""
  );
}

function contentStats(content: string) {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/[#>*_[\]()!|]/g, " ");
  const words = plain.split(/\s+/).filter(Boolean).length;
  return {
    words,
    chars: content.length,
    headings: (content.match(/^#{1,6}\s/gm) ?? []).length,
    links: (content.match(/(^|[^!])\[[^\]]*\]\([^)]*\)/g) ?? []).length,
    images: (content.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length,
    tables: (content.match(/^\s*\|[-: |]+\|\s*$/gm) ?? []).length,
    readMinutes: Math.max(1, Math.round(words / 200)),
  };
}

type OutlineItem = { level: number; text: string; offset: number };

function outlineOf(content: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  let offset = 0;
  content.split("\n").forEach((line) => {
    const m = /^(#{1,4})\s+(.*\S)\s*$/.exec(line);
    if (m) items.push({ level: m[1].length, text: m[2], offset });
    offset += line.length + 1;
  });
  return items;
}

function ToolButton({
  label,
  title,
  shortcut,
  active,
  onClick,
}: {
  label: string;
  title: string;
  shortcut?: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`wiki-ed-tool${active ? " on" : ""}`}
      title={shortcut ? `${title} (${shortcut})` : title}
      aria-label={title}
      // Keep the caret and the selection inside the textarea when a tool is hit.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// ---- Searchable multi-select (roles & people) ------------------------------
// A combobox with type-to-filter, keyboard nav (↑/↓/Enter/Escape), removable
// chips for what is already picked, and a capped list for very long rosters.
type PickerOption = { value: string; label: string; hint?: string; group?: string };

function initialsOf(name: string): string {
  const parts = name.replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Smt\.|Prof\.)\s+/i, "").trim().split(/\s+/);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return (letters.join("") || name.slice(0, 2).toUpperCase()).slice(0, 2);
}

function PeoplePicker({
  values,
  options,
  onChange,
  searchPlaceholder,
  addLabel,
  emptyText,
}: {
  values: string[];
  options: PickerOption[];
  onChange: (next: string[]) => void;
  searchPlaceholder: string;
  addLabel: string;
  emptyText: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const valueSet = useMemo(() => new Set(values), [values]);
  const selectedOptions = useMemo(
    () => values.map((v) => options.find((o) => o.value === v)).filter((o): o is PickerOption => Boolean(o)),
    [values, options]
  );
  const roleKeys = useMemo(() => {
    const keys = new Map<string, number>();
    for (const o of options) {
      const key = o.group ?? "";
      if (key) keys.set(key, (keys.get(key) ?? 0) + 1);
    }
    return [...keys.entries()].sort((a, b) => b[1] - a[1]);
  }, [options]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = options;
    if (roleFilter) list = list.filter((o) => (o.group ?? "") === roleFilter);
    if (q) list = list.filter((o) => `${o.label} ${o.hint ?? ""}`.toLowerCase().includes(q));
    return list;
  }, [options, query, roleFilter]);
  // Very long rosters stay smooth: render a window; the role chips + search narrow it faster than paging.
  const shown = filtered.slice(0, 120);

  useEffect(() => setActive(0), [query, open, roleFilter]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open, shown.length]);

  function commit(value: string) {
    onChange(valueSet.has(value) ? values.filter((x) => x !== value) : [...values, value]);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(shown.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = shown[active];
      if (target) commit(target.value);
    }
  }

  const triggerLabel =
    values.length === 0
      ? addLabel
      : values.length === 1
        ? selectedOptions[0]?.label ?? "1 selected"
        : `${values.length} selected — press to review`;

  return (
    <div className="wiki-ed-mpick" ref={rootRef}>
      {selectedOptions.length > 0 && (
        <div className="wiki-ed-chips">
          {selectedOptions.slice(0, 8).map((o) => (
            <button
              key={o.value}
              type="button"
              className="wiki-ed-chip on"
              title={`Remove ${o.label}`}
              onClick={() => commit(o.value)}
            >
              {o.label} ×
            </button>
          ))}
          {selectedOptions.length > 8 && (
            <button
              type="button"
              className="wiki-ed-chip"
              title={selectedOptions.slice(8).map((o) => o.label).join(", ")}
              onClick={() => setOpen(true)}
            >
              +{selectedOptions.length - 8} more
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        className="wiki-ed-mpick-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
      >
        <span>{triggerLabel}</span>
        <span className="wiki-meta" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open && (
        <div className="wiki-ed-mpick-pop">
          <div className="wiki-ed-mpick-search">
            <Search size={14} aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
            {query && (
              <button type="button" className="wiki-ed-mini" onClick={() => setQuery("")}>
                Clear
              </button>
            )}
          </div>
          {roleKeys.length > 1 && (
            <div className="wiki-ed-mpick-filters" role="group" aria-label="Filter by role">
              <button
                type="button"
                className={`wiki-ed-chip${roleFilter === null ? " on" : ""}`}
                onClick={() => setRoleFilter(null)}
              >
                All {options.length}
              </button>
              {roleKeys.map(([key, count]) => (
                <button
                  key={key}
                  type="button"
                  className={`wiki-ed-chip${roleFilter === key ? " on" : ""}`}
                  onClick={() => setRoleFilter((f) => (f === key ? null : key))}
                >
                  {key} {count}
                </button>
              ))}
            </div>
          )}
          <div className="wiki-ed-mpick-list" role="listbox" aria-multiselectable="true" ref={listRef}>
            {shown.length === 0 ? (
              <span className="wiki-ed-mpick-empty wiki-meta">
                {query.trim() ? `No matches for “${query.trim()}”` : emptyText}
              </span>
            ) : (
              shown.map((o, index) => {
                const isRole = !o.group; // role rows carry no group; person rows are grouped by primary role
                return (
                  <button
                    key={o.value}
                    type="button"
                    data-index={index}
                    role="option"
                    aria-selected={valueSet.has(o.value)}
                    className={`wiki-ed-mpick-opt${index === active ? " active" : ""}`}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commit(o.value)}
                  >
                    <span className="wiki-ed-mpick-check">{valueSet.has(o.value) ? "✓" : ""}</span>
                    {isRole ? (
                      <span className="wiki-ed-mpick-avatar glyph" aria-hidden>
                        <Shield size={12} strokeWidth={2.2} />
                      </span>
                    ) : (
                      <span className="wiki-ed-mpick-avatar" aria-hidden>
                        {initialsOf(o.label)}
                      </span>
                    )}
                    <span className="wiki-ed-mpick-body">
                      <span className="wiki-ed-mpick-name">{o.label}</span>
                      {!isRole && o.hint ? <span className="wiki-ed-mpick-desc wiki-meta">{o.hint}</span> : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <div className="wiki-ed-mpick-foot wiki-meta">
            {filtered.length > shown.length
              ? `Showing ${shown.length} of ${filtered.length}${roleFilter ? ` ${roleFilter}` : ""} — keep typing to narrow.`
              : `${filtered.length}${roleFilter ? ` ${roleFilter}` : ""} ${filtered.length === 1 ? "match" : "matches"}`}
          </div>
        </div>
      )}
    </div>
  );
}

export function PageEditor({
  mode,
  pageId,
  initial,
  sections,
  users,
  status: initialStatus,
  version,
  updatedLabel,
  liveHref,
  historyHref,
  sectionPath,
}: {
  mode: "new" | "edit";
  pageId?: string;
  initial?: Partial<{
    title: string;
    slug: string;
    sectionId: string;
    visibility: string;
    allowedRoles: string[];
    allowedUsers: string[];
    content: string;
  }>;
  sections: SectionOption[];
  users: UserOption[];
  status?: string;
  version?: number;
  updatedLabel?: string;
  liveHref?: string;
  historyHref?: string;
  sectionPath?: string[];
}) {
  const router = useRouter();

  const [title, setTitle] = useState(initial?.title ?? "");
  const [sectionId, setSectionId] = useState(initial?.sectionId ?? sections[0]?.id ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [visibility, setVisibility] = useState(initial?.visibility ?? "AUTHENTICATED");
  const [allowedRoles, setAllowedRoles] = useState<string[]>(initial?.allowedRoles ?? []);
  const [allowedUsers, setAllowedUsers] = useState<string[]>(initial?.allowedUsers ?? []);
  const [content, setContent] = useState(initial?.content ?? "");
  const [summary, setSummary] = useState("");
  const [view, setView] = useState<ViewMode>("write");
  const [busy, setBusy] = useState<EditorAction | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<string[]>([]);
  const [status, setStatus] = useState(initialStatus ?? "DRAFT");
  const [versionLabel, setVersionLabel] = useState(version ?? 0);
  const [caret, setCaret] = useState({ line: 1, col: 1, selected: 0 });
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const mdRef = useRef<HTMLInputElement>(null);
  const snippetRef = useRef<HTMLDivElement | null>(null);
  // Set once a brand-new page has been created, so later saves update it
  // instead of creating a second page with the same slug.
  const createdIdRef = useRef<string | null>(null);

  const roles = useMemo(() => Object.entries(PRIMARY_ROLE_LABELS), []);
  const roleOptions = useMemo<PickerOption[]>(
    () => roles.map(([value, label]) => ({ value, label })),
    [roles]
  );
  const effectiveSlug = slugTouched ? slug : slugify(title);
  const sec = sections.find((s) => s.id === sectionId);
  const isPublished = status === "PUBLISHED";
  const stats = useMemo(() => contentStats(content), [content]);
  const outline = useMemo(() => outlineOf(content), [content]);
  const pagePath = `/docs/${[...(sec?.slugChain ?? sectionPath ?? []), effectiveSlug].join("/")}`;

  const snapshot = JSON.stringify([
    title,
    sectionId,
    effectiveSlug,
    visibility,
    [...allowedRoles].sort(),
    [...allowedUsers].sort(),
    content,
  ]);
  const [baseline, setBaseline] = useState(snapshot);
  const dirty = snapshot !== baseline;


  const userOptions = useMemo<PickerOption[]>(
    () =>
      users.map((u) => ({
        value: u.username,
        label: u.name,
        hint: [u.username, PRIMARY_ROLE_LABELS[u.primaryRole] ?? u.primaryRole].filter(Boolean).join(" · "),
        group: PRIMARY_ROLE_LABELS[u.primaryRole] ?? u.primaryRole,
      })),
    [users]
  );

  // ---- Editing helpers ---------------------------------------------------
  const apply = useCallback(
    (
      transform: (sel: { value: string; start: number; end: number }) => {
        value: string;
        selStart: number;
        selEnd: number;
      }
    ) => {
      const ta = taRef.current;
      if (!ta) return;
      const result = transform({ value: ta.value, start: ta.selectionStart, end: ta.selectionEnd });
      setContent(result.value);
      requestAnimationFrame(() => {
        const el = taRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(result.selStart, result.selEnd);
        trackCaret(el);
      });
    },
    // trackCaret is stable (component-scoped function) — no deps needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const wrapInline = useCallback(
    (marker: string, placeholder: string) => {
      apply(({ value, start, end }) => {
        const width = marker.length;
        // Already wrapped? Unwrap rather than doubling the markers.
        if (value.slice(start - width, start) === marker && value.slice(end, end + width) === marker) {
          return {
            value: value.slice(0, start - width) + value.slice(start, end) + value.slice(end + width),
            selStart: start - width,
            selEnd: end - width,
          };
        }
        const picked = value.slice(start, end) || placeholder;
        const inserted = `${marker}${picked}${marker}`;
        return {
          value: value.slice(0, start) + inserted + value.slice(end),
          selStart: start + marker.length,
          selEnd: start + marker.length + picked.length,
        };
      });
    },
    [apply]
  );

  // Toggles a line prefix, so pressing the same button twice removes it again.
  const prefixLines = useCallback(
    (prefix: string) => {
      apply(({ value, start, end }) => {
        const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        const nl = value.indexOf("\n", end);
        const blockEnd = nl === -1 ? value.length : nl;
        const lines = value.slice(lineStart, blockEnd).split("\n");
        const stripped = lines.map((l) =>
          l.replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+|-\s\[[ x]\]\s+)/, "")
        );
        const allHave = lines.every((l) => l.trimStart().startsWith(prefix.trim()));
        const next = (allHave ? stripped : stripped.map((l) => `${prefix}${l}`)).join("\n");
        return {
          value: value.slice(0, lineStart) + next + value.slice(blockEnd),
          selStart: lineStart,
          selEnd: lineStart + next.length,
        };
      });
    },
    [apply]
  );

  const insertBlock = useCallback(
    (text: string) => {
      apply(({ value, start, end }) => {
        const before = value.slice(0, start);
        const after = value.slice(end);
        const lead = before.length === 0 ? "" : before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
        const tail = after.length === 0 || after.startsWith("\n") ? "\n" : "\n\n";
        const caretPos = start + lead.length + text.length;
        return { value: `${before}${lead}${text}${tail}${after}`, selStart: caretPos, selEnd: caretPos };
      });
    },
    [apply]
  );

  const insertLink = useCallback(() => {
    apply(({ value, start, end }) => {
      const picked = value.slice(start, end);
      if (picked && /^https?:\/\//i.test(picked)) return { value, selStart: start, selEnd: end };
      const label = picked || "link text";
      const inserted = `[${label}](https://)`;
      const urlStart = start + label.length + 3;
      return {
        value: value.slice(0, start) + inserted + value.slice(end),
        selStart: urlStart,
        selEnd: urlStart + 8,
      };
    });
  }, [apply]);

  function trackCaret(el: HTMLTextAreaElement) {
    const upto = el.value.slice(0, el.selectionStart);
    const lines = upto.split("\n");
    setCaret({
      line: lines.length,
      col: (lines[lines.length - 1]?.length ?? 0) + 1,
      selected: el.selectionEnd - el.selectionStart,
    });
  }

  // ---- Uploads -----------------------------------------------------------
  const uploadFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      const isImage = file.type.startsWith("image/");
      const isMd = /\.mdx?$/i.test(file.name) || file.type === "text/markdown";
      const ext = file.name.includes(".") ? (file.name.split(".").pop() ?? "").toLowerCase() : "";
      // Any textual file (Markdown, txt, code, CSV, config…) can be inserted too.
      const looksTextual = isMd || file.type.startsWith("text/") || TEXT_FILE_RE.test(file.name);
      if (!isImage && !looksTextual) {
        setError("Images and text files can be inserted here — that file type isn't supported.");
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        if (pageId) fd.append("pageId", pageId);
        const res = await fetch(apiPath("/api/upload"), { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error ?? "Upload failed.");
          return;
        }
        if (isImage) {
          insertBlock(`![${data.asset.filename}](${data.asset.url})`);
          setNotice(`${data.asset.filename} uploaded and embedded in the page.`);
        } else {
          const textRes = await fetch(apiPath(data.asset.url));
          const text = await textRes.text();
          const baseName = file.name.replace(/\.[^.]+$/, "");
          // Plain prose (Markdown / txt) merges as-is; any other text file
          // (code, CSV, config…) goes in as a fenced code block.
          const fenced = !isMd && ext !== "txt";
          const body = fenced
            ? "```" + (CODE_LANG_BY_EXT[ext] ?? "") + "\n" + text + (text.endsWith("\n") ? "" : "\n") + "```"
            : text;
          setContent((c) => (c.trim() ? `${c.trim()}\n\n${body}` : body));
          if (!title.trim()) {
            setTitle(baseName);
            setSlug(slugify(baseName));
            setSlugTouched(false);
          }
          setNotice(fenced ? `${file.name} added as a code block at the end of the page.` : `${file.name} merged into the editor.`);
        }
      } catch {
        setError("Upload failed — please try again.");
      } finally {
        setUploading(false);
        if (imageRef.current) imageRef.current.value = "";
        if (mdRef.current) mdRef.current.value = "";
      }
    },
    [pageId, title]
  );

  // ---- Small interactions ------------------------------------------------
  useEffect(() => {
    if (!snippetOpen) return;
    function onDown(e: MouseEvent) {
      if (snippetRef.current && !snippetRef.current.contains(e.target as Node)) setSnippetOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [snippetOpen]);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);


  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      apply(({ value, start, end }) => ({
        value: `${value.slice(0, start)}  ${value.slice(end)}`,
        selStart: start + 2,
        selEnd: start + 2,
      }));
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === "b") {
      e.preventDefault();
      wrapInline("**", "bold text");
    } else if (k === "i") {
      e.preventDefault();
      wrapInline("*", "italic text");
    } else if (k === "k") {
      e.preventDefault();
      insertLink();
    } else if (k === "s") {
      e.preventDefault();
      void submit("save");
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void uploadFile(file);
          return;
        }
      }
    }
  }

  function onDropFiles(e: React.DragEvent<HTMLElement>) {
    const files = e.dataTransfer?.files;
    setDragging(false);
    if (!files || files.length === 0) return;
    e.preventDefault();
    void uploadFile(files[0]);
  }

  async function copyLink() {
    const url = typeof window === "undefined" ? pagePath : `${window.location.origin}${apiPath(pagePath)}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Page link copied to the clipboard.");
    } catch {
      setNotice(url);
    }
  }

  // ---- Save / publish ----------------------------------------------------
  async function submit(action: EditorAction) {
    setNotice(null);

    if (action === "unpublish") {
      if (!pageId) return;
      if (!window.confirm("Move this page back to draft? It stops being visible to readers.")) return;
      setBusy("unpublish");
      setError(null);
      try {
        const res = await fetch(apiPath(`/api/pages/${pageId}`), {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "unpublish" }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data?.error ?? "Could not unpublish this page.");
          return;
        }
        setStatus("DRAFT");
        setNotice("Page moved back to draft — readers can no longer see it.");
        router.refresh();
      } catch {
        setError("Network error — please try again.");
      } finally {
        setBusy(null);
      }
      return;
    }

    const problems: string[] = [];
    const bad: string[] = [];
    if (!title.trim()) {
      problems.push("add a title");
      bad.push("title");
    }
    if (!sectionId) {
      problems.push("choose a section");
      bad.push("section");
    }
    if (!effectiveSlug) {
      problems.push("give the page a URL slug");
      bad.push("slug");
    }
    if (action === "publish" && !content.trim()) {
      problems.push("write some content before publishing");
      bad.push("content");
    }
    if (visibility === "RESTRICTED" && allowedRoles.length === 0 && allowedUsers.length === 0) {
      problems.push("pick at least one role or person for a restricted page");
      bad.push("access");
    }
    if (problems.length > 0) {
      setInvalid(bad);
      setError(`Please ${problems.join(", then ")}.`);
      return;
    }
    setInvalid([]);
    setBusy(action);
    setError(null);
    const submitted = snapshot;
    const submittedSummary = summary.trim();
    try {
      let id = pageId ?? createdIdRef.current ?? undefined;
      if (!id && mode === "new") {
        const createRes = await fetch(apiPath("/api/pages"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sectionId,
            title,
            content,
            visibility,
            allowedRoles,
            allowedUsers,
            slug: effectiveSlug,
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
          setError(
            createData?.error === "slug_exists"
              ? `A page with the URL “${createData.slug ?? effectiveSlug}” already exists in this section — change the slug.`
              : createData?.error ?? "Could not create the page."
          );
          return;
        }
        id = createData.page.id;
        createdIdRef.current = id ?? null;
      }
      if (!id) return;

      const res = await fetch(apiPath(`/api/pages/${id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          slug: effectiveSlug,
          sectionId,
          content,
          visibility,
          allowedRoles,
          allowedUsers,
          changeSummary: submittedSummary || undefined,
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data?.error === "slug_exists"
            ? `Another page in that section already uses the URL “${effectiveSlug}” — pick a different slug.`
            : data?.error ?? "Save failed."
        );
        return;
      }

      setBaseline(submitted);
      setSummary("");
      setStatus(action === "publish" ? "PUBLISHED" : status);
      const nextVersion = Number(data?.page?.currentVersion?.version);
      if (Number.isFinite(nextVersion) && nextVersion > 0) setVersionLabel(nextVersion);

      if (action === "publish") {
        const chain = sec?.slugChain ?? sectionPath ?? [];
        // Bare path: next/navigation adds basePath itself (apiPath here would double it).
        router.push(`/docs/${[...chain, effectiveSlug].join("/")}`);
        router.refresh();
        return;
      }

      setNotice(
        isPublished
          ? `Version saved${submittedSummary ? ` — “${submittedSummary}”` : ""}. Readers see the new content straight away.`
          : `Draft version saved${submittedSummary ? ` — “${submittedSummary}”` : ""}. Publish when it is ready for readers.`
      );
      router.refresh();
      // A brand-new page lives at /pages/new until a save happens; move to its
      // real edit URL so the header shows the version and later saves update it.
      if (mode === "new" && createdIdRef.current) {
        const createdId = createdIdRef.current;
        setTimeout(() => router.replace(`/pages/${createdId}/edit`), 1100);
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(null);
    }
  }

  const checks = [
    { ok: Boolean(title.trim()), label: "Title", hint: "Shown in the tree, the heading and the browser tab.", optional: false },
    { ok: Boolean(sectionId), label: "Section", hint: "Where the page sits in the wiki tree.", optional: false },
    { ok: Boolean(content.trim()), label: "Body content", hint: "Markdown — headings, lists, tables, images.", optional: false },
    {
      ok: visibility !== "RESTRICTED" || allowedRoles.length + allowedUsers.length > 0,
      label: "Access rules",
      hint: "Restricted pages need at least one role or person.",
      optional: false,
    },
    {
      ok: Boolean(summary.trim()),
      label: "Change summary",
      hint: "Optional, but it makes the version history readable.",
      optional: true,
    },
  ];

  const fieldClass = (key: string, extra = "") =>
    `wiki-search${invalid.includes(key) ? " wiki-ed-invalid" : ""}${extra ? ` ${extra}` : ""}`;

  return (
    <div className="wiki-ed">
      {error && (
        <div className="iipe-alert danger wiki-ed-alert" role="alert">
          <strong>Not saved.</strong> {error}
        </div>
      )}
      {notice && <div className="iipe-alert success wiki-ed-alert">{notice}</div>}

      <div className="wiki-ed-head">
        <div className="wiki-ed-head-meta">
          <span className={`wiki-badge ${isPublished ? "wiki-badge-public" : "wiki-badge-draft"}`}>
            {isPublished ? "Published" : "Draft"}
          </span>
          <span className="wiki-meta">
            {mode === "edit" ? `Version ${versionLabel}` : "New page"}
            {updatedLabel ? ` · last updated ${updatedLabel}` : ""}
          </span>
          {dirty && <span className="wiki-ed-dirty">Unsaved changes</span>}
        </div>
        <div className="wiki-ed-head-links">
          {liveHref && (
            <a className="iipe-btn ghost" style={{ padding: "0.35rem 0.75rem" }} href={liveHref} target="_blank" rel="noreferrer">
              View page ↗
            </a>
          )}
          {historyHref && (
            <a className="iipe-btn ghost" style={{ padding: "0.35rem 0.75rem" }} href={historyHref}>
              Version history
            </a>
          )}
        </div>
      </div>

      <div className="wiki-ed-grid">
        <div className="wiki-ed-col">
          {/* ---- Page details ---- */}
          <section className="wiki-ed-panel">
            <header className="wiki-ed-panel-head">
              <h2>Page details</h2>
              <p className="wiki-meta">Where the page lives and how people find it.</p>
            </header>
            <div className="wiki-ed-panel-body">
              <div className="iipe-field">
                <label className="iipe-label" htmlFor="wiki-ed-title">
                  Title <span className="wiki-ed-req">*</span>
                </label>
                <input
                  id="wiki-ed-title"
                  className={fieldClass("title")}
                  value={title}
                  aria-invalid={invalid.includes("title")}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (!slugTouched) setSlug(slugify(e.target.value));
                  }}
                  placeholder="e.g. How to set up VPN"
                />
              </div>

              <div className="wiki-ed-2col">
                <div className="iipe-field">
                  <label className="iipe-label" htmlFor="wiki-ed-section">
                    Section
                  </label>
                  <select
                    id="wiki-ed-section"
                    className={fieldClass("section")}
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                  >
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <div className="wiki-ed-under">
                    <span className="wiki-meta">
                      {mode === "edit" ? "Changing this moves the page to another section." : "Where the page will live."}
                    </span>
                  </div>
                </div>
                <div className="iipe-field">
                  <label className="iipe-label" htmlFor="wiki-ed-slug">
                    URL slug
                  </label>
                  <input
                    id="wiki-ed-slug"
                    className={fieldClass("slug")}
                    value={slugTouched ? slug : effectiveSlug}
                    aria-invalid={invalid.includes("slug")}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugTouched(true);
                    }}
                    placeholder="how-to-setup-vpn"
                  />
                  <div className="wiki-ed-under">
                    <span className="wiki-meta">Derived from the title unless you edit it.</span>
                    {slugTouched && (
                      <button
                        type="button"
                        className="wiki-ed-mini"
                        onClick={() => {
                          setSlugTouched(false);
                          setSlug(slugify(title));
                        }}
                      >
                        Use the title again
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="wiki-ed-path">
                <span className="wiki-meta">Page address</span>
                <code>{apiPath(pagePath)}</code>
                <button type="button" className="wiki-ed-mini" onClick={() => void copyLink()}>
                  Copy link
                </button>
              </div>
            </div>
          </section>

          {/* ---- Content ---- */}
          <section className="wiki-ed-panel">
            <header className="wiki-ed-panel-head">
              <h2>Page content</h2>
              <p className="wiki-meta">
                Written in Markdown. Paste or drop an image to upload it, insert any text file, or upload a Markdown file — md/txt merge in, code and CSV go in as fenced blocks.
              </p>
              <div className="wiki-ed-panel-actions">
                <button type="button" className="wiki-ed-mini" onClick={() => mdRef.current?.click()}>
                  ⬆ Upload .md
                </button>
              </div>
            </header>

            <div className="wiki-ed-panel-body">
              <div className="wiki-ed-toolbar" role="toolbar" aria-label="Formatting">
                <div className="wiki-ed-toolgroup">
                  <ToolButton label="B" title="Bold" shortcut="Ctrl+B" onClick={() => wrapInline("**", "bold text")} />
                  <ToolButton label="I" title="Italic" shortcut="Ctrl+I" onClick={() => wrapInline("*", "italic text")} />
                  <ToolButton label="S" title="Strikethrough" onClick={() => wrapInline("~~", "struck text")} />
                  <ToolButton label="`x`" title="Inline code" onClick={() => wrapInline("`", "code")} />
                </div>
                <div className="wiki-ed-toolgroup">
                  <ToolButton label="H2" title="Heading 2" onClick={() => prefixLines("## ")} />
                  <ToolButton label="H3" title="Heading 3" onClick={() => prefixLines("### ")} />
                </div>
                <div className="wiki-ed-toolgroup">
                  <ToolButton label="•" title="Bulleted list" onClick={() => prefixLines("- ")} />
                  <ToolButton label="1." title="Numbered list" onClick={() => prefixLines("1. ")} />
                  <ToolButton label="☑" title="Checklist" onClick={() => prefixLines("- [ ] ")} />
                  <ToolButton label="❝" title="Quote or callout" onClick={() => prefixLines("> ")} />
                </div>
                <div className="wiki-ed-toolgroup">
                  <ToolButton
                    label="{ }"
                    title="Code block"
                    onClick={() => insertBlock("```bash\ncommand --flag\n```")}
                  />
                  <ToolButton label="Link" title="Insert a link" shortcut="Ctrl+K" onClick={insertLink} />
                  <ToolButton label="Table" title="Insert a 3 × 3 table" onClick={() => insertBlock(SNIPPETS[3].body)} />
                  <ToolButton label="—-" title="Divider" onClick={() => insertBlock("---")} />
                </div>
                <div className="wiki-ed-toolgroup">
                  <ToolButton
                    label={uploading ? "Uploading…" : "Image"}
                    title="Upload an image"
                    onClick={() => imageRef.current?.click()}
                  />
                  <div className="wiki-ed-snippets" ref={snippetRef}>
                    <button
                      type="button"
                      className={`wiki-ed-tool${snippetOpen ? " on" : ""}`}
                      aria-expanded={snippetOpen}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setSnippetOpen((o) => !o)}
                    >
                      Insert block ▾
                    </button>
                    {snippetOpen && (
                      <div className="wiki-ed-menu">
                        {SNIPPETS.map((s) => (
                          <button
                            key={s.key}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              insertBlock(s.body);
                              setSnippetOpen(false);
                            }}
                          >
                            <span>{s.label}</span>
                            <span className="wiki-meta">{s.hint}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <ToolButton
                    label="Text file"
                    title="Insert a text file — Markdown/txt merge in, code and CSV become fenced blocks"
                    onClick={() => mdRef.current?.click()}
                  />
                </div>
                <div className="wiki-ed-viewmode" role="group" aria-label="Editor view">
                  {(["write", "split", "preview"] as ViewMode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={view === m ? "on" : ""}
                      onClick={() => setView(m)}
                      title={
                        m === "write"
                          ? "Write only"
                          : m === "split"
                            ? "Write and preview side by side"
                            : "Preview only"
                      }
                    >
                      {m === "write" ? "Write" : m === "split" ? "Split" : "Preview"}
                    </button>
                  ))}
                </div>
              </div>

              <input
                ref={imageRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                style={{ display: "none" }}
                onChange={(e) => void uploadFile(e.target.files?.[0])}
              />
              <input
                ref={mdRef}
                type="file"
                accept=".md,.markdown,.txt,.csv,.tsv,.json,.yaml,.yml,.toml,.ini,.cfg,.conf,.log,.sql,.py,.js,.jsx,.ts,.tsx,.sh,.ps1,.bat,.html,.htm,.css,.scss,.xml,text/*"
                style={{ display: "none" }}
                onChange={(e) => void uploadFile(e.target.files?.[0])}
              />

              <div
                className={`wiki-ed-doc${dragging ? " on" : ""}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDropFiles}
              >
                <div className={`wiki-ed-pane mode-${view}`}>
                  {view !== "preview" && (
                    <textarea
                      ref={taRef}
                      className={fieldClass("content", "wiki-ed-textarea")}
                      value={content}
                      aria-invalid={invalid.includes("content")}
                      onChange={(e) => {
                        setContent(e.target.value);
                        trackCaret(e.target);
                      }}
                      onKeyDown={onKeyDown}
                      onKeyUp={(e) => trackCaret(e.currentTarget)}
                      onClick={(e) => trackCaret(e.currentTarget)}
                      onSelect={(e) => trackCaret(e.currentTarget)}
                      onPaste={onPaste}
                      placeholder={
                        "# Page title\n\nStart writing in Markdown…\n\n## Steps\n\n1. First step\n2. Second step\n\n> **Note:** use “Insert block” for ready-made sections."
                      }
                    />
                  )}
                  {view !== "write" && (
                    <div className="wiki-ed-preview">
                      {content.trim() ? (
                        <Markdown content={content} />
                      ) : (
                        <span className="wiki-meta">Nothing to preview yet — start typing on the left.</span>
                      )}
                    </div>
                  )}
                </div>
                {dragging && <div className="wiki-ed-dropnote">Drop an image — or any text file (md, txt, code, CSV…) — to insert it</div>}
              </div>

              {mode === "new" && !content.trim() && (
                <div className="wiki-ed-templates">
                  <span className="wiki-meta">Or start from a template:</span>
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      className="wiki-ed-template"
                      title={t.hint}
                      onClick={() => {
                        setContent(t.body(title.trim() || "Page title"));
                        setView("write");
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="wiki-ed-status">
                <span>
                  Ln {caret.line}, Col {caret.col}
                  {caret.selected > 0 ? ` · ${caret.selected} selected` : ""}
                </span>
                <span className="iipe-spacer" />
                <span>{stats.words} words</span>
                <span>{stats.chars} characters</span>
                <span>~{stats.readMinutes} min read</span>
                {stats.headings > 0 && <span>{stats.headings} headings</span>}
                {stats.tables > 0 && <span>{stats.tables} tables</span>}
                {stats.images > 0 && <span>{stats.images} images</span>}
                {stats.links > 0 && <span>{stats.links} links</span>}
              </div>
            </div>
          </section>

          {/* ---- Change summary ---- */}
          <section className="wiki-ed-panel">
            <header className="wiki-ed-panel-head">
              <h2>Change summary</h2>
              <p className="wiki-meta">Recorded with this version so the history explains itself.</p>
            </header>
            <div className="wiki-ed-panel-body">
              <input
                className="wiki-search"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="e.g. Added troubleshooting section"
              />
              <div className="wiki-ed-chips">
                {SUMMARY_PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`wiki-ed-chip${summary.trim() === p ? " on" : ""}`}
                    onClick={() => setSummary((s) => (s.trim() === p ? "" : p))}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* ---- Sidebar ---- */}
        <aside className="wiki-ed-side">
          <section className="wiki-ed-panel">
            <header className="wiki-ed-panel-head">
              <h2>Who can read this</h2>
              <p className="wiki-meta">Visibility is checked on every page request.</p>
            </header>
            <div className="wiki-ed-panel-body">
              <div
                className={`wiki-ed-vis${invalid.includes("access") ? " wiki-ed-invalid" : ""}`}
                role="radiogroup"
                aria-label="Page visibility"
              >
                {VISIBILITIES.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    role="radio"
                    aria-checked={visibility === v.value}
                    className={`wiki-ed-vis-card tone-${v.tone}${visibility === v.value ? " on" : ""}`}
                    onClick={() => setVisibility(v.value)}
                  >
                    <span className="wiki-ed-vis-dot" />
                    <span className="wiki-ed-vis-text">
                      <strong>{v.label}</strong>
                      <span className="wiki-meta">{v.hint}</span>
                    </span>
                  </button>
                ))}
              </div>

              {visibility === "RESTRICTED" && (
                <div className="wiki-ed-access">
                  <div className="wiki-ed-access-block">
                    <div className="wiki-ed-access-title">
                      <span>Primary roles</span>
                      {allowedRoles.length > 0 && <span className="iipe-badge">{allowedRoles.length}</span>}
                      {allowedRoles.length > 0 && (
                        <button type="button" className="wiki-ed-mini" onClick={() => setAllowedRoles([])}>
                          Clear
                        </button>
                      )}
                    </div>
                    <PeoplePicker
                      values={allowedRoles}
                      options={roleOptions}
                      onChange={setAllowedRoles}
                      searchPlaceholder={`Search ${roleOptions.length} roles`}
                      addLabel="Select roles"
                      emptyText="No role matches that search."
                    />
                  </div>

                  <div className="wiki-ed-access-block">
                    <div className="wiki-ed-access-title">
                      <span>Specific people</span>
                      {allowedUsers.length > 0 && <span className="iipe-badge">{allowedUsers.length}</span>}
                      {allowedUsers.length > 0 && (
                        <button type="button" className="wiki-ed-mini" onClick={() => setAllowedUsers([])}>
                          Clear
                        </button>
                      )}
                    </div>
                    <PeoplePicker
                      values={allowedUsers}
                      options={userOptions}
                      onChange={setAllowedUsers}
                      searchPlaceholder={`Search ${users.length} people by name, username or role`}
                      addLabel="Select people"
                      emptyText="Nobody matches that search."
                    />
                  </div>

                  {allowedRoles.length + allowedUsers.length === 0 && (
                    <p className="wiki-ed-warn">
                      A restricted page needs at least one role or person, otherwise nobody can read it.
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="wiki-ed-panel">
            <header className="wiki-ed-panel-head">
              <h2>Before you publish</h2>
              <p className="wiki-meta">Drafts can stay incomplete; publishing is what readers see.</p>
            </header>
            <div className="wiki-ed-panel-body">
              <ul className="wiki-ed-checklist">
                {checks.map((c) => (
                  <li key={c.label} className={c.ok ? "ok" : c.optional ? "optional" : "todo"}>
                    <span className="wiki-ed-check-mark">{c.ok ? "✓" : c.optional ? "—" : "!"}</span>
                    <span className="wiki-ed-check-text">
                      <strong>{c.label}</strong>
                      {!c.ok && <span className="wiki-meta">{c.hint}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="wiki-ed-panel">
            <header className="wiki-ed-panel-head">
              <h2>Document outline</h2>
              <p className="wiki-meta">
                {stats.words} words · ~{stats.readMinutes} min read · {stats.headings} headings
              </p>
            </header>
            <div className="wiki-ed-panel-body">
              {outline.length === 0 ? (
                <p className="wiki-meta">
                  Headings you add with H2 / H3 appear here, so the page stays easy to skim.
                </p>
              ) : (
                <ul className="wiki-ed-outline">
                  {outline.map((h) => (
                    <li key={`${h.offset}-${h.text}`} style={{ paddingLeft: `${(h.level - 1) * 0.7}rem` }}>
                      <button
                        type="button"
                        onClick={() => {
                          if (view === "preview") setView("write");
                          setTimeout(() => {
                            const ta = taRef.current;
                            if (!ta) return;
                            ta.focus();
                            ta.setSelectionRange(h.offset, h.offset);
                            ta.scrollTop = Math.max(
                              0,
                              (h.offset / Math.max(1, content.length)) * ta.scrollHeight - ta.clientHeight / 3
                            );
                            trackCaret(ta);
                          }, 60);
                        }}
                      >
                        <span className="wiki-ed-outline-lvl">H{h.level}</span>
                        {h.text}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="wiki-ed-panel">
            <header className="wiki-ed-panel-head">
              <h2>Shortcuts &amp; uploads</h2>
            </header>
            <div className="wiki-ed-panel-body">
              <dl className="wiki-ed-keys">
                {SHORTCUTS.map((s) => (
                  <div key={s.keys}>
                    <dt>{s.keys}</dt>
                    <dd>{s.what}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        </aside>
      </div>

      <div className="wiki-ed-actions">
        <div className="wiki-ed-actions-info">
          <span className={`wiki-badge ${isPublished ? "wiki-badge-public" : "wiki-badge-draft"}`}>
            {isPublished ? "Live page" : "Draft"}
          </span>
          {dirty ? <span className="wiki-ed-dirty">Unsaved changes</span> : <span className="wiki-meta">Everything is saved.</span>}
          {mode === "edit" && pageId && dirty && (
            <button
              type="button"
              className="wiki-ed-mini"
              onClick={() => {
                if (window.confirm("Discard your unsaved edits and reload the last saved version?")) {
                  window.location.reload();
                }
              }}
            >
              Discard edits
            </button>
          )}
        </div>
        <div className="wiki-ed-actions-buttons">
          {isPublished && mode === "edit" && (
            <button type="button" className="iipe-btn ghost" onClick={() => void submit("unpublish")} disabled={busy !== null}>
              {busy === "unpublish" ? "Unpublishing…" : "Unpublish"}
            </button>
          )}
          <button type="button" className="iipe-btn secondary" onClick={() => void submit("save")} disabled={busy !== null}>
            {busy === "save" ? "Saving…" : isPublished ? "Save without publishing" : "Save draft"}
          </button>
          <button type="button" className="iipe-btn" onClick={() => void submit("publish")} disabled={busy !== null}>
            {busy === "publish" ? "Publishing…" : isPublished ? "Publish update" : "Publish"}
          </button>
          <a
            className="iipe-btn ghost"
            href={mode === "edit" && pageId ? historyHref ?? apiPath(`/pages/${pageId}/history`) : apiPath("/")}
          >
            Cancel
          </a>
        </div>
        <p className="wiki-meta wiki-ed-actions-note">
          {isPublished
            ? "This page is live: saving a version replaces the content readers see. Unpublish moves it back to draft."
            : "Publishing makes the page visible to readers; drafts stay visible to you and the App Admin only."}
        </p>
      </div>
    </div>
  );
}
