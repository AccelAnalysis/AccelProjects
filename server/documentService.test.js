import { describe, expect, it, vi } from "vitest";
import { sanitizeFilename, uploadDocument } from "./documentService.js";

function fakeStorage() { const saved = []; const deleted = []; return { saved, deleted, bucket: { file: (path) => ({ save: async (buffer, options) => saved.push({ path, buffer, options }), delete: async () => deleted.push(path) }) } }; }
function fakeDatabase({ fail = false } = {}) { const writes = []; const makeRef = (path) => ({ path, collection: (name) => ({ doc: (id) => makeRef(`${path}/${name}/${id}`) }) }); return { writes, db: { doc: makeRef, runTransaction: async (callback) => callback({ create: (ref, value) => { if (fail) throw new Error("firestore_failed"); writes.push({ ref: ref.path, value }); }, update: (ref, value) => writes.push({ ref: ref.path, value }) }) } }; }

describe("managed document service", () => {
  it("uses deterministic scoped paths, immutable versions, checksum metadata, and sanitized filenames", async () => {
    const storage = fakeStorage(); const database = fakeDatabase();
    const result = await uploadDocument("project_1", { uid: "owner_pm" }, { title: "Plan", ownerId: "owner_pm", file: { filename: "../Plan Q3?.txt", contentType: "text/plain", base64: Buffer.from("hello").toString("base64") } }, { database: database.db, bucket: storage.bucket, now: new Date("2026-07-12T00:00:00.000Z") });
    expect(sanitizeFilename("../Plan Q3?.txt")).toBe("_Plan_Q3_.txt");
    expect(result.version.storagePath).toMatch(/^organizations\/org_accel_projects\/projects\/project_1\/documents\/document_[a-f0-9]+\/versions\/version_[a-f0-9]+\/_Plan_Q3_.txt$/);
    expect(result.version.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(database.writes).toHaveLength(2);
  });

  it("rejects forged content signatures and cleans up an uploaded object after metadata failure", async () => {
    await expect(uploadDocument("project_1", { uid: "owner" }, { file: { filename: "fake.pdf", contentType: "application/pdf", base64: Buffer.from("not pdf").toString("base64") } }, { database: fakeDatabase().db, bucket: fakeStorage().bucket })).rejects.toMatchObject({ code: "content_signature_mismatch" });
    const storage = fakeStorage();
    await expect(uploadDocument("project_1", { uid: "owner" }, { file: { filename: "ok.txt", contentType: "text/plain", base64: Buffer.from("ok").toString("base64") } }, { database: fakeDatabase({ fail: true }).db, bucket: storage.bucket })).rejects.toThrow("firestore_failed");
    expect(storage.deleted).toHaveLength(1);
  });
});
