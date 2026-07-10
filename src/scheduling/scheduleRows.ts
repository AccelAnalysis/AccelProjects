import type { Milestone, Phase, Task, User } from "../types";
import { compareDateOnly, isDateOnly } from "../utils/dateOnly";
import { sortPhases } from "../utils/phaseOrdering";
import { getTaskScheduleState, isScheduledTask } from "./scheduleDates";

export type PlanGrouping = "phase" | "assignee" | "status" | "priority";

export type ScheduleRow =
  | {
      id: string;
      type: "group";
      depth: number;
      label: string;
      entityId: string;
      expanded: boolean;
      warningCount: number;
      taskCount: number;
      completedTaskCount: number;
      accessibilityLabel: string;
    }
  | {
      id: string;
      type: "phase";
      depth: number;
      phase: Phase;
      phaseIndex: number;
      expanded: boolean;
      warningCount: number;
      taskCount: number;
      completedTaskCount: number;
      accessibilityLabel: string;
    }
  | {
      id: string;
      type: "task";
      depth: number;
      task: Task;
      phase?: Phase;
      scheduled: boolean;
      scheduleState: ReturnType<typeof getTaskScheduleState>;
      selected: boolean;
      canEdit: boolean;
      accessibilityLabel: string;
    }
  | {
      id: string;
      type: "milestone";
      depth: number;
      milestone: Milestone;
      phase?: Phase;
      selected: boolean;
      canEdit: boolean;
      accessibilityLabel: string;
    }
  | {
      id: string;
      type: "empty";
      depth: number;
      label: string;
      accessibilityLabel: string;
    };

export type ScheduleRowInput = {
  phases: Phase[];
  tasks: Task[];
  milestones: Milestone[];
  users: User[];
  grouping: PlanGrouping;
  collapsedIds: Set<string>;
  selectedTaskIds: Set<string>;
  canEditTask: (task: Task) => boolean;
  canManageSchedule: boolean;
};

export function sortTasks(tasks: Task[]) {
  return [...tasks].sort((left, right) => {
    const leftOrder = typeof left.sortOrder === "number" ? left.sortOrder : null;
    const rightOrder = typeof right.sortOrder === "number" ? right.sortOrder : null;

    if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    if (leftOrder !== null) {
      return -1;
    }

    if (rightOrder !== null) {
      return 1;
    }

    return compareDateOnly(left.startDate, right.startDate)
      || compareDateOnly(left.dueDate, right.dueDate)
      || left.title.localeCompare(right.title)
      || left.id.localeCompare(right.id);
  });
}

function userName(users: User[], userId: string | null) {
  return userId ? users.find((user) => user.id === userId)?.name ?? "Unknown assignee" : "Unassigned";
}

function groupKey(task: Task, grouping: PlanGrouping, users: User[]) {
  if (grouping === "assignee") {
    return task.assigneeId ?? "__unassigned";
  }

  if (grouping === "status") {
    return task.status;
  }

  if (grouping === "priority") {
    return task.priority;
  }

  return task.phaseId || "__missing_phase";
}

function groupLabel(key: string, grouping: PlanGrouping, users: User[], phases: Phase[]) {
  if (grouping === "assignee") {
    return key === "__unassigned" ? "Unassigned" : userName(users, key);
  }

  if (grouping === "status" || grouping === "priority") {
    return key.replaceAll("_", " ");
  }

  return phases.find((phase) => phase.id === key)?.name ?? "Unassigned Phase";
}

function taskWarnings(task: Task, phase?: Phase) {
  let count = 0;
  const state = getTaskScheduleState(task);

  if (state === "incomplete" || state === "invalid") {
    count += 1;
  }

  if (!phase) {
    count += 1;
  }

  if (phase && isScheduledTask(task) && (task.startDate < phase.startDate || task.dueDate > phase.endDate)) {
    count += 1;
  }

  return count;
}

