import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
import { flags } from "../../../lib/flags";
import {
  attachmentObjectKey,
  isAttachmentKey,
  putObject,
  signedGetUrl,
} from "../../../lib/r2";
import { readSessionToken, SESSION_COOKIE } from "../../../lib/session";

async function allow(request: NextRequest) {
  if (!flags.private) return true;
  return Boolean(
    await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value),
  );
}

export async function GET(request: NextRequest) {
  if (!(await allow(request))) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const key = request.nextUrl.searchParams.get("key") ?? "";
  const name = request.nextUrl.searchParams.get("name") ?? "download";
  if (!isAttachmentKey(key)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const url = await signedGetUrl(key, name);
  if (!url) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.redirect(url, { status: 302 });
}

export async function POST(request: NextRequest) {
  if (!(await allow(request))) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const form = await request.formData();
  const file = form.get("file");
  const keyValue = String(form.get("key") ?? "");
  const orgId = String(form.get("orgId") ?? "");
  const iso = String(form.get("iso") ?? "");
  const rowId = String(form.get("rowId") ?? "");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const key =
    keyValue && isAttachmentKey(keyValue)
      ? keyValue
      : attachmentObjectKey(orgId, iso, rowId, file.name);
  if (!isAttachmentKey(key)) {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const wrote = await putObject(
    key,
    bytes,
    file.type || "application/octet-stream",
  );
  if (!wrote) {
    return NextResponse.json({ error: "Could not upload." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, key, name: file.name });
}
