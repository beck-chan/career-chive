"use server";

import { requireSession } from "../../lib/session";
import {
  attachmentObjectKey,
  isAttachmentKey,
  isR2Configured,
  putObject,
  r2DashboardObjectUrl,
  signedPutUrl,
} from "../../lib/r2";

export async function createAttachmentUpload(input: {
  orgId: string;
  iso: string;
  rowId: string;
  filename: string;
  contentType: string;
}): Promise<
  | { ok: true; url: string; key: string }
  | { ok: false; error: string; unconfigured?: boolean }
> {
  await requireSession();
  if (!isR2Configured()) {
    return { ok: false, error: "Uploads are not configured.", unconfigured: true };
  }
  const key = attachmentObjectKey(
    input.orgId,
    input.iso,
    input.rowId,
    input.filename,
  );
  const url = await signedPutUrl(
    key,
    input.contentType || "application/octet-stream",
  );
  if (!url) {
    return { ok: false, error: "Uploads are not configured.", unconfigured: true };
  }
  return { ok: true, url, key };
}

export async function uploadAttachmentBytes(formData: FormData): Promise<
  | { ok: true; key: string; name: string }
  | { ok: false; error: string; unconfigured?: boolean }
> {
  await requireSession();
  if (!isR2Configured()) {
    return { ok: false, error: "Uploads are not configured.", unconfigured: true };
  }
  const file = formData.get("file");
  const keyValue = String(formData.get("key") ?? "");
  if (!(file instanceof File) || !isAttachmentKey(keyValue)) {
    return { ok: false, error: "Invalid upload." };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const wrote = await putObject(
    keyValue,
    bytes,
    file.type || "application/octet-stream",
  );
  if (!wrote) {
    return { ok: false, error: "Could not upload attachment." };
  }
  return { ok: true, key: keyValue, name: file.name };
}

export async function attachmentDashboardUrls(keys: string[]) {
  await requireSession();
  const urls: Record<string, string> = {};
  for (const key of keys) {
    if (!isAttachmentKey(key) || urls[key]) continue;
    const href = r2DashboardObjectUrl(key);
    if (href) urls[key] = href;
  }
  return urls;
}
