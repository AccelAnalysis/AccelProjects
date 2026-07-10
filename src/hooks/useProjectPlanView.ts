import { useEffect, useMemo, useState } from "react";
import type { Task } from "../types";
import type { PlanGrouping } from "../scheduling/scheduleRows";
import type { TimelineZoomMode } from "../scheduling/timelineScale";

export type PlanColorMode = "status" | "phase" | "assignee" | "priority";

export type PlanFilters = {
  search: string;
  phaseId: string;
  assigneeId: string;
  status: string;
  priority: string;
  overdueOnly: boolean;
  blockedOnly: boolean;
  waitingOnClientOnly: boolean;
  milestonesOnly: boolean;
  unscheduledOnly: boolean;
  scheduleErrorsOnly: boolean;
  dateStart: string;
  dateEnd: string;
};

export type ProjectPlanViewState = {
  filters: PlanFilters;
  grouping: PlanGrouping;
  colorMode: PlanColorMode;
  zoomMode: TimelineZoomMode;
  showDependencies: boolean;
  showMilestones: boolean;
  showCompletedTasks: boolean;
  collapsedIds: string[];
  hierarchyWidth: number;
};

export const defaultPlanFilters: PlanFilters = {
  search: "",
  phaseId: "all",
  assigneeId: "all",
  status: "all",
  priority: "all",
  overdueOnly: false,
  blockedOnly: false,
  waitingOnClientOnly: false,
  milestonesOnly: false,
  unscheduledOnly: false,
  scheduleErrorsOnly: false,
  dateStart: "",
  dateEnd: ""
};

export const defaultPlanViewState: ProjectPlanViewState = {
  filters: defaultPlanFilters,
  grouping: "phase",
  colorMode: "status",
  zoomMode: "week",
  showDependencies: false,
  showMilestones: true,
  showCompletedTasks: true,
  collapsedIds: [],
  hierarchyWidth: 440
};

function storageKey(projectId: string) {
  return `accel-plan-view-${projectId}`;
}

export function useProjectPlanView(projectId: string, tasks: Task[]) {
  const validAssigneeIds = useMemo(() => new Set(tasks.map((task) => task.assigneeId).filter(Boolean) as string[]), [tasks]);
  const validPhaseIds = useMemo(() => new Set(tasks.map((task) => task.phaseId).filter(Boolean)), [tasks]);
  const [state, setState] = useState<ProjectPlanViewState>(() => readState(projectId));

  useEffect(() => {
    const next = readState(projectId);
    setState(sanitizeState(next, validPhaseIds, validAssigneeIds));
  }, [projectId, validAssigneeIds, validPhaseIds]);

  useEffect(() => {
    window.sessionStorage.setItem(storageKey(projectId), JSON.stringify(state));
  }, [projectId, state]);

  return [state, setState] as const;
}

function readState(projectId: string): ProjectPlanViewState {
  try {
    const stored = window.sessionStorage.getItem(storageKey(projectId));
    return stored ? { ...defaultPlanViewState, ...JSON.parse(stored) } : defaultPlanViewState;
  } catch {
    return defaultPlanViewState;
  }
}

function sanitizeState(state: ProjectPlanViewState, validPhaseIds: Set<string>, validAssigneeIds: Set<string>): ProjectPlanViewState {
  return {
    ...state,
    filters: {
      ...defaultPlanFilters,
      ...state.filters,
      phaseId: state.filters.phaseId === "all" || validPhaseIds.has(state.filters.phaseId) ? state.filters.phaseId : "all",
      assigneeId: state.filters.assigneeId === "all" || state.filters.assigneeId === "__unassigned" || validAssigneeIds.has(state.filters.assigneeId)
        ? state.filters.assigneeId
        : "all"
    },
    hierarchyWidth: Math.max(360, Math.min(760, state.hierarchyWidth || defaultPlanViewState.hierarchyWidth))
  };
}
