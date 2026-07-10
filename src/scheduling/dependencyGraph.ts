import type { Task, TaskDependency } from "../types";
import { isScheduledTask } from "./scheduleDates";

export type DependencyValidationIssue = {
  code: "self_dependency" | "duplicate_dependency" | "cross_project_dependency" | "missing_dependency_endpoint" | "circular_dependency" | "dependency_order_conflict";
  severity: "fatal" | "warning";
  message: string;
  dependencyId?: string;
};

export function validateDependencies(tasks: Task[], dependencies: TaskDependency[]): DependencyValidationIssue[] {
  const issues: DependencyValidationIssue[] = [];
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();

  dependencies.forEach((dependency) => {
    const task = taskById.get(dependency.taskId);
    const predecessor = taskById.get(dependency.dependsOnTaskId);
    const duplicateKey = `${dependency.taskId}:${dependency.dependsOnTaskId}:${dependency.type}`;

    if (dependency.taskId === dependency.dependsOnTaskId) {
      issues.push({ code: "self_dependency", severity: "fatal", dependencyId: dependency.id, message: "A task cannot depend on itself." });
    }

    if (seen.has(duplicateKey)) {
      issues.push({ code: "duplicate_dependency", severity: "fatal", dependencyId: dependency.id, message: "This dependency already exists." });
    }
    seen.add(duplicateKey);

    if (!task || !predecessor) {
      issues.push({ code: "missing_dependency_endpoint", severity: "fatal", dependencyId: dependency.id, message: "Dependency endpoint task is missing." });
      return;
    }

    if (task.projectId !== predecessor.projectId) {
      issues.push({ code: "cross_project_dependency", severity: "fatal", dependencyId: dependency.id, message: "Dependencies cannot cross projects." });
    }

    if (isScheduledTask(task) && isScheduledTask(predecessor) && violatesDependencyOrder(task, predecessor, dependency.type)) {
      issues.push({ code: "dependency_order_conflict", severity: "warning", dependencyId: dependency.id, message: "Dependency order is not satisfied by current task dates." });
    }
  });

  findCycle(tasks, dependencies)?.forEach((dependencyId) => {
    issues.push({ code: "circular_dependency", severity: "fatal", dependencyId, message: "Dependency would create a circular relationship." });
  });

  return issues;
}

export function dependencyExists(dependencies: TaskDependency[], taskId: string, dependsOnTaskId: string, type?: TaskDependency["type"]) {
  return dependencies.some((dependency) => (
    dependency.taskId === taskId
    && dependency.dependsOnTaskId === dependsOnTaskId
    && (!type || dependency.type === type)
  ));
}

function violatesDependencyOrder(task: Task, predecessor: Task, type: TaskDependency["type"]) {
  if (!isScheduledTask(task) || !isScheduledTask(predecessor)) {
    return false;
  }

  if (type === "finish_to_start") {
    return task.startDate < predecessor.dueDate;
  }

  if (type === "start_to_start") {
    return task.startDate < predecessor.startDate;
  }

  return task.dueDate < predecessor.dueDate;
}

function findCycle(tasks: Task[], dependencies: TaskDependency[]) {
  const taskIds = new Set(tasks.map((task) => task.id));
  const adjacency = new Map<string, Array<{ next: string; dependencyId: string }>>();

  dependencies.forEach((dependency) => {
    if (!taskIds.has(dependency.taskId) || !taskIds.has(dependency.dependsOnTaskId)) {
      return;
    }

    adjacency.set(dependency.dependsOnTaskId, [
      ...(adjacency.get(dependency.dependsOnTaskId) ?? []),
      { next: dependency.taskId, dependencyId: dependency.id }
    ]);
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const pathDependencyIds: string[] = [];

  function visit(taskId: string): string[] | null {
    if (visiting.has(taskId)) {
      return [...pathDependencyIds];
    }

    if (visited.has(taskId)) {
      return null;
    }

    visiting.add(taskId);
    for (const edge of adjacency.get(taskId) ?? []) {
      pathDependencyIds.push(edge.dependencyId);
      const cycle = visit(edge.next);
      if (cycle) {
        return cycle;
      }
      pathDependencyIds.pop();
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return null;
  }

  for (const task of tasks) {
    const cycle = visit(task.id);
    if (cycle) {
      return cycle;
    }
  }

  return null;
}
