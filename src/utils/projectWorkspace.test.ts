import { describe, expect, it } from "vitest";
import type { Phase, Project, Task } from "../types";
import { normalizePhaseSortOrder, sortPhases } from "./phaseOrdering";
import { calculateScheduleRange } from "./scheduleRange";
import { generateTimelineTicks, timelinePercent } from "./timelineTicks";

const project = {
  id: "project_1",
  organizationId: "org",
  clientId: "client",
  name: "Project",
  summary: "Summary",
  status: "active",
  health: "on_track",
  priority: "medium",
  startDate: "2026-02-01",
  targetDate: "2026-03-01",
  budget: 1000,
  currency: "usd",
  ownerId: "user_1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
} satisfies Project;

function phase(overrides: Partial<Phase>): Phase {
  return {
    id: "phase",
    projectId: "project_1",
    name: "Phase",
    status: "planned",
    startDate: "2026-02-01",
    endDate: "2026-02-05",
    ...overrides
  };
}

function task(overrides: Partial<Task>): Task {
  return {
    id: "task",
    projectId: "project_1",
    phaseId: "phase",
    title: "Task",
    description: "Description",
    status: "not_started",
    priority: "medium",
    assigneeId: null,
    startDate: "2026-02-01",
    dueDate: "2026-02-05",
    estimateHours: 1,
    completedAt: null,
    ...overrides
  };
}

describe("project workspace utilities", () => {
  it("sorts phases by explicit sequence first", () => {
    const phases = [
      phase({ id: "b", name: "Second", sortOrder: 2 }),
      phase({ id: "a", name: "First", sortOrder: 1 })
    ];

    expect(sortPhases(phases).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("normalizes missing legacy phase sequence deterministically", () => {
    const phases = [
      phase({ id: "late", name: "Late", startDate: "2026-03-01", endDate: "2026-03-05" }),
      phase({ id: "early", name: "Early", startDate: "2026-02-01", endDate: "2026-02-05" })
    ];

    expect(normalizePhaseSortOrder(phases).map((item) => [item.id, item.sortOrder])).toEqual([
      ["early", 1],
      ["late", 2]
    ]);
  });

  it("calculates range from project, phase, and task dates", () => {
    const range = calculateScheduleRange(
      project,
      [phase({ startDate: "2026-01-15", endDate: "2026-02-05" })],
      [task({ startDate: "2026-02-20", dueDate: "2026-04-10" })]
    );

    expect(range.startDate).toBe("2026-01-15");
    expect(range.endDate).toBe("2026-04-10");
    expect(range.available).toBe(true);
  });

  it("generates first and last timeline ticks", () => {
    const range = calculateScheduleRange(project, [], []);
    const ticks = generateTimelineTicks(range);

    expect(ticks[0]?.date).toBe("2026-02-01");
    expect(ticks[ticks.length - 1]?.date).toBe("2026-03-01");
    expect(new Set(ticks.map((tick) => tick.date)).size).toBe(ticks.length);
  });

  it("calculates timeline percentages from real dates", () => {
    const range = calculateScheduleRange(project, [], []);

    expect(timelinePercent("2026-02-01", range)).toBe(0);
    expect(timelinePercent("2026-03-01", range)).toBe(100);
  });
});
