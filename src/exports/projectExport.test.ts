import { describe, expect, it } from "vitest";
import { initialProjectState } from "../data/projectMockData";
import { createCanonicalProjectExport, hashProjectExport, stringifyCanonicalProjectExport } from "./projectExport";

describe("canonical project export", () => {
  it("exports only selected-project data with revision identity", () => {
    const projectPackage = createCanonicalProjectExport(initialProjectState, "project_hampton_workforce", "2026-07-10T12:00:00.000Z");

    expect(projectPackage).toMatchObject({
      schemaVersion: "1.2",
      packageType: "accelprojects.project.export",
      baseProjectId: "project_hampton_workforce",
      baseRevision: 1
    });
    expect(projectPackage.project.revision).toBe(1);
    expect(projectPackage.tasks.every((task) => task.projectId === "project_hampton_workforce")).toBe(true);
    expect(projectPackage.taskDependencies.every((dependency) => (
      projectPackage.tasks.some((task) => task.id === dependency.taskId)
      && projectPackage.tasks.some((task) => task.id === dependency.dependsOnTaskId)
    ))).toBe(true);
    expect(projectPackage.tasks.map((task) => task.id)).toEqual([...projectPackage.tasks.map((task) => task.id)].sort());
  });

  it("stringifies and hashes package content deterministically", async () => {
    const projectPackage = createCanonicalProjectExport(initialProjectState, "project_hampton_workforce", "2026-07-10T12:00:00.000Z", {
      exportSnapshotId: "export_test_snapshot"
    });
    const packageJson = stringifyCanonicalProjectExport(projectPackage);

    expect(projectPackage.schemaVersion).toBe("1.2");
    expect(projectPackage.lifecycleOperations).toEqual([]);
    expect(projectPackage.exportSnapshotId).toBe("export_test_snapshot");
    expect(JSON.parse(packageJson)).toEqual(projectPackage);
    await expect(hashProjectExport(projectPackage)).resolves.toBe(await hashProjectExport(projectPackage));
  });

  it("can still create legacy schema 1.0 packages for compatibility tests", () => {
    const projectPackage = createCanonicalProjectExport(initialProjectState, "project_hampton_workforce", "2026-07-10T12:00:00.000Z", {
      schemaVersion: "1.0"
    });

    expect(projectPackage.schemaVersion).toBe("1.0");
    expect(projectPackage.exportSnapshotId).toBeUndefined();
  });
});
