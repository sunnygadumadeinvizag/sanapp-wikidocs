"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiPath } from "sanapp-common-ui";

function basepathHref(href: string | undefined): string | undefined {
  if (!href) return href;
  // Root-relative links (including /api/files/…) must carry the basePath so
  // they resolve under /wikidocs in production. Leave external // and http(s) alone.
  if (href.startsWith("/") && !href.startsWith("//")) {
    return apiPath(href);
  }
  return href;
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="wiki-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            return (
              <a href={basepathHref(href)} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                {children}
              </a>
            );
          },
          img({ src, alt }) {
            const raw = typeof src === "string" ? src : undefined;
            const url = raw && raw.startsWith("/") && !raw.startsWith("//") ? apiPath(raw) : raw;
            return <img src={url} alt={alt ?? ""} loading="lazy" />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
