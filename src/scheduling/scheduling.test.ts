import { describe, expect, it } from "vitest";
import type { Milestone, Phase, Project, Task, TaskDependency, User } from "../types";
import { addDays, addMonths } from "../utils/dateOnly";
import { calculateScheduleRange } from "../utils/scheduleRange";
import { getTaskScheduleState, shiftSchedule, taskDurationDays } from "./scheduleDates";
import { createTimelineScale } from "./timelineScale";
import { buildScheduleRows, sortTasks } from "./scheduleRows";
import { detectScheduleConflicts } from "./scheduleConflicts";
import { validateDependencies } from "./dependencyGraph";

const project: Project = {
  id: "project_1",
  organizationId: "org",
  clientId: "client",
  name: "Project",
  summary: "Summary",
  status: "active",
  health: "on_track",
  priority: "medium",
  startDate: "2028-02-01",
  targetDate: "2028-04-30",
  budget: 1,
  currency: "usd",
  ownerId: "user_pm",
  createdAt: "2028-01-01T00:00:00.000Z",
  updatedAt: "2028-01-01T00:00:00.000Z"
};

const phase: Phase = {
  id: "phase_1",
  projectId: project.id,
  name: "Phase",
  status: "active",
  startDate: "2028-02-01",
  endDate: "2028-02-29",
  sortOrder: 1
};

const user: User = {
  id: "user_pm",
  organizationId: "org",
  name: "PM",
  email: "pm@example.com",
  role: "project_manager",
  avatarInitials: "PM"
};

function task(overrides: Partial<Task>): Task {
  return {
    id: "task_1",
    projectId: project.id,
    phaseId: phase.id,
    title: "Task",
    description: "Description",
    status: "not_started",
    priority: "medium",
    assigneeId: user.id,
    startDate: "2028-02-05",
    dueDate: "2028-02-09",
    estimateHours: 4,
    completedAt: null,
    ...overrides
  };
}

describe("schedule date utilities", () => {
  it("classifies nullable and invalid task dates", () => {
    expect(getTaskScheduleState(task({ startDate: null, dueDate: null }))).toBe("unscheduled");
    expect(getTaskScheduleState(task({ startDate: "2028-02-01", dueDate: null }))).toBe("incomplete");
    expect(getTaskScheduleState(task({ startDate: "2028-02-10", dueDate: "2028-02-01" }))).toBe("invalid");
    expect(getTaskScheduleState(task({ startDate: "2028-02-01", dueDate: "2028-02-10" }))).toBe("scheduled");
  });

  it("calculates duration and shifts across leap days", () => {
    const scheduled = task({ startDate: "2028-02-28", dueDate: "2028-03-01" });

    expect(taskDurationDays(scheduled)).toBe(3);
    expect(shiftSchedule(scheduled, 1)).toMatchObject({ startDate: "2028-02-29", dueDate: "2028-03-02" });
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("handles month boundaries", () => {
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
  });
});

describe("timeline scale", () => {
  it("fits a project range into the viewport", () => {
    const range = calculateScheduleRange(project, [phase], [task({})]);
    const scale = createTimelineScale("fit", range, 900);

    expect(scale.timelineWidth).toBeGreaterThanOrEqual(900);
    expect(scale.pixelsPerDay).toBeGreaterThan(1);
  });
});

describe("schedule rows", () => {
  it("keeps unscheduled and orphan tasks visible", () => {
    const rows = buildScheduleRows({
      phases: [phase],
      tasks: [
        task({ id: "task_scheduled" }),
        task({ id: "task_unscheduled", startDate: null, dueDate: null }),
        task({ id: "task_orphan", phaseId: "missing" })
      ],
      milestones: [],
      users: [user],
      grouping: "phase",
      collapsedIds: new Set(),
      selectedTaskIds: new Set(),
      canEditTask: () => true,
      canManageSchedule: true
    });

    expect(rows.some((row) => row.id === "group:unscheduled")).toBe(true);
    expect(rows.some((row) => row.id === "group:schedule-errors")).toBe(true);
    expect(rows.filter((row) => row.type === "task")).toHaveLength(3);
  });

  it("sorts tasks deterministically", () => {
    expect(sortTasks([
      task({ id: "b", title: "B", startDate: "2028-02-02", dueDate: "2028-02-03" }),
      task({ id: "a", title: "A", startDate: "2028-02-01", dueDate: "2028-02-03" })
    ]).map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("conflict and dependency detection", () => {
  it("detects schedule conflicts", () => {
    const milestone: Milestone = { id: "milestone_1", projectId: project.id, name: "Late", date: "2028-05-01", status: "planned" };
    const conflicts = detectScheduleConflicts({
      project,
      phases: [phase],
      tasks: [task({ id: "bad", startDate: "2028-03-05", dueDate: "2028-03-01" })],
      milestones: [milestone],
      dependencies: []
    });

    expect(conflicts.map((conflict) => conflict.code)).toContain("task_invalid_date_order");
    expect(conflicts.map((conflict) => conflict.code)).toContain("milestone_outside_project");
  });

  it("rejects duplicate, self, missing, cross-project, and circular dependencies", () => {
    const otherProjectTask = task({ id: "other", projectId: "project_2" });
    const dependencies: TaskDependency[] = [
      { id: "self", taskId: "task_1", dependsOnTaskId: "task_1", type: "finish_to_start" },
      { id: "dup1", taskId: "task_2", dependsOnTaskId: "task_1", type: "finish_to_start" },
      { id: "dup2", taskId: "task_2", dependsOnTaskId: "task_1", type: "finish_to_start" },
      { id: "missing", taskId: "task_3", dependsOnTaskId: "missing", type: "finish_to_start" },
      { id: "cross", taskId: "task_1", dependsOnTaskId: "other", type: "finish_to_start" },
      { id: "cycle1", taskId: "task_1", dependsOnTaskId: "task_2", type: "finish_to_start" },
      { id: "cycle2", taskId: "task_2", dependsOnTaskId: "task_1", type: "finish_to_start" }
    ];
    const issues = validateDependencies([task({ id: "task_1" }), task({ id: "task_2" }), otherProjectTask], dependencies);

    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "self_dependency",
      "duplicate_dependency",
      "missing_dependency_endpoint",
      "cross_project_dependency",
      "circular_dependency"
    ]));
  });
});
