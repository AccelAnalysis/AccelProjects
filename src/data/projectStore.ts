import type { UserRole } from "../types";

const selectedProjectKey = "accelprojects.selectedProjectId";
const roleKey = "accelprojects.role";
const clientPreviewKey = "accelprojects.clientPreview";

export function loadSelectedProjectId() {
  return window.localStorage.getItem(selectedProjectKey) ?? "";
}

export function saveSelectedProjectId(projectId: string) {
  window.localStorage.setItem(selectedProjectKey, projectId);
}

export function loadSelectedRole(): UserRole {
  return (window.localStorage.getItem(roleKey) as UserRole | null) ?? "project_manager";
}

export function saveSelectedRole(role: UserRole) {
  window.localStorage.setItem(roleKey, role);
}

export function loadClientPreview() {
  return window.localStorage.getItem(clientPreviewKey) === "true";
}

export function saveClientPreview(enabled: boolean) {
  window.localStorage.setItem(clientPreviewKey, String(enabled));
}