export function buildScheduleRows(input: ScheduleRowInput): ScheduleRow[] {
  const phases = sortPhases(input.phases);
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const rows: ScheduleRow[] = [];

  if (input.grouping === "phase") {
    phases.forEach((phase, phaseIndex) => {
      const phaseTasks = sortTasks(input.tasks.filter((task) => task.phaseId === phase.id && getTaskScheduleState(task) === "scheduled"));
      const phaseMilestones = input.milestones.filter((milestone) => milestone.date >= phase.startDate && milestone.date <= phase.endDate);
      const warningCount = phaseTasks.reduce((total, task) => total + taskWarnings(task, phase), 0);
      const expanded = !input.collapsedIds.has(`phase:${phase.id}`);

      rows.push({
        id: `phase:${phase.id}`,
        type: "phase",
        depth: 0,
        phase,
        phaseIndex,
        expanded,
        warningCount,
        taskCount: phaseTasks.length,
        completedTaskCount: phaseTasks.filter((task) => task.status === "done").length,
        accessibilityLabel: `${phaseIndex + 1}. ${phase.name}, ${phaseTasks.length} tasks`
      });

      if (expanded) {
        phaseTasks.forEach((task) => rows.push(taskRow(task, phase, input, 1)));
        phaseMilestones.forEach((milestone) => rows.push(milestoneRow(milestone, phase, input, 1)));
      }
    });

    const unscheduledTasks = sortTasks(input.tasks.filter((task) => getTaskScheduleState(task) === "unscheduled"));
    const scheduleErrorTasks = sortTasks(input.tasks.filter((task) => getTaskScheduleState(task) === "incomplete" || getTaskScheduleState(task) === "invalid" || !phaseById.has(task.phaseId)));

    appendSpecialTaskGroup(rows, "schedule-errors", "Schedule Errors", scheduleErrorTasks, phaseById, input);
    appendSpecialTaskGroup(rows, "unscheduled", "Unscheduled", unscheduledTasks, phaseById, input);

    return rows.length > 0 ? dedupeRows(rows) : [{ id: "empty", type: "empty", depth: 0, label: "No schedule rows", accessibilityLabel: "No schedule rows" }];
  }

  const grouped = new Map<string, Task[]>();
  input.tasks.forEach((task) => {
    const key = groupKey(task, input.grouping, input.users);
    grouped.set(key, [...(grouped.get(key) ?? []), task]);
  });

  [...grouped.entries()]
    .sort(([left], [right]) => groupLabel(left, input.grouping, input.users, phases).localeCompare(groupLabel(right, input.grouping, input.users, phases)))
    .forEach(([key, tasks]) => {
      const sortedTasks = sortTasks(tasks);
      const expanded = !input.collapsedIds.has(`group:${key}`);
      rows.push({
        id: `group:${key}`,
        type: "group",
        depth: 0,
        label: groupLabel(key, input.grouping, input.users, phases),
        entityId: key,
        expanded,
        warningCount: sortedTasks.reduce((total, task) => total + taskWarnings(task, phaseById.get(task.phaseId)), 0),
        taskCount: sortedTasks.length,
        completedTaskCount: sortedTasks.filter((task) => task.status === "done").length,
        accessibilityLabel: `${groupLabel(key, input.grouping, input.users, phases)}, ${sortedTasks.length} tasks`
      });

      if (expanded) {
        sortedTasks.forEach((task) => rows.push(taskRow(task, phaseById.get(task.phaseId), input, 1)));
      }
    });

  return rows.length > 0 ? rows : [{ id: "empty", type: "empty", depth: 0, label: "No matching work", accessibilityLabel: "No matching work" }];
}

function appendSpecialTaskGroup(rows: ScheduleRow[], id: string, label: string, tasks: Task[], phaseById: Map<string, Phase>, input: ScheduleRowInput) {
  if (tasks.length === 0) {
    return;
  }

  const expanded = !input.collapsedIds.has(`group:${id}`);
  rows.push({
    id: `group:${id}`,
    type: "group",
    depth: 0,
    label,
    entityId: id,
    expanded,
    warningCount: tasks.reduce((total, task) => total + taskWarnings(task, phaseById.get(task.phaseId)), 0),
    taskCount: tasks.length,
    completedTaskCount: tasks.filter((task) => task.status === "done").length,
    accessibilityLabel: `${label}, ${tasks.length} tasks`
  });

  if (expanded) {
    tasks.forEach((task) => rows.push(taskRow(task, phaseById.get(task.phaseId), input, 1)));
  }
}

function taskRow(task: Task, phase: Phase | undefined, input: ScheduleRowInput, depth: number): ScheduleRow {
  const scheduleState = getTaskScheduleState(task);
  return {
    id: `task:${task.id}`,
    type: "task",
    depth,
    task,
    phase,
    scheduled: scheduleState === "scheduled",
    scheduleState,
    selected: input.selectedTaskIds.has(task.id),
    canEdit: input.canEditTask(task),
    accessibilityLabel: `${task.title}, ${scheduleState}`
  };
}

function milestoneRow(milestone: Milestone, phase: Phase | undefined, input: ScheduleRowInput, depth: number): ScheduleRow {
  return {
    id: `milestone:${milestone.id}`,
    type: "milestone",
    depth,
    milestone,
    phase,
    selected: false,
    canEdit: input.canManageSchedule,
    accessibilityLabel: `${milestone.name}, milestone ${isDateOnly(milestone.date) ? milestone.date : "date unavailable"}`
  };
}

function dedupeRows(rows: ScheduleRow[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) {
      return false;
    }
    seen.add(row.id);
    return true;
  });
}
