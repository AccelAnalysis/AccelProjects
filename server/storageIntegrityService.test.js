import { describe, expect, it } from "vitest";
import { isManagedStoragePath } from "./storageIntegrityService.js";

describe("Storage integrity diagnostics", () => {
  it("accepts only deterministic managed version paths", () => {
    expect(isManagedStoragePath("organizations/org_accel_projects/projects/p/documents/d/versions/v/file.pdf")).toBe(true);
    expect(isManagedStoragePath("organizations/org_accel_projects/projects/p/documents/d/file.pdf")).toBe(false);
    expect(isManagedStoragePath("failed-upload/file.pdf")).toBe(false);
  });
});
