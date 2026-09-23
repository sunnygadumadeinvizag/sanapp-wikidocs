import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import { verifyAppSession } from "@/lib/session";
import { getPolicy, canPublish } from "@/lib/wiki";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_MD_BYTES = 1 * 1024 * 1024;
/** Mirror of the editor's textual-file list: prose and code/config files. */
const TEXT_FILE_RE =
  /\.(txt|csv|tsv|json|ya?ml|toml|ini|cfg|conf|env|log|html?|css|scss|jsx?|tsx?|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|bash|zsh|ps1|psm1|bat|cmd|sql|r|pl|lua|scala|xml|diff|patch|md|markdown)$/i;

export async function POST(request: NextRequest) {
  const store = await cookies();
  const session = store.get("wikidocs_session")?.value ?? "";
  const me = await verifyAppSession(session);
  if (!me) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const policy = await getPolicy();
  if (!canPublish(me, policy)) {
    return NextResponse.json({ error: "not_allowed" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }

  const mime = file.type || "application/octet-stream";
  const isImage = IMAGE_TYPES.includes(mime);
  const isMarkdown = mime === "text/markdown" || /\.mdx?$/i.test(file.name);
  // Any textual file (Markdown, txt, code, CSV, config…) can be stored too —
  // the editor merges prose and fences code, mirroring client-side rules.
  const isTextual = mime.startsWith("text/") || TEXT_FILE_RE.test(file.name);
  if (!isImage && !isTextual) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }
  const max = isImage ? MAX_IMAGE_BYTES : MAX_MD_BYTES;
  if (file.size > max) {
    return NextResponse.json(
      { error: `File too large — ${isImage ? "images" : "text files"} limited to ${Math.floor(max / 1024 / 1024)} MB` },
      { status: 400 }
    );
  }

  const ext = isMarkdown
    ? ".md"
    : mime === "image/svg+xml"
      ? ".svg"
      : file.name.includes(".")
        ? `.${(file.name.split(".").pop() ?? "txt").toLowerCase().slice(0, 8)}`
        : ".txt";
  const storedName = `${crypto.randomUUID()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, storedName), bytes);

  const pageId = typeof form.get("pageId") === "string" ? (form.get("pageId") as string) : null;
  // uploadedById FKs the LOCAL AppUser.id — the session sub is the SSO user id.
  // Resolve the local row by username (same as the pages/sections routes);
  // the column is nullable, so a missing local row stores null instead of 500ing.
  const localUser = await prisma.appUser.findUnique({ where: { username: me.username } });
  const asset = await prisma.wikiAsset.create({
    data: {
      filename: file.name,
      storedName,
      mime,
      size: file.size,
      pageId,
      uploadedById: localUser?.id ?? null,
    },
  });

  await audit({
    actorUsername: me.username,
    actorName: me.name,
    action: "UPLOAD",
    targetType: "ASSET",
    targetId: asset.id,
    details: { filename: file.name, mime, size: file.size },
  });

  return NextResponse.json({
    asset: { id: asset.id, filename: file.name, url: `/api/files/${storedName}`, mime },
  });
}
