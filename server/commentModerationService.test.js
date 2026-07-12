import { describe, expect, it } from "vitest";
import { createControlledComment, editControlledComment, redactComment } from "./commentModerationService.js";

function ref(path) { return { path, id: path.split("/").at(-1), collection: (name) => ({ doc: (id) => ref(`${path}/${name}/${id}`) }), set: async () => undefined }; }
function databaseWith(comment) { const writes = []; return { writes, doc: (path) => ref(path), runTransaction: async (callback) => callback({ get: async () => ({ exists: true, data: () => comment }), create: (target, value) => writes.push({ type: "create", path: target.path, value }), update: (target, value) => writes.push({ type: "update", path: target.path, value }) }) }; }

describe("controlled task comments", () => {
  it("enforces the author edit window and retains an immutable revision", async () => {
    const db = databaseWith({ id: "comment_1", taskId: "task_1", authorId: "author", body: "original", visibility: "internal", createdAt: "2026-07-12T00:00:00.000Z", revision: 1 });
    const result = await editControlledComment("project_1", "task_1", "comment_1", { uid: "author" }, "edited", { database: db, now: new Date("2026-07-12T00:10:00.000Z") });
    expect(result.revision).toBe(2); expect(db.writes.some((write) => write.path.includes("/revisions/revision_1"))).toBe(true);
    await expect(editControlledComment("project_1", "task_1", "comment_1", { uid: "author" }, "late", { database: databaseWith({ ...result, createdAt: "2026-07-12T00:00:00.000Z" }), now: new Date("2026-07-12T00:16:00.000Z") })).rejects.toMatchObject({ code: "comment_edit_window_expired" });
  });

  it("redacts visible content while preserving restricted moderation history", async () => {
    const db = databaseWith({ id: "comment_1", taskId: "task_1", authorId: "author", body: "sensitive", visibility: "internal", createdAt: "2026-07-12T00:00:00.000Z" });
    const result = await redactComment("project_1", "task_1", "comment_1", { uid: "manager" }, "Sensitive data", "redacted_by_manager", { database: db, now: new Date("2026-07-12T01:00:00.000Z") });
    expect(result.body).toBe(""); expect(result.moderation.state).toBe("redacted_by_manager"); expect(db.writes.some((write) => write.path.includes("moderationHistory") && write.value.originalBody === "sensitive")).toBe(true);
  });
});
