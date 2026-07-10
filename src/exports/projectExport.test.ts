import { describe, expect, it } from "vitest";
import { initialProjectState } from "../data/projectMockData";
import { createCanonicalProjectExport, hashProjectExport, stringifyCanonicalProjectExport } from "./projectExport";

describe("canonical project export", () => {
  it("exports only selected-project data with revision identity", () => {
    const projectPackage = createCanonicalProjectExport(initialProjectState, "project_hampton_workforce", "2026-07-10T12:00:00.000Z");

    expect(projectPackage).toMatchObject({
      schemaVersion: "1.0",
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
    const projectPackage = createCanonicalProjectExport(initialProjectState, "project_hampton_workforce", "2026-07-10T12:00:00.000Z");
    const packageJson = stringifyCanonicalProjectExport(projectPackage);

    expect(JSON.parse(packageJson)).toEqual(projectPackage);
    await expect(hashProjectExport(projectPackage)).resolves.toBe(await hashProjectExport(projectPackage));
  });
});
