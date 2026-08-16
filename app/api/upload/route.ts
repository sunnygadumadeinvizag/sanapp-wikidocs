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
  if (!isImage && !isMarkdown) {
    return NextResponse.json({ error: "unsupported_type" }, { status: 400 });
  }
  const max = isImage ? MAX_IMAGE_BYTES : MAX_MD_BYTES;
  if (file.size > max) {
    return NextResponse.json(
      { error: `File too large — ${isImage ? "images" : "markdown"} limited to ${Math.floor(max / 1024 / 1024)} MB` },
      { status: 400 }
    );
  }

  const ext = isMarkdown ? ".md" : mime === "image/svg+xml" ? ".svg" : mime.split("/")[1] || "bin";
  const storedName = `${crypto.randomUUID()}${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, storedName), bytes);

  const pageId = typeof form.get("pageId") === "string" ? (form.get("pageId") as string) : null;
  const asset = await prisma.wikiAsset.create({
    data: {
      filename: file.name,
      storedName,
      mime,
      size: file.size,
      pageId,
      uploadedById: me.sub,
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
