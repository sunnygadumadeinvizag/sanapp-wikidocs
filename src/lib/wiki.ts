import { prisma } from "./prisma";
import type { AppUserSession } from "./session";

/** A viewer is either null (anonymous) or a signed-in session. */
export type Viewer = Pick<AppUserSession, "username" | "role" | "primaryRole"> | null;

import { cookies } from "next/headers";
import { verifyAppSession } from "./session";

export async function currentViewer(): Promise<Viewer | null> {
  const store = await cookies();
  const token = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(token);
  return me
    ? { username: me.username, role: me.role, primaryRole: me.primaryRole }
    : null;
}

export type PagePolicy = {
  visibility: string;
  allowedRoles: string[];
  allowedUsers: string[];
  status: string;
};

/**
 * Level 3 — can this viewer read this page?
 * PUBLIC: anyone (no auth). AUTHENTICATED: any signed-in user.
 * RESTRICTED: app ADMIN or an allowed primary role / username.
 * DRAFT pages are only visible to users who may publish.
 */
export function canViewPage(page: PagePolicy, viewer: Viewer): boolean {
  if (page.status === "DRAFT") {
    return false;
  }
  if (page.visibility === "PUBLIC") return true;
  if (!viewer) return false;
  if (page.visibility === "AUTHENTICATED") return true;
  // RESTRICTED
  if (viewer.role === "ADMIN") return true;
  if (page.allowedRoles.includes(viewer.primaryRole)) return true;
  if (page.allowedUsers.includes(viewer.username)) return true;
  return false;
}

export type Policy = { allowedRoles: string[]; allowedUsers: string[] };

/** May this user publish / edit pages? (App ADMIN always; otherwise the policy.) */
export function canPublish(user: { role: string; primaryRole: string; username: string } | null, policy: Policy): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (policy.allowedRoles.includes(user.primaryRole)) return true;
  if (policy.allowedUsers.includes(user.username)) return true;
  return false;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "page";
}

/** Loads the single-row publish policy. */
export async function getPolicy(): Promise<Policy> {
  const p = await prisma.publishPolicy.findFirst();
  return {
    allowedRoles: p?.allowedRoles ?? [],
    allowedUsers: p?.allowedUsers ?? [],
  };
}

/** The full section tree (id, name, slug, children, published pages) visible to a viewer. */
export async function buildTree(viewer: Viewer) {
  const sections = await prisma.wikiSection.findMany({
    orderBy: { sortOrder: "asc" },
    include: { pages: { include: { currentVersion: true } } },
  });
  // Prisma self-relations return children arrays; group by parentId manually.
  const byParent = new Map<string | null, typeof sections>();
  for (const s of sections) {
    const key = s.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(s);
  }
  function pageToNode(p: (typeof sections)[number]["pages"][number]) {
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      status: p.status,
    };
  }
  function node(s: (typeof sections)[number]): any {
    const pages = s.pages
      .filter((p) => canViewPage(p, viewer) || (p.status === "DRAFT" && viewer && viewer.role === "ADMIN"))
      .sort((a, b) => a.title.localeCompare(b.title))
      .map(pageToNode);
    const children = (byParent.get(s.id) ?? []).map(node);
    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      description: s.description,
      pages,
      children,
    };
  }
  return (byParent.get(null) ?? []).map(node);
}

/** Slug chain for a section (root → leaf). */
export async function sectionChain(sectionId: string): Promise<string[]> {
  const chain: string[] = [];
  let cur: { id: string; slug: string; parentId: string | null } | null = await prisma.wikiSection.findUnique({
    where: { id: sectionId },
    select: { id: true, slug: true, parentId: true },
  });
  while (cur) {
    chain.unshift(cur.slug);
    cur = cur.parentId
      ? await prisma.wikiSection.findUnique({
          where: { id: cur.parentId },
          select: { id: true, slug: true, parentId: true },
        })
      : null;
  }
  return chain;
}

/** All sections flattened with their breadcrumb label (for selectors). */
export async function listSectionsWithChain() {
  const all = await prisma.wikiSection.findMany({ orderBy: { sortOrder: "asc" } });
  const byId = new Map(all.map((s) => [s.id, s]));
  function chain(id: string, pick: (s: (typeof all)[number]) => string): string[] {
    const out: string[] = [];
    let cur = byId.get(id);
    while (cur) {
      out.unshift(pick(cur));
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return out;
  }
  return all.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    chain: chain(s.id, (x) => x.name),
    slugChain: chain(s.id, (x) => x.slug),
    label: chain(s.id, (x) => x.name).join(" / ") || s.name,
  }));
}

export type ResolvedTarget =
  | { kind: "page"; page: NonNullable<Awaited<ReturnType<typeof findPageByPath>>>; sectionSlugs: string[] }
  | { kind: "section"; sectionId: string; sectionSlugs: string[] }
  | null;

async function findPageByPath(sectionId: string, slug: string) {
  return prisma.wikiPage.findUnique({
    where: { sectionId_slug: { sectionId, slug } },
    include: {
      section: true,
      currentVersion: true,
      publishedBy: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
}

/**
 * Resolves /docs/<section...>/<page?> slugs against the tree.
 * Walks sections by slug; the final slug may be a page inside the last section.
 */
export async function resolvePath(slugs: string[]): Promise<ResolvedTarget> {
  const roots = await prisma.wikiSection.findMany({
    where: { parentId: null },
    select: { id: true, slug: true },
  });
  const first = roots.find((r) => r.slug === slugs[0]);
  if (!first) return null;

  let sectionId = first.id;
  let sectionSlugs = [first.slug];
  let i = 1;
  // Walk nested sections while slugs remain
  for (; i < slugs.length; i++) {
    const child = await prisma.wikiSection.findFirst({
      where: { parentId: sectionId, slug: slugs[i] },
      select: { id: true, slug: true },
    });
    if (!child) break;
    sectionId = child.id;
    sectionSlugs.push(child.slug);
  }
  if (i === slugs.length) {
    // Whole path was sections — a section index
    return { kind: "section", sectionId, sectionSlugs };
  }
  // remaining slugs: the page slug must be the last one (path too deep → not found)
  if (i !== slugs.length - 1) return null;
  const page = await findPageByPath(sectionId, slugs[i]);
  if (!page) return null;
  return { kind: "page", page, sectionSlugs };
}

/**
 * Line-level multiset diff between two markdown snapshots.
 * Returns the lines added to `next` and the lines removed from `prev`
 * (order-preserving). Used by the per-page activity view — admin only.
 */
export function diffLines(prev: string, next: string): { added: string[]; removed: string[] } {
  const a = prev.split(/\r?\n/);
  const b = next.split(/\r?\n/);
  const countA = new Map<string, number>();
  const countB = new Map<string, number>();
  for (const l of a) countA.set(l, (countA.get(l) ?? 0) + 1);
  for (const l of b) countB.set(l, (countB.get(l) ?? 0) + 1);

  const added: string[] = [];
  const removed: string[] = [];
  for (const l of b) {
    const c = countA.get(l) ?? 0;
    if (c > 0) countA.set(l, c - 1);
    else added.push(l);
  }
  for (const l of a) {
    const c = countB.get(l) ?? 0;
    if (c > 0) countB.set(l, c - 1);
    else removed.push(l);
  }
  return { added, removed };
}
