import { describe, expect, it } from "vitest";
import {
  buildSnapshotContent,
  normalizeReportDraftInput,
  renderReportPdfBuffer,
  sanitizeFilenameSegment,
  sha256Hex,
  stableStringify
  ,withdrawReportFromReview
  ,voidApprovedReport
} from "./projectReportService.js";

describe("client progress report service helpers", () => {
  it("normalizes report drafts and rejects missing approval inputs", () => {
    expect(() => normalizeReportDraftInput({ title: "", reportingPeriodStart: "2026-07-01", reportingPeriodEnd: "2026-07-10" }))
      .toThrow("Report title is required");
    expect(() => normalizeReportDraftInput({ title: "Report", reportingPeriodStart: "2026-07-10", reportingPeriodEnd: "2026-07-01" }))
      .toThrow("Report period end must be on or after the start");

    const draft = normalizeReportDraftInput({
      title: "Weekly Report",
      reportingPeriodStart: "2026-07-01",
      reportingPeriodEnd: "2026-07-10",
      highlights: ["Done"],
      includeInternalNotes: true
    });

    expect(draft.includeInternalNotes).toBe(false);
    expect(draft.highlights).toEqual(["Done"]);
  });

  it("creates stable hashes independent of object key order", () => {
    expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
    expect(sha256Hex({ b: 2, a: 1 })).toBe(sha256Hex({ a: 1, b: 2 }));
  });

  it("builds immutable snapshot content and renderable PDF bytes", async () => {
    const report = {
      id: "report_1",
      title: "Client Progress",
      reportingPeriodStart: "2026-07-01",
      reportingPeriodEnd: "2026-07-10",
      executiveSummary: "Executive summary",
      progressSummary: "Progress summary",
      nextSteps: "Next steps",
      clientActions: ["Approve scope"],
      highlights: ["Launched"],
      risks: [],
      milestones: [],
      completedTasks: [{ id: "task_1", title: "Complete setup", status: "Done", dueDate: "2026-07-03", owner: "Owner" }],
      upcomingTasks: []
    };
    const content = buildSnapshotContent({
      report,
      project: { id: "project_1", name: "Project", status: "active", health: "on_track", startDate: "2026-07-01", targetDate: "2026-08-01", revision: 4 },
      client: { id: "client_1", name: "Client", contactName: "Client Contact", email: "client@example.com" },
      actor: { uid: "owner_pm" },
      approvedAt: "2026-07-10T00:00:00.000Z"
    });
    const snapshot = {
      id: "snapshot_1",
      ...content,
      contentHash: sha256Hex(content),
      approvedAt: "2026-07-10T00:00:00.000Z"
    };
    const pdf = await renderReportPdfBuffer(snapshot);

    expect(content.project.revision).toBe(4);
    expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(sanitizeFilenameSegment("Project: Client / Weekly")).toBe("Project-Client-Weekly");
  });
});

function reportDatabase(report) {
  const writes = [];
  const makeRef = (path) => ({ path, id: path.split("/").at(-1), get: async () => ({ exists: true, id: report.id, data: () => report }), update: async (value) => writes.push({ type: "update", path, value }), collection: (name) => ({ doc: (id) => makeRef(`${path}/${name}/${id}`) }) });
  return { writes, doc: makeRef, runTransaction: async (callback) => callback({ get: async (target) => target.get(), update: (target, value) => writes.push({ type: "update", path: target.path, value }), set: (target, value) => writes.push({ type: "set", path: target.path, value }) }) };
}

describe("report lifecycle transitions", () => {
  it("withdraws submitted reports without touching approved snapshots", async () => { const database = reportDatabase({ id: "report_1", status: "ready_for_review", submittedAt: "x", submittedBy: "owner" }); const result = await withdrawReportFromReview("project_1", "report_1", { uid: "owner" }, { database }); expect(result.status).toBe("draft"); expect(result.submittedAt).toBeNull(); expect(database.writes.some((write) => write.value.type === "client_report_withdrawn")).toBe(true); });
  it("voids approved reports while retaining the immutable snapshot reference", async () => { const database = reportDatabase({ id: "report_1", status: "approved", latestApprovedSnapshotId: "snapshot_1" }); const result = await voidApprovedReport("project_1", "report_1", { uid: "owner" }, "Incorrect period", { database }); expect(result.status).toBe("voided"); expect(result.latestApprovedSnapshotId).toBe("snapshot_1"); expect(database.writes.some((write) => write.value.type === "client_report_voided" && write.value.metadata.snapshotId === "snapshot_1")).toBe(true); });
});
