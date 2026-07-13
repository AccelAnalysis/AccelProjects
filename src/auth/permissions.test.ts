import { describe, expect, it } from "vitest";
import { initialProjectState } from "../data/projectMockData";
import type { ProjectMember, User } from "../types";
import { canManageProject } from "./permissions";

const project = initialProjectState.projects.find((item) => item.id === "project_hampton_workforce");

function user(overrides: Partial<User>): User {
  return {
    id: "user_test",
    organizationId: "org_accel_projects",
    name: "Test User",
    email: "test@example.com",
    role: "project_manager",
    avatarInitials: "TU",
    ...overrides
  };
}

function stateWithMember(member: ProjectMember) {
  return {
    ...initialProjectState,
    projectMembers: [...initialProjectState.projectMembers.filter((item) => item.userId !== member.userId), member]
  };
}

describe("project management permissions", () => {
  it("allows admins and owning project managers", () => {
    expect(canManageProject("admin", user({ id: "admin", role: "admin" }), project, initialProjectState)).toBe(true);
    expect(canManageProject("project_manager", user({ id: project?.ownerId }), project, initialProjectState)).toBe(true);
  });

  it("allows lead project manager members", () => {
    const lead = user({ id: "user_lead" });
    const state = stateWithMember({ id: "member_lead", projectId: project?.id ?? "", userId: lead.id, role: "lead", accessState: "active" });

    expect(canManageProject("project_manager", lead, project, state)).toBe(true);
  });

  it("denies non-lead and unrelated project managers", () => {
    const manager = user({ id: "user_member" });
    const state = stateWithMember({ id: "member_manager", projectId: project?.id ?? "", userId: manager.id, role: "contributor", accessState: "active" });

    expect(canManageProject("project_manager", manager, project, state)).toBe(false);
    expect(canManageProject("project_manager", user({ id: "user_unrelated" }), project, initialProjectState)).toBe(false);
  });

  it("denies contributors, clients, viewers, and admin preview role changes", () => {
    expect(canManageProject("contributor", user({ id: "user_marcus", role: "contributor" }), project, initialProjectState)).toBe(false);
    expect(canManageProject("client", user({ id: "user_dana", role: "client" }), project, initialProjectState)).toBe(false);
    expect(canManageProject("viewer", user({ id: "user_viewer", role: "viewer" }), project, initialProjectState)).toBe(false);
    expect(canManageProject("admin", user({ id: "user_viewer", role: "viewer" }), project, initialProjectState)).toBe(false);
  });
});
