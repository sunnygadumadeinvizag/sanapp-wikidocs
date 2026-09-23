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
const MAX_TEXT_BYTES = 1 * 1024 * 1024;
/** PDFs and other binary attachments (docx, xlsx, zip, …). */
const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Mirror of the editor's textual-file list: prose and code/config files. */
const TEXT_FILE_RE =
  /\.(txt|csv|tsv|json|ya?ml|toml|ini|cfg|conf|env|log|html?|css|scss|jsx?|tsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|php|sh|bash|zsh|ps1|psm1|bat|cmd|sql|r|pl|lua|scala|xml|diff|patch|md|markdown)$/i;
/** Never store these with a live extension — they are served as octet-stream anyway. */
const BLOCKED_EXT = /\.(exe|dll|so|dylib|bat|cmd|com|scr|msi|jsp|php|asp|aspx|cgi|pl)$/i;

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
  const isImage = IMAGE_TYPES.includes(mime) || /^image\//.test(mime);
  const isMarkdown = mime === "text/markdown" || /\.mdx?$/i.test(file.name);
  const isTextual = mime.startsWith("text/") || TEXT_FILE_RE.test(file.name);
  const isAttachment = !isImage && !isTextual; // pdf, docx, xlsx, zip, …

  if (BLOCKED_EXT.test(file.name)) {
    return NextResponse.json({ error: "blocked_type" }, { status: 400 });
  }

  const max = isImage ? MAX_IMAGE_BYTES : isTextual || isMarkdown ? MAX_TEXT_BYTES : MAX_FILE_BYTES;
  if (file.size > max) {
    const mb = Math.floor(max / 1024 / 1024);
    return NextResponse.json(
      { error: `File too large — limited to ${mb} MB` },
      { status: 400 }
    );
  }

  const rawExt = file.name.includes(".")
    ? (file.name.split(".").pop() ?? "").toLowerCase().slice(0, 8)
    : "";
  const ext = isMarkdown
    ? ".md"
    : mime === "image/svg+xml"
      ? ".svg"
      : rawExt
        ? `.${rawExt.replace(/[^a-z0-9]/g, "")}`
        : isAttachment
          ? ".bin"
          : ".txt";
  const storedName = `${crypto.randomUUID()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, storedName), bytes);

  const pageId = typeof form.get("pageId") === "string" ? (form.get("pageId") as string) : null;
  const localUser = await prisma.appUser.findUnique({ where: { username: me.username } });
  const asset = await prisma.wikiAsset.create({
    data: {
      filename: file.name,
      storedName,
      mime: isAttachment && mime === "application/octet-stream" ? guessMime(ext) : mime,
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
    details: { filename: file.name, mime: asset.mime, size: file.size },
  });

  return NextResponse.json({
    asset: { id: asset.id, filename: file.name, url: `/api/files/${storedName}`, mime: asset.mime },
  });
}

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    zip: "application/zip",
    rar: "application/vnd.rar",
    "7z": "application/x-7z-compressed",
    txt: "text/plain",
    csv: "text/csv",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    md: "text/markdown",
  };
  return map[ext.replace(/^\./, "")] ?? "application/octet-stream";
}
