import { createHash } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { API_ORGANIZATION_ID, getAdminApp } from "./apiAuth.js";

const dbDefault = () => getFirestore(getAdminApp());
const bucketDefault = () => getStorage(getAdminApp()).bucket(process.env.FIREBASE_STORAGE_BUCKET);
const managedPath = /^organizations\/([^/]+)\/projects\/([^/]+)\/documents\/([^/]+)\/versions\/([^/]+)\/([^/]+)$/;
const checksum = (buffer) => createHash("sha256").update(buffer).digest("hex");

export class StorageIntegrityError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }

export async function scanStorageIntegrity({ cursor, metadataCursor, pageSize = 50, verifyChecksums = true } = {}, { database = dbDefault(), bucket = bucketDefault() } = {}) {
  const boundedSize = Math.max(1, Math.min(Number(pageSize) || 50, 100));
  const [files, , response] = await bucket.getFiles({ prefix: `organizations/${API_ORGANIZATION_ID}/projects/`, maxResults: boundedSize, ...(cursor ? { pageToken: cursor } : {}) });
  const findings = { metadataMissingObjects: [], objectsWithoutMetadata: [], duplicateVersionPaths: [], incorrectObjectPaths: [], checksumMismatch: [], purgedRecordObjects: [], failedUploadLeftovers: [], failedPurgeLeftovers: [] };
  const seenVersionPaths = new Map();

  for (const file of files) {
    const match = file.name.match(managedPath);
    if (!match || match[1] !== API_ORGANIZATION_ID) { findings.incorrectObjectPaths.push({ storagePath: file.name }); continue; }
    const [, , projectId, documentId, versionId] = match;
    const versions = await database.collectionGroup("versions").where("storagePath", "==", file.name).limit(2).get();
    if (versions.empty) findings.objectsWithoutMetadata.push({ storagePath: file.name });
    if (versions.size > 1) findings.duplicateVersionPaths.push({ storagePath: file.name, metadataPaths: versions.docs.map((item) => item.ref.path).sort() });
    const key = `${projectId}/${documentId}/${versionId}`;
    if (seenVersionPaths.has(key)) findings.duplicateVersionPaths.push({ storagePath: file.name, duplicateOf: seenVersionPaths.get(key) }); else seenVersionPaths.set(key, file.name);
    const document = await database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${projectId}/documents/${documentId}`).get();
    if (!document.exists || document.data().lifecycle?.state === "purged") findings.purgedRecordObjects.push({ storagePath: file.name, projectId, documentId });
    const [metadata] = await file.getMetadata();
    if (metadata.metadata?.uploadState === "failed") findings.failedUploadLeftovers.push({ storagePath: file.name });
    if (metadata.metadata?.purgeState === "failed") findings.failedPurgeLeftovers.push({ storagePath: file.name });
    const version = versions.docs[0]?.data();
    if (verifyChecksums && version?.checksumSha256) { const [buffer] = await file.download(); if (checksum(buffer) !== version.checksumSha256) findings.checksumMismatch.push({ storagePath: file.name, versionId }); }
  }

  let metadataQuery = database.collectionGroup("versions").orderBy("storagePath");
  if (metadataCursor) metadataQuery = metadataQuery.startAfter(metadataCursor);
  const metadata = await metadataQuery.limit(boundedSize).get();
  const counts = new Map();
  for (const version of metadata.docs) {
    const data = version.data(); if (typeof data.storagePath !== "string") continue;
    counts.set(data.storagePath, (counts.get(data.storagePath) ?? 0) + 1);
    const [exists] = await bucket.file(data.storagePath).exists(); if (!exists) findings.metadataMissingObjects.push({ metadataPath: version.ref.path, storagePath: data.storagePath });
  }
  for (const [storagePath, count] of counts) if (count > 1) findings.duplicateVersionPaths.push({ storagePath, metadataCount: count });

  const nextMetadataCursor = metadata.size === boundedSize ? metadata.docs.at(-1)?.data().storagePath ?? null : null;
  return { dryRun: true, cursor: response?.nextPageToken ?? null, metadataCursor: nextMetadataCursor, scannedObjects: files.length, scannedMetadata: metadata.size, pageSize: boundedSize, findings, destructiveRepairPerformed: false };
}

export const isManagedStoragePath = (path) => managedPath.test(path);
