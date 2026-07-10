import type { Project, ProjectMember, ProjectState, Task, User, UserRole } from "../types";

export type ProjectPermissions = {
  canAddTaskComments: boolean;
  canCreateTasks: boolean;
  canEditDocuments: boolean;
  canEditMetrics: boolean;
  canEditTasks: boolean;
  canManageProjects: boolean;
  canManageRisks: boolean;
  canManageSchedule: boolean;
  canUseAdminPreview: boolean;
  canViewInternal: boolean;
  isReadOnly: boolean;
};

export function getUserRole(userProfile: User | null | undefined): UserRole {
  return userProfile?.role ?? "viewer";
}

export function canUseAdminPreview(role: UserRole) {
  return role === "admin";
}

export function isClientRole(role: UserRole) {
  return role === "client";
}

export function canViewInternalProjectData(role: UserRole) {
  return role !== "client";
}

export function isProjectMember(projectMembers: ProjectMember[], projectId: string, userId: string) {
  return projectMembers.some((member) => member.projectId === projectId && member.userId === userId);
}

export function canManageProject(role: UserRole, userProfile: User | null | undefined, project: Project | undefined, projectState: ProjectState) {
  if (!project || !userProfile) {
    return false;
  }

  if (role === "admin") {
    return true;
  }

  if (role !== "project_manager") {
    return false;
  }

  return project.ownerId === userProfile.id || isProjectMember(projectState.projectMembers, project.id, userProfile.id);
}

export function canEditTask(role: UserRole, userProfile: User | null | undefined, task: Task | undefined, projectState: ProjectState) {
  if (!task || !userProfile) {
    return false;
  }

  if (role === "admin") {
    return true;
  }

  const project = projectState.projects.find((item) => item.id === task.projectId);

  if (role === "project_manager") {
    return canManageProject(role, userProfile, project, projectState);
  }

  if (role === "contributor") {
    return task.assigneeId === userProfile.id;
  }

  return false;
}

export function canAddTaskComment(role: UserRole, userProfile: User | null | undefined, task: Task | undefined, projectState: ProjectState) {
  if (!task || !userProfile) {
    return false;
  }

  if (role === "admin" || role === "viewer" || role === "client") {
    return role === "admin";
  }

  if (role === "project_manager") {
    const project = projectState.projects.find((item) => item.id === task.projectId);
    return canManageProject(role, userProfile, project, projectState);
  }

  return task.assigneeId === userProfile.id;
}

export function getProjectPermissions(role: UserRole, userProfile: User | null | undefined, project: Project | undefined, projectState: ProjectState): ProjectPermissions {
  const canManageSelectedProject = canManageProject(role, userProfile, project, projectState);
  const canEditProjectWork = role === "admin" || canManageSelectedProject;
  const canViewInternal = canViewInternalProjectData(role);

  return {
    canAddTaskComments: role === "admin" || role === "project_manager" || role === "contributor",
    canCreateTasks: canEditProjectWork,
    canEditDocuments: canEditProjectWork,
    canEditMetrics: canEditProjectWork,
    canEditTasks: role === "admin" || role === "project_manager" || role === "contributor",
    canManageProjects: canEditProjectWork,
    canManageRisks: canEditProjectWork,
    canManageSchedule: canEditProjectWork,
    canUseAdminPreview: canUseAdminPreview(getUserRole(userProfile)),
    canViewInternal,
    isReadOnly: role === "viewer" || role === "client"
  };
}
