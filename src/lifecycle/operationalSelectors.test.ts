import { describe, expect, it } from "vitest";
import { initialProjectState } from "../data/projectMockData";
import { activeOperationalState, managedLifecycleProjectIds } from "./operationalSelectors";

describe("operational lifecycle selectors", () => {
  it("excludes trashed projects, tasks, relationships, risks, milestones and metrics from active views", () => {
    const projectId = initialProjectState.projects[0].id;
    const task = initialProjectState.tasks.find((item) => item.projectId === projectId)!;
    const state = structuredClone(initialProjectState);
    state.tasks.find((item) => item.id === task.id)!.lifecycle = { schemaVersion: 1, state: "trashed", retentionClass: "operational_30d", lastOperationId: "op" };
    const active = activeOperationalState(state);
    expect(active.tasks.some((item) => item.id === task.id)).toBe(false);
    expect(active.taskDependencies.some((item) => item.taskId === task.id || item.dependsOnTaskId === task.id)).toBe(false);
    expect(active.taskComments.some((item) => item.taskId === task.id)).toBe(false);
  });

  it("limits manager trash scope to owned or lead-managed projects", () => {
    const manager = initialProjectState.users.find((user) => user.role === "project_manager")!;
    const ids = managedLifecycleProjectIds(initialProjectState, manager);
    initialProjectState.projects.filter((project) => ids.has(project.id)).forEach((project) => {
      expect(project.ownerId === manager.id || initialProjectState.projectMembers.some((member) => member.projectId === project.id && member.userId === manager.id && member.role === "lead")).toBe(true);
    });
  });
});
