import type { Milestone, Phase, Project, Task } from "../types";
import { addDays, daysBetween, isDateOnly, todayDateOnly } from "./dateOnly";

export type ScheduleRange = {
  startDate: string;
  endDate: string;
  totalDays: number;
  available: boolean;
};

export function calculateScheduleRange(project: Project, phases: Phase[], tasks: Task[], milestones: Milestone[] = [], now = new Date()): ScheduleRange {
  const starts = [
    project.startDate,
    ...phases.map((phase) => phase.startDate),
    ...tasks.map((task) => task.startDate),
    ...milestones.map((milestone) => milestone.date)
  ].filter(isDateOnly);
  const ends = [
    project.targetDate,
    ...phases.map((phase) => phase.endDate),
    ...tasks.map((task) => task.dueDate),
    ...milestones.map((milestone) => milestone.date)
  ].filter(isDateOnly);

  if (starts.length === 0 && ends.length === 0) {
    const today = todayDateOnly(now);
    const endDate = addDays(today, 14);
    return { startDate: today, endDate, totalDays: daysBetween(today, endDate), available: false };
  }

  const allDates = [...starts, ...ends].sort();
  let startDate = starts.sort()[0] ?? allDates[0];
  let endDate = ends.sort()[ends.length - 1] ?? allDates[allDates.length - 1];

  if (endDate < startDate) {
    [startDate, endDate] = [endDate, startDate];
  }

  if (startDate === endDate) {
    endDate = addDays(startDate, 1);
  }

  return {
    startDate,
    endDate,
    totalDays: Math.max(1, daysBetween(startDate, endDate)),
    available: true
  };
}
