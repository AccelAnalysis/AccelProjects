import { createHash, randomUUID } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { API_ORGANIZATION_ID, getAdminApp } from "./apiAuth.js";

export const maxDocumentBytes = 10 * 1024 * 1024;
const allowedTypes = new Set(["application/pdf", "image/png", "image/jpeg", "text/plain", "text/csv", "application/json", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation"]);

export class DocumentServiceError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
const dbDefault = () => getFirestore(getAdminApp());
const bucketDefault = () => getStorage(getAdminApp()).bucket(process.env.FIREBASE_STORAGE_BUCKET);
export const sanitizeFilename = (name) => name.normalize("NFKC").replaceAll(/[^a-zA-Z0-9._-]/g, "_").replaceAll(/_+/g, "_").replace(/^\.+/, "").slice(0, 120) || "file";
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

function decodeFile(input) {
  if (!input || typeof input.base64 !== "string" || typeof input.filename !== "string" || !allowedTypes.has(input.contentType)) throw new DocumentServiceError("unsupported_file");
  const buffer = Buffer.from(input.base64, "base64");
  if (!buffer.length || buffer.length > maxDocumentBytes) throw new DocumentServiceError("file_size_invalid", 413);
  if (input.contentType === "application/pdf" && buffer.subarray(0, 5).toString() !== "%PDF-") throw new DocumentServiceError("content_signature_mismatch");
  if (input.contentType === "image/png" && buffer.subarray(1, 4).toString() !== "PNG") throw new DocumentServiceError("content_signature_mismatch");
  if (input.contentType === "image/jpeg" && !(buffer[0] === 0xff && buffer[1] === 0xd8)) throw new DocumentServiceError("content_signature_mismatch");
  return buffer;
}

function refs(database, projectId, documentId) {
  const document = database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${projectId}/documents/${documentId}`);
  return { document, versions: document.collection("versions") };
}

export async function uploadDocument(projectId, actor, input, { database = dbDefault(), bucket = bucketDefault(), now = new Date() } = {}) {
  const buffer = decodeFile(input.file); const documentId = `document_${randomUUID().replaceAll("-", "").slice(0, 16)}`; const versionId = `version_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  return persistVersion({ projectId, documentId, versionId, actor, input, buffer, create: true, database, bucket, now });
}

export async function replaceDocumentVersion(projectId, documentId, actor, input, { database = dbDefault(), bucket = bucketDefault(), now = new Date() } = {}) {
  const existing = await refs(database, projectId, documentId).document.get();
  if (!existing.exists) throw new DocumentServiceError("document_not_found", 404);
  if (existing.data().locked || ["report_artifact", "contract", "billing"].includes(existing.data().category)) throw new DocumentServiceError("protected_document_locked", 409);
  const buffer = decodeFile(input.file); const versionId = `version_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  return persistVersion({ projectId, documentId, versionId, actor, input: { ...existing.data(), ...input }, buffer, create: false, database, bucket, now });
}

async function persistVersion({ projectId, documentId, versionId, actor, input, buffer, create, database, bucket, now }) {
  const filename = sanitizeFilename(input.file.filename); const path = `organizations/${API_ORGANIZATION_ID}/projects/${projectId}/documents/${documentId}/versions/${versionId}/${filename}`; const checksum = sha256(buffer); const timestamp = now.toISOString(); const file = bucket.file(path);
  await file.save(buffer, { resumable: false, contentType: input.file.contentType, metadata: { cacheControl: "private, max-age=0", metadata: { organizationId: API_ORGANIZATION_ID, projectId, documentId, versionId, checksumSha256: checksum } } });
  const version = { id: versionId, organizationId: API_ORGANIZATION_ID, projectId, documentId, storagePath: path, contentType: input.file.contentType, originalFilename: input.file.filename.slice(0, 240), sanitizedFilename: filename, sizeBytes: buffer.length, checksumSha256: checksum, createdAt: timestamp, createdBy: actor.uid };
  const document = { id: documentId, projectId, title: String(input.title || input.file.filename).trim().slice(0, 200), type: input.type || "other", category: input.category || "general", url: "", currentVersionId: versionId, ownerId: input.ownerId || actor.uid, visibility: input.visibility === "client_visible" ? "client_visible" : "internal", storageProvider: "firebase_storage", managed: true, contentType: version.contentType, originalFilename: version.originalFilename, sizeBytes: version.sizeBytes, checksumSha256: checksum, createdAt: create ? timestamp : input.createdAt, updatedAt: timestamp, updatedBy: actor.uid, retentionClass: input.category === "contract" || input.category === "billing" ? "contract_billing" : "ordinary_project", locked: false };
  try {
    await database.runTransaction(async (transaction) => { const { document: documentRef, versions } = refs(database, projectId, documentId); if (create) transaction.create(documentRef, document); else transaction.update(documentRef, document); transaction.create(versions.doc(versionId), version); });
    return { document, version };
  } catch (error) { await file.delete({ ignoreNotFound: true }).catch(() => undefined); throw error; }
}

export async function listDocumentVersions(projectId, documentId, { database = dbDefault() } = {}) { const snapshot = await refs(database, projectId, documentId).versions.orderBy("createdAt", "desc").get(); return snapshot.docs.map((doc) => doc.data()); }
export async function downloadDocumentVersion(projectId, documentId, versionId, { database = dbDefault(), bucket = bucketDefault() } = {}) { const version = await refs(database, projectId, documentId).versions.doc(versionId).get(); if (!version.exists) throw new DocumentServiceError("document_version_not_found", 404); const [buffer] = await bucket.file(version.data().storagePath).download(); if (sha256(buffer) !== version.data().checksumSha256) throw new DocumentServiceError("document_checksum_mismatch", 409); return { buffer, version: version.data() }; }

export async function deleteManagedDocumentObjects(projectId, documentId, { database = dbDefault(), bucket = bucketDefault() } = {}) { const versions = await listDocumentVersions(projectId, documentId, { database }); const results = []; for (const version of versions) { try { await bucket.file(version.storagePath).delete({ ignoreNotFound: true }); results.push({ versionId: version.id, deleted: true }); } catch (error) { results.push({ versionId: version.id, deleted: false, error: "storage_delete_failed" }); } } return results; }
