import type { Task } from "../types";
import { addDays, daysBetween, isDateOnly } from "../utils/dateOnly";

export type TaskScheduleState = "scheduled" | "unscheduled" | "incomplete" | "invalid";

export function getTaskScheduleState(task: Pick<Task, "startDate" | "dueDate">): TaskScheduleState {
  const { startDate, dueDate } = task;
  const hasStart = isDateOnly(startDate);
  const hasDue = isDateOnly(dueDate);

  if (!startDate && !dueDate) {
    return "unscheduled";
  }

  if (hasStart && hasDue) {
    return dueDate < startDate ? "invalid" : "scheduled";
  }

  return "incomplete";
}

export function isScheduledTask<T extends Pick<Task, "startDate" | "dueDate">>(task: T): task is T & { startDate: string; dueDate: string } {
  return getTaskScheduleState(task) === "scheduled";
}

export function taskDurationDays(task: Pick<Task, "startDate" | "dueDate">) {
  if (!isScheduledTask(task)) {
    return 0;
  }

  return Math.max(1, daysBetween(task.startDate, task.dueDate) + 1);
}

export function shiftSchedule<T extends { startDate: string | null; dueDate: string | null }>(item: T, days: number): T {
  return {
    ...item,
    startDate: item.startDate ? addDays(item.startDate, days) : item.startDate,
    dueDate: item.dueDate ? addDays(item.dueDate, days) : item.dueDate
  };
}

export function scheduleTaskAt<T extends { startDate: string | null; dueDate: string | null }>(item: T, startDate: string, durationDays = 5): T {
  return {
    ...item,
    startDate,
    dueDate: addDays(startDate, Math.max(1, durationDays) - 1)
  };
}

export function resizeTaskSchedule(
  task: Pick<Task, "startDate" | "dueDate">,
  edge: "start" | "end",
  date: string
): Pick<Task, "startDate" | "dueDate"> {
  if (!isScheduledTask(task)) {
    return task;
  }

  if (edge === "start") {
    return {
      startDate: date <= task.dueDate ? date : task.dueDate,
      dueDate: task.dueDate
    };
  }

  return {
    startDate: task.startDate,
    dueDate: date >= task.startDate ? date : task.startDate
  };
}
