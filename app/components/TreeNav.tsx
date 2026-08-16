import { apiPath } from "sanapp-common-ui";

export type TreeNode = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  pages: { id: string; slug: string; title: string; status: string }[];
  children: TreeNode[];
};

function SectionNode({ node, path, depth }: { node: TreeNode; path: string[]; depth: number }) {
  const sectionHref = apiPath(`/docs/${[...path, node.slug].join("/")}`);
  return (
    <div className="wiki-tree-section">
      <details open={depth < 2}>
        <summary>
          <a href={sectionHref}>{node.name}</a>
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
  if (tree.length === 0) {
    return <p className="wiki-tree-empty">No sections yet.</p>;
  }
  return (
    <nav className="wiki-tree" aria-label="Wiki sections">
      <a className="wiki-tree-root" href={apiPath("/")}>
        Wiki Docs
      </a>
      {tree.map((n) => (
        <SectionNode key={n.id} node={n} path={[]} depth={0} />
      ))}
    </nav>
  );
}
