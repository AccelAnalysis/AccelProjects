import { describe, expect, it } from "vitest";
import { createPurgeJob } from "./lifecycleAdminService.js";

function databaseFor(record, existingJob = null) { const created = []; return { created, doc: (path) => ({ path, get: async () => path.includes("lifecyclePurgeJobs") ? { exists: Boolean(existingJob), data: () => existingJob } : { exists: true, data: () => record }, create: async (value) => created.push(value) }) }; }

describe("durable purge job planning", () => {
  it("blocks legal hold and unmet retention before irreversible work", async () => {
    await expect(createPurgeJob({ entityType: "document", projectId: "project_1", entityId: "document_1", idempotencyKey: "held" }, { uid: "admin" }, { database: databaseFor({ lifecycle: { legalHold: true, purgeEligibleAt: "2020-01-01T00:00:00.000Z" } }), now: new Date("2026-01-01") })).rejects.toMatchObject({ code: "legal_hold" });
    await expect(createPurgeJob({ entityType: "document", projectId: "project_1", entityId: "document_1", idempotencyKey: "early" }, { uid: "admin" }, { database: databaseFor({ lifecycle: { purgeEligibleAt: "2099-01-01T00:00:00.000Z" } }), now: new Date("2026-01-01") })).rejects.toMatchObject({ code: "retention_not_satisfied" });
  });
  it("is idempotent and discloses retained immutable copies", async () => { const existing = { id: "purge_existing", state: "planned" }; await expect(createPurgeJob({ entityType: "document", projectId: "project_1", entityId: "document_1", idempotencyKey: "same" }, { uid: "admin" }, { database: databaseFor({}, existing) })).resolves.toBe(existing); const database = databaseFor({ lifecycle: { purgeEligibleAt: "2020-01-01T00:00:00.000Z" }, managed: false }); const job = await createPurgeJob({ entityType: "document", projectId: "project_1", entityId: "document_1", idempotencyKey: "new" }, { uid: "admin" }, { database, now: new Date("2026-01-01") }); expect(job.retainedCopies).toContain("approvedReportSnapshots"); expect(job.semantics).toBe("operational_purge"); });
});
