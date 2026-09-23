"use client";

import { useEffect, useMemo, useState } from "react";
import { apiPath } from "sanapp-common-ui";
import { PRIMARY_ROLE_LABELS } from "@/lib/labels";

type UserOption = { username: string; name: string; primaryRole: string };

type Section = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  allowedRoles: string[];
  allowedUsers: string[];
  _count: { pages: number; children: number };
};

export function AdminSections({ users }: { users: UserOption[] }) {
  const [sections, setSections] = useState<Section[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [description, setDescription] = useState("");
  const [createRoles, setCreateRoles] = useState<string[]>([]);
  const [createUsers, setCreateUsers] = useState<string[]>([]);
  const [editing, setEditing] = useState<Section | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editOrder, setEditOrder] = useState(0);
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editUsers, setEditUsers] = useState<string[]>([]);

  const roleEntries = useMemo(() => Object.entries(PRIMARY_ROLE_LABELS), []);

  function toggle(list: string[], set: (v: string[]) => void, value: string) {
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);
  }

  async function load() {
    try {
      const res = await fetch(apiPath("/api/sections"));
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSections(data.sections ?? []);
    } catch {
      setError("Could not load sections.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const childrenOf = useMemo(() => {
    const m = new Map<string | null, Section[]>();
    for (const s of sections) {
      const key = s.parentId;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(s);
    }
    return m;
  }, [sections]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiPath("/api/sections"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          parentId: parentId || null,
          description,
          allowedRoles: createRoles,
          allowedUsers: createUsers,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          data?.error === "slug_exists"
            ? "A section with this name already exists here."
            : data?.error ?? "Create failed."
        );
        return;
      }
      setName("");
      setParentId("");
      setDescription("");
      setCreateRoles([]);
      setCreateUsers([]);
      setMessage(`Section “${data.section.name}” created.`);
      load();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!editing) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiPath(`/api/sections/${editing.id}`), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editName,
          description: editDesc,
          sortOrder: editOrder,
          allowedRoles: editRoles,
          allowedUsers: editUsers,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Save failed");
        return;
      }
      setMessage("Section updated.");
      setEditing(null);
      load();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: Section) {
    const msg =
      s._count.children > 0 || s._count.pages > 0
        ? `Delete “${s.name}”? This also deletes ${s._count.children} sub-section(s) and ${s._count.pages} page(s) inside it.`
        : `Delete “${s.name}”?`;
    if (!confirm(msg)) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(apiPath(`/api/sections/${s.id}`), { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? "Delete failed");
        return;
      }
      setMessage(`Section “${s.name}” deleted.`);
      load();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  function PublishRules({
    idPrefix,
    roles,
    setRoles,
    selectedUsers,
    setUsers,
  }: {
    idPrefix: string;
    roles: string[];
    setRoles: (v: string[]) => void;
    selectedUsers: string[];
    setUsers: (v: string[]) => void;
  }) {
    const [userQuery, setUserQuery] = useState("");
    const filteredUsers = useMemo(() => {
      const q = userQuery.trim().toLowerCase();
      if (!q) return users;
      return users.filter((u) => `${u.name} ${u.username} ${u.primaryRole}`.toLowerCase().includes(q));
    }, [userQuery, users]);

    return (
      <div style={{ display: "grid", gap: "0.75rem", gridColumn: "1 / -1" }}>
        <div className="space-y-1">
          <div className="text-sm font-medium">Who can publish pages in this section</div>
          <p className="wiki-meta">
            Only these primary roles and/or people (plus App Admin) can create or edit pages here.
            Leave both empty to follow the global publish policy.
          </p>
          <div id={`${idPrefix}-roles`} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: 4 }}>
            {roleEntries.map(([value, label]) => (
              <label key={value} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.9rem" }}>
                <input
                  type="checkbox"
                  checked={roles.includes(value)}
                  onChange={() => toggle(roles, setRoles, value)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-sm font-medium">Specific users who may publish</div>
          <input
            className="wiki-search"
            placeholder="Filter users by name or username…"
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
          />
          <div
            style={{
              maxHeight: 200,
              overflowY: "auto",
              marginTop: 6,
              display: "flex",
              flexDirection: "column",
              gap: "0.15rem",
            }}
          >
            {filteredUsers.map((u) => (
              <label
                key={u.username}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.88rem" }}
              >
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(u.username)}
                  onChange={() => toggle(selectedUsers, setUsers, u.username)}
                />
                {u.name} ({u.username})
                {u.primaryRole && <span className="wiki-meta">— {u.primaryRole.replace(/_/g, " ")}</span>}
              </label>
            ))}
            {filteredUsers.length === 0 && <span className="wiki-meta">No users match.</span>}
          </div>
          <div className="wiki-meta" style={{ marginTop: 4 }}>
            Roles: {roles.length} · Users: {selectedUsers.length}
          </div>
        </div>
      </div>
    );
  }

  function sectionPath(s: Section): string {
    const parts: string[] = [];
    let cur: Section | undefined = s;
    const byId = new Map(sections.map((x) => [x.id, x]));
    while (cur) {
      parts.unshift(cur.slug);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join("/");
  }

  function Node({ s, depth }: { s: Section; depth: number }) {
    const kids = childrenOf.get(s.id) ?? [];
    const path = sectionPath(s);
    return (
      <div style={{ marginLeft: depth * 18 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0.4rem 0.5rem",
            borderRadius: 8,
            border: "1px solid var(--iipe-border, #e5e7eb)",
            marginBottom: 6,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "0.92rem" }}>{s.name}</span>
          <span className="wiki-meta">/{path}</span>
          <span className="wiki-meta">
            {s._count.pages} pages · {s._count.children} sub
          </span>
          <span className="wiki-meta">
            publish:{" "}
            {s.allowedRoles.length || s.allowedUsers.length
              ? `${s.allowedRoles.length} roles, ${s.allowedUsers.length} users`
              : "global policy"}
          </span>
          <span style={{ marginLeft: "auto", display: "flex", gap: "0.4rem" }}>
            <button
              type="button"
              className="iipe-btn ghost"
              style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem" }}
              onClick={() => {
                setEditing(s);
                setEditName(s.name);
                setEditDesc(s.description ?? "");
                setEditOrder(s.sortOrder);
                setEditRoles(s.allowedRoles ?? []);
                setEditUsers(s.allowedUsers ?? []);
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className="iipe-btn ghost"
              style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem", color: "var(--iipe-danger)" }}
              onClick={() => remove(s)}
              disabled={busy}
            >
              Delete
            </button>
          </span>
        </div>
        {kids.map((k) => (
          <Node key={k.id} s={k} depth={depth + 1} />
        ))}
      </div>
    );
  }

  const roots = childrenOf.get(null) ?? [];

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-800">{message}</div>
      )}

      <form
        onSubmit={create}
        style={{
          display: "grid",
          gap: "0.6rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          alignItems: "end",
        }}
        className="iipe-card"
      >
        <div className="space-y-1">
          <label className="text-sm font-medium">Name *</label>
          <input className="wiki-search" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. VPN" />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Parent</label>
          <select className="wiki-search" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— top level —</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {sectionPath(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Description</label>
          <input className="wiki-search" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <button type="submit" className="iipe-btn" disabled={busy || !name.trim()}>
          Add section
        </button>
        <PublishRules
          idPrefix="create"
          roles={createRoles}
          setRoles={setCreateRoles}
          selectedUsers={createUsers}
          setUsers={setCreateUsers}
        />
      </form>

      {editing && (
        <div className="iipe-card space-y-3">
          <div className="text-sm font-medium">Edit “{editing.name}”</div>
          <div style={{ display: "grid", gap: "0.6rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <input className="wiki-search" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" />
            <input
              className="wiki-search"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description"
            />
            <input
              className="wiki-search"
              type="number"
              value={editOrder}
              onChange={(e) => setEditOrder(Number(e.target.value))}
              placeholder="Sort order"
            />
          </div>
          <PublishRules
            idPrefix="edit"
            roles={editRoles}
            setRoles={setEditRoles}
            selectedUsers={editUsers}
            setUsers={setEditUsers}
          />
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button type="button" className="iipe-btn" onClick={saveEdit} disabled={busy}>
              Save
            </button>
            <button type="button" className="iipe-btn ghost" onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {roots.length === 0 ? (
        <div className="wiki-card wiki-meta">No sections yet — add the first one above.</div>
      ) : (
        roots.map((r) => <Node key={r.id} s={r} depth={0} />)
      )}
    </div>
  );
}
