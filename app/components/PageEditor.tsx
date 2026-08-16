"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPath } from "sanapp-common-ui";
import { PRIMARY_ROLE_LABELS } from "@/lib/labels";
import { Markdown } from "./Markdown";

type SectionOption = { id: string; label: string; chain: string[]; slugChain: string[] };
type UserOption = { username: string; name: string; primaryRole: string };

const VISIBILITIES = [
  { value: "PUBLIC", label: "Public — anyone can read (no login)" },
  { value: "AUTHENTICATED", label: "Signed-in users" },
  { value: "RESTRICTED", label: "Restricted — only selected roles/users" },
];

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

export function PageEditor({
  mode,
  pageId,
  initial,
  sections,
  users,
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
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);
  const mdRef = useRef<HTMLInputElement>(null);

  const roles = useMemo(() => Object.entries(PRIMARY_ROLE_LABELS), []);
  const effectiveSlug = slugTouched ? slug : slugify(title);

  function toggleRole(r: string) {
    setAllowedRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }
  function toggleUser(u: string) {
    setAllowedUsers((prev) => (prev.includes(u) ? prev.filter((x) => x !== u) : [...prev, u]));
  }

  async function upload(files: FileList | null, kind: "image" | "md") {
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (pageId) fd.append("pageId", pageId);
      const res = await fetch(apiPath("/api/upload"), { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Upload failed");
        return;
      }
      if (kind === "image") {
        const md = `![${data.asset.filename}](${data.asset.url})`;
        setContent((c) => (c ? c + "\n\n" + md : md));
      } else {
        const textRes = await fetch(apiPath(data.asset.url));
        const text = await textRes.text();
        setContent((c) => (c ? c + "\n\n" + text : text));
        if (!title.trim()) setTitle(file.name.replace(/\.mdx?$/i, ""));
      }
    } catch {
      setError("Upload failed — try again");
    } finally {
      setUploading(false);
      if (imageRef.current) imageRef.current.value = "";
      if (mdRef.current) mdRef.current.value = "";
    }
  }

  async function submit(action: "save" | "publish") {
    setBusy(true);
    setError(null);
    if (!title.trim()) {
      setError("Title is required.");
      setBusy(false);
      return;
    }
    if (!sectionId) {
      setError("Choose a section.");
      setBusy(false);
      return;
    }
    if (!effectiveSlug) {
      setError("A slug is required (auto-generated from the title).");
      setBusy(false);
      return;
    }
    if (visibility === "RESTRICTED" && allowedRoles.length === 0 && allowedUsers.length === 0) {
      setError("Restricted pages need at least one allowed role or user.");
      setBusy(false);
      return;
    }
    try {
      let id = pageId;
      if (mode === "new" && !id) {
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
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) {
          setError(
            createData?.error === "slug_exists"
              ? `A page with slug "${createData.slug ?? effectiveSlug}" already exists in this section.`
              : createData?.error ?? "Could not create the page."
          );
          return;
        }
        id = createData.page.id;
      }
      if (!id) return;
      const res = await fetch(apiPath(`/api/pages/${id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          slug: effectiveSlug,
          content,
          visibility,
          allowedRoles,
          allowedUsers,
          changeSummary: summary.trim() || undefined,
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error === "slug_exists" ? "Slug already exists in this section." : data?.error ?? "Save failed.");
        return;
      }
      const sec = sections.find((s) => s.id === sectionId);
      const chain = sec?.slugChain ?? [];
      const path = `/docs/${[...chain, effectiveSlug].join("/")}`;
      router.push(apiPath(path));
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Title *</label>
          <input
            className="wiki-search"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            placeholder="e.g. How to set up VPN"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Section *</label>
          <select className="wiki-search" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Slug (URL path)</label>
          <input
            className="wiki-search"
            value={effectiveSlug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            placeholder="how-to-setup-vpn"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Visibility</label>
          <select
            className="wiki-search"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
          >
            {VISIBILITIES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visibility === "RESTRICTED" && (
        <div className="rounded-md border p-3 space-y-3">
          <div>
            <div className="text-sm font-medium mb-1">Allowed primary roles</div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {roles.map(([value, label]) => (
                <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem" }}>
                  <input
                    type="checkbox"
                    checked={allowedRoles.includes(value)}
                    onChange={() => toggleRole(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-1">Allowed users</div>
            <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
              {users.map((u) => (
                <label key={u.username} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.85rem" }}>
                  <input
                    type="checkbox"
                    checked={allowedUsers.includes(u.username)}
                    onChange={() => toggleUser(u.username)}
                  />
                  {u.name} ({u.username})
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <label className="text-sm font-medium">Content (Markdown)</label>
          <span style={{ marginLeft: "auto", display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              className="iipe-btn secondary"
              style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
              onClick={() => imageRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Upload image"}
            </button>
            <button
              type="button"
              className="iipe-btn secondary"
              style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
              onClick={() => mdRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Upload .md file"}
            </button>
            <button
              type="button"
              className="iipe-btn ghost"
              style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}
              onClick={() => setPreview((p) => !p)}
            >
              {preview ? "Edit" : "Preview"}
            </button>
          </span>
        </div>
        <input
          ref={imageRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          style={{ display: "none" }}
          onChange={(e) => upload(e.target.files, "image")}
        />
        <input
          ref={mdRef}
          type="file"
          accept=".md,.markdown,text/markdown"
          style={{ display: "none" }}
          onChange={(e) => upload(e.target.files, "md")}
        />
        {preview ? (
          <div className="rounded-md border p-4" style={{ minHeight: 260 }}>
            {content.trim() ? <Markdown content={content} /> : <span className="wiki-meta">Nothing to preview yet.</span>}
          </div>
        ) : (
          <textarea
            className="wiki-search wiki-editor"
            style={{ minHeight: 320 }}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={"# Title\n\nStart writing in Markdown…\n\n- lists\n- **bold**\n- `code`\n\n![image](/api/files/...)"}
          />
        )}
        <p className="wiki-meta">
          Images are uploaded to the app and embedded automatically. Markdown files can be uploaded and merged into the editor.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Change summary (what changed in this version)</label>
        <input
          className="wiki-search"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="e.g. Added troubleshooting section"
        />
      </div>

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="iipe-btn" onClick={() => submit("publish")} disabled={busy}>
          {busy ? "Saving…" : "Publish"}
        </button>
        <button type="button" className="iipe-btn secondary" onClick={() => submit("save")} disabled={busy}>
          Save draft
        </button>
        <a className="iipe-btn ghost" href={mode === "edit" && pageId ? apiPath(`/pages/${pageId}/history`) : apiPath("/")}>
          Cancel
        </a>
        {mode === "edit" && pageId && (
          <a className="iipe-btn ghost" href={apiPath("/")} style={{ marginLeft: "auto", fontSize: "0.85rem" }}>
            ← Back to wiki
          </a>
        )}
      </div>
    </div>
  );
}
