import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./index.js";

describe("lifecycle API authentication", () => {
  it("rejects unauthenticated impact previews and actions", async () => {
    const preview = await request(app).post("/api/projects/project_1/lifecycle/task/task_1/impact").send({ action: "trash", expectedProjectRevision: 1, idempotencyKey: "test", reason: { code: "duplicate" } });
    const apply = await request(app).post("/api/projects/project_1/lifecycle/task/task_1/actions").send({ action: "trash", expectedProjectRevision: 1, idempotencyKey: "test", previewToken: "x", reason: { code: "duplicate" } });
    expect(preview.status).toBe(401);
    expect(apply.status).toBe(401);
    expect(preview.body.error).toBe("Missing Firebase bearer token");
  });
});
