"use client";

import { useEffect, useRef, useState } from "react";
import { apiPath } from "sanapp-common-ui";

export type TreeNode = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  pages: { id: string; slug: string; title: string; status: string }[];
  children: TreeNode[];
};

function collectSectionDetails(root: HTMLElement | null): HTMLDetailsElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLDetailsElement>("details.wiki-tree-details"));
}

function SectionNode({ node, path, depth }: { node: TreeNode; path: string[]; depth: number }) {
  const sectionHref = apiPath(`/docs/${[...path, node.slug].join("/")}`);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(depth < 2);
  const isEmpty = node.pages.length === 0 && node.children.length === 0;

  return (
    <div className="wiki-tree-section">
      <details
        className="wiki-tree-details"
        open={open}
        ref={detailsRef}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      >
        <summary>
          <button
            type="button"
            className="wiki-tree-toggle"
            aria-expanded={open}
            aria-label={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            title={open ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const d = detailsRef.current;
              if (d) {
                d.open = !d.open;
                setOpen(d.open);
              }
            }}
          >
            {open ? "−" : "+"}
          </button>
          <a href={sectionHref}>{node.name}</a>
          {isEmpty && <span className="wiki-tree-count" title="Empty section">0</span>}
        </summary>
        <div className="wiki-tree-body">
          {node.pages.map((p) => (
            <a
              key={p.id}
              className="wiki-tree-page"
              href={apiPath(`/docs/${[...path, node.slug, p.slug].join("/")}`)}
            >
              {p.title}
              {p.status === "DRAFT" && <span className="wiki-draft-badge">draft</span>}
            </a>
          ))}
          {node.children.map((c) => (
            <SectionNode key={c.id} node={c} path={[...path, node.slug]} depth={depth + 1} />
          ))}
        </div>
      </details>
    </div>
  );
}

export function TreeNav({ tree }: { tree: TreeNode[] }) {
  const navRef = useRef<HTMLElement | null>(null);

  function setAll(open: boolean) {
    const root = navRef.current;
    for (const d of collectSectionDetails(root)) d.open = open;
  }

  if (tree.length === 0) {
    return <p className="wiki-tree-empty">No sections yet.</p>;
  }
  return (
    <nav className="wiki-tree" aria-label="Wiki sections" ref={navRef}>
      <div className="wiki-tree-head">
        <a className="wiki-tree-root" href={apiPath("/")}>
          Wiki Docs
        </a>
        <div className="wiki-tree-actions" role="group" aria-label="Expand or collapse all sections">
          <button
            type="button"
            className="wiki-tree-act"
            title="Expand all sections"
            aria-label="Expand all sections"
            onClick={() => setAll(true)}
          >
            ＋
          </button>
          <button
            type="button"
            className="wiki-tree-act"
            title="Collapse all sections"
            aria-label="Collapse all sections"
            onClick={() => setAll(false)}
          >
            −
          </button>
        </div>
      </div>
      {tree.map((n) => (
        <SectionNode key={n.id} node={n} path={[]} depth={0} />
      ))}
    </nav>
  );
}
