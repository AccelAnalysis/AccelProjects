import type { ProjectState, User } from "../types";
import { isLifecycleActive } from "./policy";

export function activeOperationalState(state: ProjectState): ProjectState {
  const projects = state.projects.filter(isLifecycleActive);
  const projectIds = new Set(projects.map((project) => project.id));
  const tasks = state.tasks.filter((task) => projectIds.has(task.projectId) && isLifecycleActive(task));
  const taskIds = new Set(tasks.map((task) => task.id));
  return {
    ...state,
    clients: state.clients.filter(isLifecycleActive), projects,
    projectMembers: state.projectMembers.filter((item) => projectIds.has(item.projectId) && isLifecycleActive(item)),
    phases: state.phases.filter((item) => projectIds.has(item.projectId) && isLifecycleActive(item)),
    milestones: state.milestones.filter((item) => projectIds.has(item.projectId) && isLifecycleActive(item)), tasks,
    taskDependencies: state.taskDependencies.filter((item) => isLifecycleActive(item) && taskIds.has(item.taskId) && taskIds.has(item.dependsOnTaskId)),
    taskComments: state.taskComments.filter((item) => taskIds.has(item.taskId)),
    risks: state.risks.filter((item) => projectIds.has(item.projectId) && isLifecycleActive(item)),
    documents: state.documents.filter((item) => projectIds.has(item.projectId) && isLifecycleActive(item)),
    metrics: state.metrics.filter((item) => projectIds.has(item.projectId) && isLifecycleActive(item))
  };
}

export function managedLifecycleProjectIds(state: ProjectState, user: User) {
  if (user.role === "admin") return new Set(state.projects.map((project) => project.id));
  return new Set(state.projects.filter((project) => project.ownerId === user.id || state.projectMembers.some((member) => member.projectId === project.id && member.userId === user.id && member.role === "lead" && isLifecycleActive(member))).map((project) => project.id));
}
