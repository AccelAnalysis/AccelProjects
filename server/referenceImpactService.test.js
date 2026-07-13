import { describe, expect, it } from "vitest";
import { referenceContainsEntity } from "./referenceImpactService.js";

describe("historical reference impact", () => {
  it("finds nested and attachment references without substring false positives", () => {
    expect(referenceContainsEntity({ sourceId: "task_1", attachments: [{ documentId: "document_1" }] }, "task_1")).toBe(true);
    expect(referenceContainsEntity({ sourceId: "task_10" }, "task_1")).toBe(false);
    expect(referenceContainsEntity({ snapshot: { taskIds: ["task_1", "task_2"] } }, "task_1")).toBe(true);
  });
});
