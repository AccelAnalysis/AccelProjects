import { describe, expect, it } from "vitest";
import { initialProjectState } from "../data/projectMockData";
import { createCanonicalProjectExport, hashProjectExport, stringifyCanonicalProjectExport } from "../exports/projectExport";
import type { ProjectExportSnapshot, User } from "../types";
import { createProjectUpdatePlan } from "./projectUpdatePlanner";
import { verifyProjectUpdateSource } from "./projectUpdateValidator";

const projectId = "project_hampton_workforce";
const actor = initialProjectState.users.find((user) => user.id === "user_sarah") as User;

async function sourceFixture() {
  const originalPackage = createCanonicalProjectExport(initialProjectState, projectId, "2026-07-10T12:00:00.000Z", {
    exportSnapshotId: "export_snapshot_test"
  });
  const packageJson = stringifyCanonicalProjectExport(originalPackage);
  const sourceHash = await hashProjectExport(originalPackage);
  const sourceSnapshot: ProjectExportSnapshot = {
    id: "export_snapshot_test",
    projectId,
    baseRevision: originalPackage.baseRevision,
    packageId: originalPackage.packageId,
    sourceHash,
    snapshotType: "manual_export",
    createdBy: actor.id,
    createdAt: "2026-07-10T12:00:01.000Z",
    packageJson
  };

  return { originalPackage, packageJson, sourceHash, sourceSnapshot };
}

async function planFor(mutator: (pkg: Awaited<ReturnType<typeof sourceFixture>>["originalPackage"]) => void) {
  const { originalPackage, sourceSnapshot } = await sourceFixture();
  const uploadedPackage = JSON.parse(JSON.stringify(originalPackage));
  mutator(uploadedPackage);
  const uploadedText = stringifyCanonicalProjectExport(uploadedPackage);
  const source = await verifyProjectUpdateSource({
    projectId,
    rawText: uploadedText,
    snapshots: [sourceSnapshot],
    currentState: initialProjectState
  });

  return createProjectUpdatePlan({
    projectId,
    originalPackage,
    uploadedPackage,
    sourceSnapshot,
    currentState: initialProjectState,
    currentUser: actor,
    uploadedFileHash: source.uploadedFileHash,
    applyTimestamp: "2026-07-10T12:30:00.000Z",
    generateId: (_entityType, temporaryId) => `resolved_${temporaryId}`
  });
}

describe("project update provenance and planning", () => {
  it("verifies a known schema 1.2 export snapshot", async () => {
    const { originalPackage, packageJson, sourceSnapshot } = await sourceFixture();
    const result = await verifyProjectUpdateSource({
      projectId,
      rawText: packageJson,
      snapshots: [sourceSnapshot],
      currentState: initialProjectState
    });

    expect(result.originalPackage?.packageId).toBe(originalPackage.packageId);
    expect(result.issues.map((issue) => issue.code)).toContain("no_project_changes");
  });

  it("rejects unknown legacy schema 1.0 snapshots", async () => {
    const legacy = createCanonicalProjectExport(initialProjectState, projectId, "2026-07-10T12:00:00.000Z", { schemaVersion: "1.0" });
    const result = await verifyProjectUpdateSource({
      projectId,
      rawText: stringifyCanonicalProjectExport(legacy),
      snapshots: [],
      currentState: initialProjectState
    });

    expect(result.issues.map((issue) => issue.code)).toContain("unknown_export_snapshot");
  });

  it("detects existing task rename and new task dependency with resolved IDs", async () => {
    const plan = await planFor((pkg) => {
      pkg.tasks[0].title = "Renamed workforce task";
      pkg.tasks.push({
        ...pkg.tasks[0],
        id: "new_task_review",
        title: "Review launch package",
        completedAt: null
      });
      pkg.taskDependencies.push({
        id: "new_dependency_review",
        taskId: "new_task_review",
        dependsOnTaskId: pkg.tasks[0].id,
        type: "finish_to_start"
      });
    });

    expect(plan.validationIssues.filter((issue) => issue.severity === "error")).toHaveLength(0);
    expect(plan.changeCounts.added).toBe(2);
    expect(plan.changeCounts.modified).toBeGreaterThan(0);
    expect(plan.temporaryIdMap.new_task_review).toBe("resolved_new_task_review");
    expect(plan.resultCanonicalPackage.tasks.some((task) => task.id === "new_task_review")).toBe(false);
    expect(plan.resultCanonicalPackage.taskDependencies.some((dependency) => dependency.taskId === "resolved_new_task_review")).toBe(true);
  });

  it("blocks immutable owner changes and member edits", async () => {
    const plan = await planFor((pkg) => {
      pkg.project.ownerId = "user_marcus";
      pkg.members = pkg.members.slice(1);
    });

    expect(plan.validationIssues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "immutable_field_changed",
      "member_updates_not_supported"
    ]));
  });

  it("blocks direct lifecycle and legal-hold forgery in update packages", async () => {
    const plan = await planFor((pkg) => { pkg.tasks[0].lifecycle = { schemaVersion: 1, state: "active", retentionClass: "legal_hold", legalHold: false, lastOperationId: "forged" }; });
    expect(plan.validationIssues.map((issue) => issue.code)).toContain("immutable_field_changed");
  });

  it("blocks implicit omission instead of deleting commented tasks", async () => {
    const commentedTaskId = initialProjectState.taskComments[0].taskId;
    const plan = await planFor((pkg) => {
      pkg.tasks = pkg.tasks.filter((task) => task.id !== commentedTaskId);
      pkg.taskDependencies = pkg.taskDependencies.filter((dependency) => dependency.taskId !== commentedTaskId && dependency.dependsOnTaskId !== commentedTaskId);
    });

    expect(plan.validationIssues.map((issue) => issue.code)).toContain("implicit_removal_not_allowed");
    expect(plan.resultCanonicalPackage.tasks.some((task) => task.id === commentedTaskId)).toBe(true);
  });

  it("turns an explicit schema 1.2 omission into a retained lifecycle transition", async () => {
    const milestoneId = initialProjectState.milestones.find((milestone) => milestone.projectId === projectId)!.id;
    const plan = await planFor((pkg) => {
      pkg.milestones = pkg.milestones.filter((milestone) => milestone.id !== milestoneId);
      pkg.lifecycleOperations = [{ entityType: "milestones", entityId: milestoneId, action: "trash", reason: "Duplicate milestone", expectedPriorState: "active" }];
    });

    expect(plan.validationIssues.filter((issue) => issue.severity === "error")).toHaveLength(0);
    expect(plan.removals).toHaveLength(0);
    expect(plan.resultCanonicalPackage.milestones.find((milestone) => milestone.id === milestoneId)?.lifecycle?.state).toBe("trashed");
  });
});
