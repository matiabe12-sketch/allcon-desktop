import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";
import { devStoragePath, signedReadUrl, signedWriteUrl } from "@/lib/storage";
import { APS_BASE, getInternalToken } from "./auth";

// Desktop (ALLCON_LOCAL=1): no Autodesk bucket. Objects live in local file storage under
// "oss/", and uploads go there in parts through the same signed-link flow.
const isLocal = () => process.env.ALLCON_LOCAL === "1";
const localKey = (objectKey: string) => `oss/${objectKey}`;
const partKey = (uploadKey: string, i: number) => `oss-parts/${uploadKey}/${i}`;

const local = {
  async getUploadUrls(parts: number) {
    const uploadKey = randomUUID();
    const urls = await Promise.all(
      Array.from({ length: parts }, async (_, i) => (await signedWriteUrl(partKey(uploadKey, i), { contentType: "application/octet-stream" }, 3600)).url),
    );
    return { uploadKey, urls };
  },
  async completeUpload(objectKey: string, uploadKey: string) {
    const target = devStoragePath(localKey(objectKey));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, new Uint8Array());
    for (let i = 0; ; i++) {
      const part = devStoragePath(partKey(uploadKey, i));
      const bytes = await readFile(part).catch(() => null);
      if (!bytes) break;
      await appendFile(target, bytes);
    }
    await rm(path.dirname(devStoragePath(partKey(uploadKey, 0))), { recursive: true, force: true });
    return { objectId: objectKey, size: (await stat(target)).size };
  },
  async getDownloadUrl(objectKey: string, minutes: number) {
    const { size } = await stat(devStoragePath(localKey(objectKey)));
    return { url: await signedReadUrl(localKey(objectKey), { ttl: minutes * 60 }), size };
  },
  async uploadBuffer(objectKey: string, body: Uint8Array) {
    const target = devStoragePath(localKey(objectKey));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
    return { objectId: objectKey, size: body.length };
  },
  downloadBuffer: async (objectKey: string) => new Uint8Array(await readFile(devStoragePath(localKey(objectKey)))),
  deleteObject: async (objectKey: string) => rm(devStoragePath(localKey(objectKey)), { force: true }),
};

const OSS = `${APS_BASE}/oss/v2`;

// OSS allows up to 25 signed part URLs per request; 64 MB parts cover files up to 1.6 GB.
export const PART_SIZE = 64 * 1024 * 1024;
export const MAX_PARTS = 25;
export const MAX_FILE_SIZE = PART_SIZE * MAX_PARTS;

async function authHeaders() {
  return { Authorization: `Bearer ${await getInternalToken()}` };
}

let bucketReady = false;

export async function ensureBucket() {
  if (bucketReady) return;
  const res = await fetch(`${OSS}/buckets`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ bucketKey: env().APS_BUCKET_KEY, policyKey: "persistent" }),
  });
  // 409 = bucket already exists (and is ours, otherwise creation would be refused with 403).
  if (!res.ok && res.status !== 409) {
    throw new Error(`Could not create OSS bucket (${res.status}): ${await res.text()}`);
  }
  bucketReady = true;
}

function objectUrl(objectKey: string) {
  return `${OSS}/buckets/${env().APS_BUCKET_KEY}/objects/${encodeURIComponent(objectKey)}/signeds3upload`;
}

/** Signed S3 URLs the browser PUTs file parts to directly. */
export async function getUploadUrls(objectKey: string, parts: number) {
  if (isLocal()) return local.getUploadUrls(parts);
  await ensureBucket();
  const res = await fetch(`${objectUrl(objectKey)}?parts=${parts}&minutesExpiration=60`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Could not get upload URLs (${res.status}): ${await res.text()}`);
  const data: { uploadKey: string; urls: string[] } = await res.json();
  return data;
}

export async function completeUpload(objectKey: string, uploadKey: string) {
  if (isLocal()) return local.completeUpload(objectKey, uploadKey);
  const res = await fetch(objectUrl(objectKey), {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ uploadKey }),
  });
  if (!res.ok) throw new Error(`Could not complete upload (${res.status}): ${await res.text()}`);
  const data: { objectId: string; size: number } = await res.json();
  return data;
}

/** Derivative URN: URL-safe base64 of the OSS objectId, without padding. */
export function toUrn(objectId: string) {
  return Buffer.from(objectId).toString("base64url");
}

/** Short-lived direct download URL; S3 honours Range requests, which the PDF viewer relies on. */
export async function getDownloadUrl(objectKey: string, minutes = 60) {
  if (isLocal()) return local.getDownloadUrl(objectKey, minutes);
  const res = await fetch(
    `${OSS}/buckets/${env().APS_BUCKET_KEY}/objects/${encodeURIComponent(objectKey)}/signeds3download?minutesExpiration=${minutes}`,
    { headers: await authHeaders(), cache: "no-store" },
  );
  if (!res.ok) throw new Error(`Could not get download URL (${res.status}): ${await res.text()}`);
  const data: { url: string; size: number } = await res.json();
  return data;
}

/** Uploads a small server-side buffer (e.g. a compressed JSON dump) in a single part. */
export async function uploadBuffer(objectKey: string, body: Uint8Array) {
  if (isLocal()) return local.uploadBuffer(objectKey, body);
  const { uploadKey, urls } = await getUploadUrls(objectKey, 1);
  const put = await fetch(urls[0], { method: "PUT", body: body as BodyInit });
  if (!put.ok) throw new Error(`Could not upload ${objectKey} (${put.status})`);
  return completeUpload(objectKey, uploadKey);
}

/** Downloads a whole object into memory; for small files only. */
export async function downloadBuffer(objectKey: string) {
  if (isLocal()) return local.downloadBuffer(objectKey);
  const { url } = await getDownloadUrl(objectKey, 5);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Could not download ${objectKey} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function deleteObject(objectKey: string) {
  if (isLocal()) return void (await local.deleteObject(objectKey));
  const res = await fetch(`${OSS}/buckets/${env().APS_BUCKET_KEY}/objects/${encodeURIComponent(objectKey)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok && res.status !== 404) throw new Error(`Could not delete ${objectKey} (${res.status})`);
}
