import type { UserRole } from "../types";

const selectedProjectKey = "accelprojects.selectedProjectId";
const adminPreviewRoleKey = "accelprojects.adminPreviewRole";
const roles: UserRole[] = ["admin", "project_manager", "contributor", "client", "viewer"];

export function loadSelectedProjectId() {
  return window.localStorage.getItem(selectedProjectKey) ?? "";
}

export function saveSelectedProjectId(projectId: string) {
  window.localStorage.setItem(selectedProjectKey, projectId);
}

export function loadAdminPreviewRole(): UserRole | "off" {
  const storedRole = window.localStorage.getItem(adminPreviewRoleKey);
  return roles.includes(storedRole as UserRole) ? storedRole as UserRole : "off";
}

export function saveAdminPreviewRole(role: UserRole | "off") {
  if (role === "off") {
    window.localStorage.removeItem(adminPreviewRoleKey);
    return;
  }

  window.localStorage.setItem(adminPreviewRoleKey, role);
}
