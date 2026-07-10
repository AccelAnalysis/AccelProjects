import type { Milestone, Phase, Project, Task, TaskDependency } from "../types";
import { isDateOnly } from "../utils/dateOnly";
import { isScheduledTask, getTaskScheduleState } from "./scheduleDates";
import { validateDependencies, type DependencyValidationIssue } from "./dependencyGraph";

export type ScheduleConflict = {
  code:
    | "task_outside_phase"
    | "task_outside_project"
    | "task_invalid_date_order"
    | "task_incomplete_date_pair"
    | "phase_child_outside"
    | "milestone_outside_project"
    | "orphan_task_phase"
    | DependencyValidationIssue["code"];
  severity: "fatal" | "warning";
  entityType: "task" | "phase" | "milestone" | "dependency";
  entityId: string;
  message: string;
};

export function detectScheduleConflicts({
  project,
  phases,
  tasks,
  milestones,
  dependencies
}: {
  project: Project;
  phases: Phase[];
  tasks: Task[];
  milestones: Milestone[];
  dependencies: TaskDependency[];
}): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));

  tasks.forEach((task) => {
    const phase = phaseById.get(task.phaseId);
    const state = getTaskScheduleState(task);

    if (!phase) {
      conflicts.push({
        code: "orphan_task_phase",
        severity: "warning",
        entityType: "task",
        entityId: task.id,
        message: `"${task.title}" references a missing phase.`
      });
    }

    if (state === "incomplete") {
      conflicts.push({
        code: "task_incomplete_date_pair",
        severity: "fatal",
        entityType: "task",
        entityId: task.id,
        message: `"${task.title}" needs both start and due dates, or neither.`
      });
    }

    if (state === "invalid") {
      conflicts.push({
        code: "task_invalid_date_order",
        severity: "fatal",
        entityType: "task",
        entityId: task.id,
        message: `"${task.title}" has a due date before its start date.`
      });
    }

    if (phase && isScheduledTask(task) && (task.startDate < phase.startDate || task.dueDate > phase.endDate)) {
      conflicts.push({
        code: "task_outside_phase",
        severity: "warning",
        entityType: "task",
        entityId: task.id,
        message: `"${task.title}" falls outside ${phase.name}.`
      });
    }

    if (isScheduledTask(task) && (task.startDate < project.startDate || task.dueDate > project.targetDate)) {
      conflicts.push({
        code: "task_outside_project",
        severity: "warning",
        entityType: "task",
        entityId: task.id,
        message: `"${task.title}" falls outside project dates.`
      });
    }
  });

  phases.forEach((phase) => {
    const children = tasks.filter((task) => task.phaseId === phase.id && isScheduledTask(task));
    if (children.some((task) => isScheduledTask(task) && (task.startDate < phase.startDate || task.dueDate > phase.endDate))) {
      conflicts.push({
        code: "phase_child_outside",
        severity: "warning",
        entityType: "phase",
        entityId: phase.id,
        message: `${phase.name} has tasks outside its date range.`
      });
    }
  });

  milestones.forEach((milestone) => {
    if (!isDateOnly(milestone.date) || milestone.date < project.startDate || milestone.date > project.targetDate) {
      conflicts.push({
        code: "milestone_outside_project",
        severity: "warning",
        entityType: "milestone",
        entityId: milestone.id,
        message: `"${milestone.name}" falls outside project dates.`
      });
    }
  });

  validateDependencies(tasks, dependencies).forEach((issue) => {
    conflicts.push({
      code: issue.code,
      severity: issue.severity,
      entityType: "dependency",
      entityId: issue.dependencyId ?? "new",
      message: issue.message
    });
  });

  return conflicts;
}

export function hasFatalConflicts(conflicts: ScheduleConflict[]) {
  return conflicts.some((conflict) => conflict.severity === "fatal");
}
