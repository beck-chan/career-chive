import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function r2Config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "";
  const bucket = process.env.R2_BUCKET?.trim() || "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() || "";
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    (accountId
      ? `https://${accountId}.r2.cloudflarestorage.com`
      : "");
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) return null;
  return { bucket, accessKeyId, secretAccessKey, endpoint };
}

export function isR2Configured() {
  return Boolean(r2Config());
}

function r2Client() {
  const config = r2Config();
  if (!config) return null;
  return {
    bucket: config.bucket,
    client: new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
}

export function attachmentObjectKey(
  orgId: string,
  iso: string,
  rowId: string,
  filename: string,
) {
  const safe = filename.replace(/[/\\]/g, "_").replace(/^\.+/, "") || "file";
  return `citations/${orgId}/${iso}/${rowId}/${safe}`;
}

export function isAttachmentKey(key: string) {
  return key.startsWith("citations/") && !key.includes("..");
}

export function r2DashboardObjectUrl(key: string) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || "";
  const bucket = process.env.R2_BUCKET?.trim() || "";
  if (!accountId || !bucket || !isAttachmentKey(key)) return "";
  const objectPath = key
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://dash.cloudflare.com/${accountId}/r2/default/buckets/${encodeURIComponent(bucket)}/objects/${objectPath}/details`;
}

export async function signedPutUrl(key: string, contentType: string) {
  const r2 = r2Client();
  if (!r2) return null;
  return getSignedUrl(
    r2.client,
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    }),
    { expiresIn: 60 * 5 },
  );
}

export async function signedGetUrl(key: string, filename: string) {
  const r2 = r2Client();
  if (!r2) return null;
  const safeName = filename.replace(/["\r\n]/g, "_") || "download";
  return getSignedUrl(
    r2.client,
    new GetObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${safeName}"`,
    }),
    { expiresIn: 60 },
  );
}

export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
) {
  const r2 = r2Client();
  if (!r2) return false;
  await r2.client.send(
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    }),
  );
  return true;
}

export async function deleteObject(key: string) {
  const r2 = r2Client();
  if (!r2 || !isAttachmentKey(key)) return;
  try {
    await r2.client.send(
      new DeleteObjectCommand({
        Bucket: r2.bucket,
        Key: key,
      }),
    );
  } catch {
    /* ignore missing objects */
  }
}
