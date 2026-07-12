import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Diamond,
  Filter,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import type { Milestone, Phase, Project, Task, TaskDependency, User } from "../../../types";
import { addDays, clampDateOnly, daysBetween, formatDateOnly, isDateOnly, todayDateOnly } from "../../../utils/dateOnly";
import { calculateScheduleRange } from "../../../utils/scheduleRange";
import { useProjectPlanView, defaultPlanFilters, type PlanColorMode, type PlanFilters } from "../../../hooks/useProjectPlanView";
import { buildScheduleRows, sortTasks, type PlanGrouping, type ScheduleRow } from "../../../scheduling/scheduleRows";
import { detectScheduleConflicts, hasFatalConflicts, type ScheduleConflict } from "../../../scheduling/scheduleConflicts";
import { dependencyExists, validateDependencies } from "../../../scheduling/dependencyGraph";
import { getTaskScheduleState, isScheduledTask, scheduleTaskAt, taskDurationDays } from "../../../scheduling/scheduleDates";
import {
  createTimelineScale,
  dateToX,
  generateTimelineHeaderTicks,
  xToDate,
  type TimelineScale,
  type TimelineZoomMode
} from "../../../scheduling/timelineScale";
import { taskStatusLabels } from "../ProjectWidgets";

const rowHeight = 48;
const headerHeight = 54;
const minTaskHitWidth = 10;

export const planRowHeight = rowHeight;

type PendingChange =
  | {
      type: "task";
      title: string;
      taskId: string;
      updates: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId">;
      conflicts: ScheduleConflict[];
      undo: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId">;
    }
  | {
      type: "milestone";
      title: string;
      milestoneId: string;
      updates: Partial<Milestone>;
      conflicts: ScheduleConflict[];
      undo: Partial<Milestone>;
    }
  | {
      type: "bulk";
      title: string;
      updates: Array<{ taskId: string; updates: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId" | "assigneeId" | "status" | "priority"> }>;
      conflicts: ScheduleConflict[];
      undoUpdates: Array<{ taskId: string; updates: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId" | "assigneeId" | "status" | "priority"> }>;
      message: string;
    };

type UndoCommand =
  | { label: string; run: () => Promise<void> };

type DragState = {
  taskId: string;
  mode: "move" | "resize-start" | "resize-end";
  originClientX: number;
  originStartDate: string;
  originDueDate: string;
  previewStartDate: string;
  previewDueDate: string;
};

type Props = {
  project: Project;
  phases: Phase[];
  tasks: Task[];
  milestones: Milestone[];
  dependencies: TaskDependency[];
  users: User[];
  canManageSchedule: boolean;
  canCreateTasks: boolean;
  canEditTask: (task: Task) => boolean;
  onOpenTask: (taskId: string) => void;
  onCreateTask: (task: Omit<Task, "id" | "completedAt">) => void;
  onUpdateTaskSchedule: (taskId: string, updates: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId">) => Promise<void>;
  onBatchUpdateTaskSchedules: (updates: Array<{ taskId: string; updates: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId" | "assigneeId" | "status" | "priority"> }>, activityMessage: string) => Promise<void>;
  onCreateMilestone: (milestone: Omit<Milestone, "id">) => Promise<Milestone | null>;
  onUpdateMilestone: (milestoneId: string, updates: Partial<Milestone>) => Promise<void>;
  onDeleteMilestone: (milestoneId: string) => Promise<void>;
  onCreateDependency: (dependency: Omit<TaskDependency, "id">) => Promise<TaskDependency | null>;
  onUpdateDependency: (dependencyId: string, updates: Partial<TaskDependency>) => Promise<void>;
  onDeleteDependency: (dependencyId: string) => Promise<void>;
};

export function PlanWorkspace({
  project,
  phases,
  tasks,
  milestones,
  dependencies,
  users,
  canManageSchedule,
  canCreateTasks,
  canEditTask,
  onOpenTask,
  onCreateTask,
  onUpdateTaskSchedule,
  onBatchUpdateTaskSchedules,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
  onCreateDependency,
  onUpdateDependency,
  onDeleteDependency
}: Props) {
  const [viewState, setViewState] = useProjectPlanView(project.id, tasks);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [undoCommand, setUndoCommand] = useState<UndoCommand | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [createMode, setCreateMode] = useState<"task" | "milestone" | null>(null);
  const [milestoneDraft, setMilestoneDraft] = useState({ name: "", date: project.startDate, status: "planned" as Milestone["status"] });
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [dependencyManagerExpanded, setDependencyManagerExpanded] = useState(false);
  const [hierarchyCollapsed, setHierarchyCollapsed] = useState(false);
  const [bulkShiftDays, setBulkShiftDays] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(900);
  const filterButtonRef = useRef<HTMLButtonElement | null>(null);
  const viewButtonRef = useRef<HTMLButtonElement | null>(null);
  const createButtonRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const hierarchyResizeRef = useRef<{ startX: number; width: number } | null>(null);
  const range = useMemo(() => calculateScheduleRange(project, phases, tasks, milestones), [project, phases, tasks, milestones]);
  const hierarchyWidth = hierarchyCollapsed ? 76 : viewState.hierarchyWidth;
  const scale = useMemo(() => createTimelineScale(viewState.zoomMode, range, viewportWidth), [range, viewState.zoomMode, viewportWidth]);
  const today = todayDateOnly();
  const todayVisible = today >= range.startDate && today <= range.endDate;
  const filtered = useMemo(() => filterPlanData(tasks, milestones, phases, users, viewState.filters, {
    showCompletedTasks: viewState.showCompletedTasks,
    showMilestones: viewState.showMilestones
  }), [milestones, phases, tasks, users, viewState.filters, viewState.showCompletedTasks, viewState.showMilestones]);
  const rowModel = useMemo(() => buildScheduleRows({
    phases,
    tasks: filtered.tasks,
    milestones: filtered.milestones,
    users,
    grouping: viewState.grouping,
    collapsedIds: new Set(viewState.collapsedIds),
    selectedTaskIds,
    canEditTask,
    canManageSchedule
  }), [canEditTask, canManageSchedule, filtered.milestones, filtered.tasks, phases, selectedTaskIds, users, viewState.collapsedIds, viewState.grouping]);
  const visibleTasks = useMemo(() => rowModel.filter((row): row is Extract<ScheduleRow, { type: "task" }> => row.type === "task").map((row) => row.task), [rowModel]);
  const visibleTaskIds = useMemo(() => new Set(visibleTasks.map((task) => task.id)), [visibleTasks]);
  const visibleTaskIdKey = [...visibleTaskIds].sort().join("|");
  const selectedDependencyTaskIds = useMemo(() => {
    if (selectedTaskIds.size === 0) {
      return null;
    }

    const related = new Set(selectedTaskIds);
    dependencies.forEach((dependency) => {
      if (selectedTaskIds.has(dependency.taskId)) {
        related.add(dependency.dependsOnTaskId);
      }
      if (selectedTaskIds.has(dependency.dependsOnTaskId)) {
        related.add(dependency.taskId);
      }
    });
    return related;
  }, [dependencies, selectedTaskIds]);
  const visibleDependencies = viewState.showDependencies
    ? dependencies.filter((dependency) => (
      visibleTaskIds.has(dependency.taskId)
      && visibleTaskIds.has(dependency.dependsOnTaskId)
      && (!selectedDependencyTaskIds || (selectedDependencyTaskIds.has(dependency.taskId) && selectedDependencyTaskIds.has(dependency.dependsOnTaskId)))
    ))
    : [];
  const hiddenDependencyCount = dependencies.length - visibleDependencies.length;
  const conflicts = useMemo(() => detectScheduleConflicts({ project, phases, tasks, milestones, dependencies }), [dependencies, milestones, phases, project, tasks]);

  useEffect(() => {
    setSelectedTaskIds(new Set());
    setDragState(null);
    setPendingChange(null);
    setUndoCommand(null);
    setFilterOpen(false);
    setViewOpen(false);
    setCreateMode(null);
  }, [project.id]);

  useEffect(() => {
    setSelectedTaskIds((current) => {
      const nextIds = [...current].filter((taskId) => visibleTaskIds.has(taskId));
      return nextIds.length === current.size ? current : new Set(nextIds);
    });
  }, [visibleTaskIdKey]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      setViewportWidth(Math.max(320, entry.contentRect.width - hierarchyWidth));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hierarchyWidth]);

  useEffect(() => {
    function move(event: globalThis.PointerEvent) {
      if (hierarchyResizeRef.current) {
        const nextWidth = hierarchyResizeRef.current.width + (event.clientX - hierarchyResizeRef.current.startX);
        setViewState((current) => ({ ...current, hierarchyWidth: Math.max(360, Math.min(760, nextWidth)) }));
        return;
      }

      if (!dragState) {
        return;
      }

      const dayDelta = Math.round((event.clientX - dragState.originClientX) / Math.max(scale.pixelsPerDay, 1));
      if (dragState.mode === "move") {
        setDragState({
          ...dragState,
          previewStartDate: addDays(dragState.originStartDate, dayDelta),
          previewDueDate: addDays(dragState.originDueDate, dayDelta)
        });
        return;
      }

      if (dragState.mode === "resize-start") {
        const previewStartDate = clampDateOnly(addDays(dragState.originStartDate, dayDelta), range.startDate, dragState.originDueDate);
        setDragState({ ...dragState, previewStartDate, previewDueDate: dragState.originDueDate });
        return;
      }

      const previewDueDate = clampDateOnly(addDays(dragState.originDueDate, dayDelta), dragState.originStartDate, range.endDate);
      setDragState({ ...dragState, previewStartDate: dragState.originStartDate, previewDueDate });
    }

    function up() {
      if (hierarchyResizeRef.current) {
        hierarchyResizeRef.current = null;
      }

      if (!dragState) {
        return;
      }

      const task = tasks.find((item) => item.id === dragState.taskId);
      if (task && (task.startDate !== dragState.previewStartDate || task.dueDate !== dragState.previewDueDate)) {
        proposeTaskChange(task, {
          startDate: dragState.previewStartDate,
          dueDate: dragState.previewDueDate
        }, dragState.mode === "move" ? "Move task" : "Resize task");
      }
      setDragState(null);
    }

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragState, range.endDate, range.startDate, scale.pixelsPerDay, setViewState, tasks]);

  function updateFilters(filters: Partial<PlanFilters>) {
    setViewState((current) => ({ ...current, filters: { ...current.filters, ...filters } }));
  }

  function clearFilter(key: keyof PlanFilters) {
    updateFilters({ [key]: defaultPlanFilters[key] } as Partial<PlanFilters>);
  }

  function setZoom(zoomMode: TimelineZoomMode) {
    const scroll = scrollRef.current;
    const previousCenterDate = scroll
      ? xToDate(Math.max(0, scroll.scrollLeft - hierarchyWidth + viewportWidth / 2), range, scale)
      : range.startDate;

    setViewState((current) => ({ ...current, zoomMode }));

    window.requestAnimationFrame(() => {
      const nextScale = createTimelineScale(zoomMode, range, viewportWidth);
      const nextCenterX = dateToX(previousCenterDate, range, nextScale);
      scroll?.scrollTo({ left: Math.max(0, nextCenterX - viewportWidth / 2 + hierarchyWidth), behavior: "smooth" });
    });
  }

  function scrollToday() {
    if (!todayVisible) {
      setNotice(`Today (${formatDateOnly(today)}) is outside this project schedule.`);
      return;
    }

    scrollRef.current?.scrollTo({
      left: Math.max(0, dateToX(today, range, scale) - viewportWidth / 2 + hierarchyWidth),
      behavior: "smooth"
    });
  }

  function toggleCollapse(id: string) {
    setViewState((current) => {
      const next = new Set(current.collapsedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { ...current, collapsedIds: [...next] };
    });
  }

  function toggleTask(taskId: string) {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function openTask(taskId: string) {
    onOpenTask(taskId);
  }

  function selectAllVisible() {
    setSelectedTaskIds(new Set(visibleTasks.map((task) => task.id)));
  }

  function proposeTaskChange(task: Task, updates: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId">, title: string) {
    const nextTasks = tasks.map((item) => item.id === task.id ? { ...item, ...updates } : item);
    const nextConflicts = detectScheduleConflicts({ project, phases, tasks: nextTasks, milestones, dependencies })
      .filter((conflict) => conflict.entityId === task.id || conflict.entityType === "dependency");
    setPendingChange({
      type: "task",
      title,
      taskId: task.id,
      updates,
      conflicts: nextConflicts,
      undo: { startDate: task.startDate, dueDate: task.dueDate, phaseId: task.phaseId }
    });
  }

  function proposeMilestoneChange(milestone: Milestone, updates: Partial<Milestone>, title: string) {
    const nextMilestones = milestones.map((item) => item.id === milestone.id ? { ...item, ...updates } : item);
    const nextConflicts = detectScheduleConflicts({ project, phases, tasks, milestones: nextMilestones, dependencies })
      .filter((conflict) => conflict.entityId === milestone.id);
    setPendingChange({ type: "milestone", title, milestoneId: milestone.id, updates, conflicts: nextConflicts, undo: { date: milestone.date, status: milestone.status, name: milestone.name } });
  }

  function proposeBulk(updates: PendingChange & { type: "bulk" }) {
    setPendingChange(updates);
  }

  async function commitPending() {
    if (!pendingChange || hasFatalConflicts(pendingChange.conflicts)) {
      return;
    }

    setSaving(true);
    try {
      if (pendingChange.type === "task") {
        await onUpdateTaskSchedule(pendingChange.taskId, pendingChange.updates);
        setUndoCommand({ label: "Undo task schedule change", run: () => onUpdateTaskSchedule(pendingChange.taskId, pendingChange.undo) });
      } else if (pendingChange.type === "milestone") {
        await onUpdateMilestone(pendingChange.milestoneId, pendingChange.updates);
        setUndoCommand({ label: "Undo milestone change", run: () => onUpdateMilestone(pendingChange.milestoneId, pendingChange.undo) });
      } else {
        await onBatchUpdateTaskSchedules(pendingChange.updates, pendingChange.message);
        setUndoCommand({ label: "Undo bulk schedule change", run: () => onBatchUpdateTaskSchedules(pendingChange.undoUpdates, `Undo: ${pendingChange.message}`) });
      }
      setPendingChange(null);
      setNotice("Schedule change saved.");
    } catch {
      setNotice("Schedule change could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function runUndo() {
    if (!undoCommand) {
      return;
    }

    setSaving(true);
    try {
      await undoCommand.run();
      setNotice(`${undoCommand.label} completed.`);
      setUndoCommand(null);
    } finally {
      setSaving(false);
    }
  }

  async function createMilestone() {
    if (!milestoneDraft.name.trim() || !isDateOnly(milestoneDraft.date)) {
      setNotice("Milestone needs a name and valid date.");
      return;
    }

    const created = await onCreateMilestone({
      projectId: project.id,
      name: milestoneDraft.name.trim(),
      date: milestoneDraft.date,
      status: milestoneDraft.status
    });

    if (created) {
      setMilestoneDraft({ name: "", date: created.date, status: "planned" });
      setSelectedMilestoneId(created.id);
    }
  }

  async function createDependency(taskId: string, dependsOnTaskId: string, type: TaskDependency["type"]) {
    const proposed: TaskDependency = { id: "new", taskId, dependsOnTaskId, type };
    const validation = validateDependencies(tasks, [...dependencies, proposed]);

    if (dependencyExists(dependencies, taskId, dependsOnTaskId, type) || validation.some((issue) => issue.severity === "fatal")) {
      setNotice(validation.find((issue) => issue.severity === "fatal")?.message ?? "Dependency already exists.");
      return;
    }

    const created = await onCreateDependency({ taskId, dependsOnTaskId, type });
    if (created) {
      setDependencyManagerExpanded(true);
      setUndoCommand({ label: "Undo dependency creation", run: () => onDeleteDependency(created.id) });
    }
  }

  function bulkShift() {
    const selected = tasks.filter((task): task is Task & { startDate: string; dueDate: string } => selectedTaskIds.has(task.id) && isScheduledTask(task));
    const updates = selected.map((task) => ({
      taskId: task.id,
      updates: { startDate: addDays(task.startDate, bulkShiftDays), dueDate: addDays(task.dueDate, bulkShiftDays) }
    }));
    const undoUpdates = selected.map((task) => ({
      taskId: task.id,
      updates: { startDate: task.startDate, dueDate: task.dueDate }
    }));
    const nextTasks = tasks.map((task) => {
      const update = updates.find((item) => item.taskId === task.id);
      return update ? { ...task, ...update.updates } : task;
    });

    proposeBulk({
      type: "bulk",
      title: "Bulk date shift",
      updates,
      undoUpdates,
      conflicts: detectScheduleConflicts({ project, phases, tasks: nextTasks, milestones, dependencies }),
      message: `Shifted ${updates.length} task schedules.`
    });
  }

  function bulkUnschedule() {
    const selected = tasks.filter((task) => selectedTaskIds.has(task.id));
    proposeBulk({
      type: "bulk",
      title: "Unschedule tasks",
      updates: selected.map((task) => ({ taskId: task.id, updates: { startDate: null, dueDate: null } })),
      undoUpdates: selected.map((task) => ({ taskId: task.id, updates: { startDate: task.startDate, dueDate: task.dueDate } })),
      conflicts: [],
      message: `Unscheduled ${selected.length} tasks.`
    });
  }

  function scheduleSelected(startDate: string) {
    const selected = tasks.filter((task) => selectedTaskIds.has(task.id));
    const updates = selected.map((task) => {
      const scheduled = scheduleTaskAt(task, startDate, taskDurationDays(task) || 5);
      return { taskId: task.id, updates: { startDate: scheduled.startDate, dueDate: scheduled.dueDate } };
    });
    const nextTasks = tasks.map((task) => {
      const update = updates.find((item) => item.taskId === task.id);
      return update ? { ...task, ...update.updates } : task;
    });

    proposeBulk({
      type: "bulk",
      title: "Schedule selected tasks",
      updates,
      undoUpdates: selected.map((task) => ({ taskId: task.id, updates: { startDate: task.startDate, dueDate: task.dueDate } })),
      conflicts: detectScheduleConflicts({ project, phases, tasks: nextTasks, milestones, dependencies }),
      message: `Scheduled ${selected.length} tasks.`
    });
  }

  const headers = generateTimelineHeaderTicks(range, scale);
  const rowCount = rowModel.length;
  const gridStops = headers
    .filter((tick) => tick.level === "minor")
    .map((tick) => `#edf2f7 ${Math.round(tick.positionPx)}px, transparent ${Math.round(tick.positionPx + 1)}px`)
    .join(", ");
  const timelineGridStyle = {
    height: rowCount * rowHeight,
    "--timeline-grid-lines": gridStops ? `linear-gradient(to right, ${gridStops})` : "none"
  } as CSSProperties;
  const selectedMilestone = selectedMilestoneId ? milestones.find((milestone) => milestone.id === selectedMilestoneId) : undefined;
  const completedTaskCount = tasks.filter((task) => task.status === "done").length;
  const progress = tasks.length > 0 ? Math.round((completedTaskCount / tasks.length) * 100) : 0;

  return (
    <div className="plan-workbench">
      <div className="plan-workbench-header">
        <div>
          <p className="eyebrow">Project Plan</p>
          <h2>Schedule Workbench</h2>
          <p>{visibleTasks.length} visible tasks · {filtered.milestones.length} milestones · {progress}% complete</p>
        </div>
        <div className="plan-workbench-actions">
          {canManageSchedule ? (
            <button className="secondary-button" type="button" onClick={() => setCreateMode("milestone")}>
              <Diamond size={16} aria-hidden="true" />
              Add Milestone
            </button>
          ) : null}
          {canCreateTasks ? (
            <button ref={createButtonRef} className="action-button" type="button" onClick={() => setCreateMode("task")}>
              <Plus size={16} aria-hidden="true" />
              Add Task
            </button>
          ) : null}
        </div>
      </div>
      <PlanToolbar
        filters={viewState.filters}
        grouping={viewState.grouping}
        colorMode={viewState.colorMode}
        zoomMode={viewState.zoomMode}
        showDependencies={viewState.showDependencies}
        showMilestones={viewState.showMilestones}
        showCompletedTasks={viewState.showCompletedTasks}
        phases={phases}
        users={users}
        matchingCount={visibleTasks.length + filtered.milestones.length}
        activeFilterCount={countActiveFilters(viewState.filters)}
        filterOpen={filterOpen}
        viewOpen={viewOpen}
        filterButtonRef={filterButtonRef}
        viewButtonRef={viewButtonRef}
        onFiltersChange={updateFilters}
        onClearFilter={clearFilter}
        onClearAll={() => setViewState((current) => ({ ...current, filters: defaultPlanFilters }))}
        onGroupingChange={(grouping) => setViewState((current) => ({ ...current, grouping }))}
        onColorModeChange={(colorMode) => setViewState((current) => ({ ...current, colorMode }))}
        onZoomChange={setZoom}
        onToggleDependencies={(showDependencies) => setViewState((current) => ({ ...current, showDependencies }))}
        onToggleMilestones={(showMilestones) => setViewState((current) => ({ ...current, showMilestones }))}
        onToggleCompletedTasks={(showCompletedTasks) => setViewState((current) => ({ ...current, showCompletedTasks }))}
        onToday={scrollToday}
        onPrevious={() => scrollRef.current?.scrollBy({ left: -viewportWidth * 0.8, behavior: "smooth" })}
        onNext={() => scrollRef.current?.scrollBy({ left: viewportWidth * 0.8, behavior: "smooth" })}
        onExpandAll={() => setViewState((current) => ({ ...current, collapsedIds: [] }))}
        onCollapseAll={() => setViewState((current) => ({ ...current, collapsedIds: rowModel.filter((row) => row.type === "phase" || row.type === "group").map((row) => row.id) }))}
        onFilterOpenChange={(open) => {
          setFilterOpen(open);
          if (!open) {
            filterButtonRef.current?.focus();
          }
        }}
        onViewOpenChange={(open) => {
          setViewOpen(open);
          if (!open) {
            viewButtonRef.current?.focus();
          }
        }}
      />

      {notice ? <div className="plan-status" role="status">{notice}<button className="link-button" type="button" onClick={() => setNotice("")}>Dismiss</button></div> : null}
      {undoCommand ? <button className="secondary-button undo-button" type="button" disabled={saving} onClick={() => void runUndo()}><RotateCcw size={16} aria-hidden="true" /> {undoCommand.label}</button> : null}
      {viewState.showDependencies && dependencies.length > 0 ? <div className="dependency-summary" aria-label={`${visibleDependencies.length} visible dependencies and ${hiddenDependencyCount} hidden dependencies`}>Dependencies: {visibleDependencies.length} visible · {hiddenDependencyCount} hidden</div> : null}
      {conflicts.length > 0 ? <ConflictSummary conflicts={conflicts} /> : null}

      {selectedTaskIds.size > 0 ? (
        <BulkActionBar
          selectedCount={selectedTaskIds.size}
          users={users}
          phases={phases}
          bulkShiftDays={bulkShiftDays}
          canManageSchedule={canManageSchedule}
          onBulkShiftDaysChange={setBulkShiftDays}
          onSelectAll={selectAllVisible}
          onClear={() => setSelectedTaskIds(new Set())}
          onShift={bulkShift}
          onUnschedule={bulkUnschedule}
          onSchedule={scheduleSelected}
          onBatchField={(updates, message) => proposeBulk({
            type: "bulk",
            title: message,
            updates: tasks.filter((task) => selectedTaskIds.has(task.id)).map((task) => ({ taskId: task.id, updates })),
            undoUpdates: tasks.filter((task) => selectedTaskIds.has(task.id)).map((task) => ({
              taskId: task.id,
              updates: { assigneeId: task.assigneeId, status: task.status, priority: task.priority, phaseId: task.phaseId }
            })),
            conflicts: [],
            message
          })}
        />
      ) : null}

      <div
        ref={scrollRef}
        data-plan-row-height={rowHeight}
        className={hierarchyCollapsed ? "plan-grid-scroll hierarchy-collapsed" : "plan-grid-scroll"}
        style={{ "--hierarchy-width": `${hierarchyWidth}px`, "--timeline-width": `${scale.timelineWidth}px` } as CSSProperties}
      >
        <div className="plan-grid" style={{ width: `${hierarchyWidth + scale.timelineWidth}px` }}>
          <div className="plan-hierarchy-header">
            <span>Work item</span>
            <span>Owner</span>
            <span>Dates</span>
            <span>Status</span>
            <button
              aria-label={hierarchyCollapsed ? "Expand work item pane" : "Collapse work item pane"}
              className="icon-button mini hierarchy-collapse-button"
              type="button"
              onClick={() => setHierarchyCollapsed((collapsed) => !collapsed)}
              title={hierarchyCollapsed ? "Expand work items" : "Collapse work items"}
            >
              {hierarchyCollapsed ? <PanelLeftOpen size={14} aria-hidden="true" /> : <PanelLeftClose size={14} aria-hidden="true" />}
            </button>
            <button
              aria-label="Resize hierarchy pane"
              className="hierarchy-resize-handle"
              type="button"
              disabled={hierarchyCollapsed}
              onPointerDown={(event) => {
                hierarchyResizeRef.current = { startX: event.clientX, width: viewState.hierarchyWidth };
              }}
            />
          </div>
          <div className="plan-timeline-header" ref={timelineRef}>
            {headers.map((tick) => (
              <span
                className={`plan-header-tick ${tick.level}${tick.visible ? "" : " unlabeled"}`}
                key={`${tick.level}-${tick.date}`}
                style={{ left: tick.positionPx, width: tick.widthPx }}
                aria-hidden={!tick.visible}
              >
                {tick.visible ? tick.label : ""}
              </span>
            ))}
            {todayVisible ? <span className="plan-today-line header" style={{ left: dateToX(today, range, scale) }}>Today</span> : null}
          </div>
          <div className="plan-hierarchy-body" style={{ height: rowCount * rowHeight }}>
            {rowModel.map((row, index) => (
              <HierarchyRow
                key={row.id}
                row={row}
                users={users}
                selectedTaskIds={selectedTaskIds}
                onToggleCollapse={toggleCollapse}
                onToggleTask={toggleTask}
                onOpenTask={openTask}
                rowTop={index * rowHeight}
                collapsed={hierarchyCollapsed}
              />
            ))}
          </div>
          <div className="plan-timeline-body" style={timelineGridStyle}>
            {todayVisible ? <span className="plan-today-line body" style={{ left: dateToX(today, range, scale), height: rowCount * rowHeight }} /> : null}
            <DependencyLayer rows={rowModel} dependencies={visibleDependencies} range={range} scale={scale} />
            {rowModel.map((row, index) => (
              <TimelineRow
                key={row.id}
                row={row}
                rowTop={index * rowHeight}
                range={range}
                scale={scale}
                colorMode={viewState.colorMode}
                phases={phases}
                users={users}
                dragState={dragState}
                onOpenTask={openTask}
                onSelectMilestone={setSelectedMilestoneId}
                onTaskPointerDown={(task, mode, event) => {
                  if (!canEditTask(task) || !isScheduledTask(task)) {
                    return;
                  }
                  event.preventDefault();
                  setDragState({
                    taskId: task.id,
                    mode,
                    originClientX: event.clientX,
                    originStartDate: task.startDate,
                    originDueDate: task.dueDate,
                    previewStartDate: task.startDate,
                    previewDueDate: task.dueDate
                  });
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <UnscheduledTray
        tasks={sortTasks(tasks.filter((task) => getTaskScheduleState(task) !== "scheduled"))}
        phases={phases}
        canEditTask={canEditTask}
        onOpenTask={openTask}
        onSchedule={(task, date) => proposeTaskChange(task, scheduleTaskAt(task, date, 5), "Schedule task")}
        onUpdatePhase={(task, phaseId) => proposeTaskChange(task, { phaseId }, "Move task to phase")}
      />

      <DependencyManager
        dependencies={dependencies}
        tasks={tasks}
        canManageSchedule={canManageSchedule}
        onOpenTask={openTask}
        onCreateDependency={createDependency}
        onUpdateDependency={onUpdateDependency}
        onDeleteDependency={onDeleteDependency}
        expanded={dependencyManagerExpanded}
        onExpandedChange={setDependencyManagerExpanded}
        onUndo={(dependency) => setUndoCommand({
          label: "Undo dependency removal",
          run: () => onCreateDependency({ taskId: dependency.taskId, dependsOnTaskId: dependency.dependsOnTaskId, type: dependency.type }).then(() => undefined)
        })}
      />

      {createMode === "task" && canCreateTasks ? (
        <CreateDrawer title="New task" onClose={() => {
          setCreateMode(null);
          createButtonRef.current?.focus();
        }}>
          <InlineTaskCreator projectId={project.id} phases={phases} users={users} onCreateTask={(task) => {
            onCreateTask(task);
            setCreateMode(null);
          }} />
        </CreateDrawer>
      ) : null}

      {createMode === "milestone" && canManageSchedule ? (
        <CreateDrawer title="New milestone" onClose={() => {
          setCreateMode(null);
          createButtonRef.current?.focus();
        }}>
          <form
            className="drawer-form"
            onSubmit={(event) => {
              event.preventDefault();
              void createMilestone().then(() => setCreateMode(null));
            }}
          >
            <input aria-label="Milestone name" placeholder="Milestone name" value={milestoneDraft.name} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, name: event.target.value })} />
            <input aria-label="Milestone date" type="date" value={milestoneDraft.date} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, date: event.target.value })} />
            <select aria-label="Milestone status" value={milestoneDraft.status} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, status: event.target.value as Milestone["status"] })}>
              <option value="planned">Planned</option>
              <option value="at_risk">At risk</option>
              <option value="complete">Complete</option>
            </select>
            <button className="action-button" type="submit"><Diamond size={16} aria-hidden="true" />Create Milestone</button>
          </form>
        </CreateDrawer>
      ) : null}

      {selectedMilestone ? (
        <MilestoneDetailPanel
          milestone={selectedMilestone}
          canEdit={canManageSchedule}
          onClose={() => setSelectedMilestoneId(null)}
          onUpdate={(updates) => proposeMilestoneChange(selectedMilestone, updates, "Update milestone")}
          onDelete={async () => {
            await onDeleteMilestone(selectedMilestone.id);
            setSelectedMilestoneId(null);
          }}
        />
      ) : null}

      {pendingChange ? (
        <ScheduleChangeDialog
          change={pendingChange}
          saving={saving}
          onCancel={() => setPendingChange(null)}
          onConfirm={() => void commitPending()}
        />
      ) : null}
    </div>
  );
}

function filterPlanData(
  tasks: Task[],
  milestones: Milestone[],
  phases: Phase[],
  users: User[],
  filters: PlanFilters,
  options: { showCompletedTasks: boolean; showMilestones: boolean }
) {
  const today = todayDateOnly();
  const normalizedSearch = filters.search.trim().toLowerCase();
  const userById = new Map(users.map((user) => [user.id, user]));
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));

  const filteredTasks = tasks.filter((task) => {
    const phase = phaseById.get(task.phaseId);
    const assignee = task.assigneeId ? userById.get(task.assigneeId) : undefined;
    const scheduleState = getTaskScheduleState(task);
    const matchesSearch = !normalizedSearch || `${task.title} ${task.description} ${phase?.name ?? ""} ${assignee?.name ?? ""}`.toLowerCase().includes(normalizedSearch);
    const matchesDateRange = (!filters.dateStart || (task.dueDate && task.dueDate >= filters.dateStart)) && (!filters.dateEnd || (task.startDate && task.startDate <= filters.dateEnd));

    return matchesSearch
      && (filters.phaseId === "all" || task.phaseId === filters.phaseId)
      && (filters.assigneeId === "all" || (filters.assigneeId === "__unassigned" ? !task.assigneeId : task.assigneeId === filters.assigneeId))
      && (filters.status === "all" || task.status === filters.status)
      && (filters.priority === "all" || task.priority === filters.priority)
      && (!filters.overdueOnly || (task.status !== "done" && Boolean(task.dueDate && task.dueDate < today)))
      && (!filters.blockedOnly || task.status === "blocked")
      && (!filters.waitingOnClientOnly || task.status === "waiting_on_client")
      && (!filters.unscheduledOnly || scheduleState === "unscheduled")
      && (!filters.scheduleErrorsOnly || scheduleState === "incomplete" || scheduleState === "invalid" || !phase)
      && (options.showCompletedTasks || task.status !== "done")
      && matchesDateRange
      && !filters.milestonesOnly;
  });

  const filteredMilestones = milestones.filter((milestone) => {
    const matchesSearch = !normalizedSearch || milestone.name.toLowerCase().includes(normalizedSearch);
    return options.showMilestones
      && matchesSearch
      && (filters.dateStart ? milestone.date >= filters.dateStart : true)
      && (filters.dateEnd ? milestone.date <= filters.dateEnd : true)
      && (!filters.unscheduledOnly && !filters.scheduleErrorsOnly)
      && (filters.milestonesOnly || filters.phaseId === "all");
  });

  return { tasks: filteredTasks, milestones: filteredMilestones };
}

function PlanToolbar({
  filters,
  grouping,
  colorMode,
  zoomMode,
  showDependencies,
  showMilestones,
  showCompletedTasks,
  phases,
  users,
  matchingCount,
  activeFilterCount,
  filterOpen,
  viewOpen,
  filterButtonRef,
  viewButtonRef,
  onFiltersChange,
  onClearFilter,
  onClearAll,
  onGroupingChange,
  onColorModeChange,
  onZoomChange,
  onToggleDependencies,
  onToggleMilestones,
  onToggleCompletedTasks,
  onToday,
  onPrevious,
  onNext,
  onExpandAll,
  onCollapseAll,
  onFilterOpenChange,
  onViewOpenChange
}: {
  filters: PlanFilters;
  grouping: PlanGrouping;
  colorMode: PlanColorMode;
  zoomMode: TimelineZoomMode;
  showDependencies: boolean;
  showMilestones: boolean;
  showCompletedTasks: boolean;
  phases: Phase[];
  users: User[];
  matchingCount: number;
  activeFilterCount: number;
  filterOpen: boolean;
  viewOpen: boolean;
  filterButtonRef: RefObject<HTMLButtonElement | null>;
  viewButtonRef: RefObject<HTMLButtonElement | null>;
  onFiltersChange: (filters: Partial<PlanFilters>) => void;
  onClearFilter: (key: keyof PlanFilters) => void;
  onClearAll: () => void;
  onGroupingChange: (grouping: PlanGrouping) => void;
  onColorModeChange: (colorMode: PlanColorMode) => void;
  onZoomChange: (mode: TimelineZoomMode) => void;
  onToggleDependencies: (showDependencies: boolean) => void;
  onToggleMilestones: (showMilestones: boolean) => void;
  onToggleCompletedTasks: (showCompletedTasks: boolean) => void;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onFilterOpenChange: (open: boolean) => void;
  onViewOpenChange: (open: boolean) => void;
}) {
  const activeChips = activeFilterChips(filters, phases, users);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      if (filterOpen) {
        onFilterOpenChange(false);
      }
      if (viewOpen) {
        onViewOpenChange(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filterOpen, onFilterOpenChange, onViewOpenChange, viewOpen]);

  return (
    <section className="plan-workbench-toolbar" aria-label="Plan controls">
      <div className="plan-toolbar-row">
        <label className="plan-search-field">
          <span className="sr-only">Search</span>
          <input value={filters.search} placeholder="Search tasks, phases, milestones, assignees" onChange={(event) => onFiltersChange({ search: event.target.value })} aria-label="Search" />
          {filters.search ? <button className="icon-button mini" type="button" aria-label="Clear search" onClick={() => onFiltersChange({ search: "" })}><X size={13} aria-hidden="true" /></button> : null}
        </label>
        <button ref={filterButtonRef} className="secondary-button" type="button" aria-expanded={filterOpen} onClick={() => onFilterOpenChange(!filterOpen)}>
          <Filter size={16} aria-hidden="true" />
          {activeFilterCount > 0 ? `Filter ${activeFilterCount}` : "Filter"}
        </button>
        <button className="secondary-button" type="button" onClick={onToday}><CalendarDays size={16} aria-hidden="true" />Today</button>
        <button className="secondary-button compact-icon-button" type="button" aria-label="Previous period" onClick={onPrevious}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <label className="toolbar-select-label">
          <span className="sr-only">Timeline zoom</span>
          <select aria-label="Timeline zoom" value={zoomMode} onChange={(event) => onZoomChange(event.target.value as TimelineZoomMode)}>
            <option value="hour">Hours</option>
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
            <option value="decade">Decade</option>
            <option value="century">Century</option>
            <option value="fit">Fit Project</option>
          </select>
        </label>
        <button className="secondary-button compact-icon-button" type="button" aria-label="Next period" onClick={onNext}>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <button ref={viewButtonRef} className="secondary-button" type="button" aria-expanded={viewOpen} onClick={() => onViewOpenChange(!viewOpen)}>
          <SlidersHorizontal size={16} aria-hidden="true" />
          View
        </button>
      </div>

      {filterOpen ? (
        <div className="plan-filter-drawer" role="dialog" aria-label="Plan filters">
          <div className="drawer-header compact">
            <div>
              <strong>Filters</strong>
              <span>{matchingCount} matching item{matchingCount === 1 ? "" : "s"}</span>
            </div>
            <button className="icon-button" type="button" onClick={() => onFilterOpenChange(false)} aria-label="Close filters"><X size={16} aria-hidden="true" /></button>
          </div>
          <div className="plan-filter-grid">
            <label>Phase
              <select value={filters.phaseId} onChange={(event) => onFiltersChange({ phaseId: event.target.value })}>
                <option value="all">All phases</option>
                {phases.map((phase, index) => <option key={phase.id} value={phase.id}>{index + 1}. {phase.name}</option>)}
              </select>
            </label>
            <label>Assignee
              <select value={filters.assigneeId} onChange={(event) => onFiltersChange({ assigneeId: event.target.value })}>
                <option value="all">All assignees</option>
                <option value="__unassigned">Unassigned</option>
                {users.filter((user) => user.role !== "client").map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </label>
            <label>Status
              <select value={filters.status} onChange={(event) => onFiltersChange({ status: event.target.value })}>
                <option value="all">All statuses</option>
                {Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Priority
              <select value={filters.priority} onChange={(event) => onFiltersChange({ priority: event.target.value })}>
                <option value="all">All priorities</option>
                {["low", "medium", "high", "urgent"].map((priority) => <option key={priority} value={priority}>{titleCase(priority)}</option>)}
              </select>
            </label>
            <label>Start
              <input type="date" value={filters.dateStart} onChange={(event) => onFiltersChange({ dateStart: event.target.value })} />
            </label>
            <label>End
              <input type="date" value={filters.dateEnd} onChange={(event) => onFiltersChange({ dateEnd: event.target.value })} />
            </label>
          </div>
          <div className="plan-toggle-row compact">
            {[
              ["overdueOnly", "Overdue"],
              ["blockedOnly", "Blocked"],
              ["waitingOnClientOnly", "Waiting on client"],
              ["milestonesOnly", "Milestones"],
              ["unscheduledOnly", "Unscheduled"],
              ["scheduleErrorsOnly", "Needs scheduling attention"]
            ].map(([key, label]) => (
              <label className="toggle-field" key={key}>
                <input type="checkbox" checked={Boolean(filters[key as keyof PlanFilters])} onChange={(event) => onFiltersChange({ [key]: event.target.checked } as Partial<PlanFilters>)} />
                {label}
              </label>
            ))}
          </div>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onClearAll}>Clear All</button>
            <button className="action-button" type="button" onClick={() => onFilterOpenChange(false)}>Done</button>
          </div>
        </div>
      ) : null}

      {viewOpen ? (
        <div className="plan-popover view-popover" role="dialog" aria-label="Plan view settings">
          <label>Group by
            <select value={grouping} onChange={(event) => onGroupingChange(event.target.value as PlanGrouping)}>
              <option value="phase">Phase</option>
              <option value="assignee">Assignee</option>
              <option value="status">Status</option>
              <option value="priority">Priority</option>
            </select>
          </label>
          <label>Color by
            <select value={colorMode} onChange={(event) => onColorModeChange(event.target.value as PlanColorMode)}>
              <option value="status">Status</option>
              <option value="phase">Phase</option>
              <option value="assignee">Assignee</option>
              <option value="priority">Priority</option>
            </select>
          </label>
          <label className="toggle-field"><input type="checkbox" checked={showDependencies} onChange={(event) => onToggleDependencies(event.target.checked)} />Show dependencies</label>
          <label className="toggle-field"><input type="checkbox" checked={showMilestones} onChange={(event) => onToggleMilestones(event.target.checked)} />Show milestones</label>
          <label className="toggle-field"><input type="checkbox" checked={showCompletedTasks} onChange={(event) => onToggleCompletedTasks(event.target.checked)} />Show completed tasks</label>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onExpandAll}>Expand All</button>
            <button className="secondary-button" type="button" onClick={onCollapseAll}>Collapse All</button>
          </div>
          <ColorLegend colorMode={colorMode} phases={phases} users={users} />
        </div>
      ) : null}

      {activeChips.length > 0 ? (
        <div className="active-filter-row">
          <span>{matchingCount} matching item{matchingCount === 1 ? "" : "s"}</span>
          {activeChips.map((chip) => (
            <button className="filter-chip" key={chip.key} type="button" onClick={() => onClearFilter(chip.key)}>
            {chip.label}
            <X size={13} aria-hidden="true" />
          </button>
          ))}
          <button className="link-button" type="button" onClick={onClearAll}>Clear All</button>
        </div>
      ) : null}
    </section>
  );
}

function activeFilterChips(filters: PlanFilters, phases: Phase[], users: User[]) {
  const phaseById = new Map(phases.map((phase, index) => [phase.id, `${index + 1}. ${phase.name}`]));
  const userById = new Map(users.map((user) => [user.id, user.name]));
  const chips: Array<{ key: keyof PlanFilters; label: string }> = [];

  if (filters.phaseId !== "all") {
    chips.push({ key: "phaseId", label: `Phase: ${phaseById.get(filters.phaseId) ?? "Unknown phase"}` });
  }
  if (filters.assigneeId !== "all") {
    chips.push({ key: "assigneeId", label: `Assignee: ${filters.assigneeId === "__unassigned" ? "Unassigned" : userById.get(filters.assigneeId) ?? "Unknown assignee"}` });
  }
  if (filters.status !== "all") {
    chips.push({ key: "status", label: `Status: ${taskStatusLabels[filters.status as Task["status"]] ?? titleCase(filters.status)}` });
  }
  if (filters.priority !== "all") {
    chips.push({ key: "priority", label: `Priority: ${titleCase(filters.priority)}` });
  }
  if (filters.dateStart) {
    chips.push({ key: "dateStart", label: `Start: ${formatDateOnly(filters.dateStart)}` });
  }
  if (filters.dateEnd) {
    chips.push({ key: "dateEnd", label: `End: ${formatDateOnly(filters.dateEnd)}` });
  }

  [
    ["overdueOnly", "Overdue"],
    ["blockedOnly", "Blocked"],
    ["waitingOnClientOnly", "Waiting on client"],
    ["milestonesOnly", "Milestones"],
    ["unscheduledOnly", "Unscheduled"],
    ["scheduleErrorsOnly", "Needs scheduling attention"]
  ].forEach(([key, label]) => {
    if (filters[key as keyof PlanFilters]) {
      chips.push({ key: key as keyof PlanFilters, label });
    }
  });

  return chips;
}

function countActiveFilters(filters: PlanFilters) {
  return activeFilterChips(filters, [], []).length;
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: Task["status"]) {
  if (status === "done") {
    return "success";
  }
  if (status === "blocked") {
    return "danger";
  }
  if (status === "waiting_on_client") {
    return "warning";
  }
  return "info";
}

function formatTaskDateRange(task: Task) {
  if (!task.startDate && !task.dueDate) {
    return "Unscheduled";
  }
  if (task.startDate && task.dueDate) {
    return task.startDate === task.dueDate ? formatDateOnly(task.startDate) : `${formatDateOnly(task.startDate)}-${formatDateOnly(task.dueDate)}`;
  }
  if (task.startDate) {
    return `Starts ${formatDateOnly(task.startDate)}`;
  }
  if (task.dueDate) {
    return `Due ${formatDateOnly(task.dueDate)}`;
  }
  return "Unscheduled";
}

function ColorLegend({ colorMode, phases, users }: { colorMode: PlanColorMode; phases: Phase[]; users: User[] }) {
  const labels = colorMode === "priority"
    ? ["low", "medium", "high", "urgent"]
    : colorMode === "status"
      ? Object.values(taskStatusLabels)
      : colorMode === "phase"
        ? phases.slice(0, 6).map((phase) => phase.name)
        : users.filter((user) => user.role !== "client").slice(0, 6).map((user) => user.name);

  return (
    <div className="plan-color-legend" aria-label={`Color mode: ${colorMode}`}>
      <strong>Color: {colorMode}</strong>
      {labels.map((label, index) => <span key={`${label}-${index}`}><i className={`legend-swatch color-${index % 8}`} />{label}</span>)}
    </div>
  );
}

function HierarchyRow({
  row,
  users,
  selectedTaskIds,
  onToggleCollapse,
  onToggleTask,
  onOpenTask,
  rowTop,
  collapsed
}: {
  row: ScheduleRow;
  users: User[];
  selectedTaskIds: Set<string>;
  onToggleCollapse: (id: string) => void;
  onToggleTask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  rowTop: number;
  collapsed: boolean;
}) {
  const taskOwner = row.type === "task" ? users.find((user) => user.id === row.task.assigneeId) : undefined;
  const selected = row.type === "task" && selectedTaskIds.has(row.task.id);
  const taskSubtitle = row.type === "task" ? `${row.phase?.name ?? "Unassigned Phase"} · ${getTaskScheduleState(row.task)}` : "";

  return (
    <div
      aria-label={row.accessibilityLabel}
      aria-selected={row.type === "task" ? selected : undefined}
      className={`plan-hierarchy-row row-${row.type}${selected ? " selected" : ""}${collapsed ? " compact" : ""}`}
      style={{ top: rowTop }}
      role="row"
    >
      {row.type === "phase" || row.type === "group" ? (
        <button className="plan-row-title group-title" type="button" onClick={() => onToggleCollapse(row.id)} aria-expanded={row.expanded}>
          {row.expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          <span>{row.type === "phase" ? `${row.phaseIndex + 1}. ${row.phase.name}` : row.label}</span>
          <small>
            {row.completedTaskCount} of {row.taskCount} complete
            {row.type === "phase" ? ` · ${formatDateOnly(row.phase.startDate)}-${formatDateOnly(row.phase.endDate)}` : ""}
            {row.warningCount > 0 ? ` · ${row.warningCount} warning${row.warningCount === 1 ? "" : "s"}` : ""}
          </small>
        </button>
      ) : null}
      {row.type === "task" ? (
        <>
          <input aria-label={`Select ${row.task.title}`} type="checkbox" checked={selectedTaskIds.has(row.task.id)} onChange={() => onToggleTask(row.task.id)} />
          <button className="plan-row-title task-title" type="button" onClick={() => onOpenTask(row.task.id)} title={`${row.task.title} — ${taskSubtitle}`}>
            <span>{row.task.title}</span>
            <small className="sr-only">{taskSubtitle}</small>
          </button>
          <span className="owner-pill" aria-label={`Owner ${taskOwner?.name ?? "Unassigned"}`}>{taskOwner?.avatarInitials ?? "UA"}</span>
          <span className="date-range-text">{formatTaskDateRange(row.task)}</span>
          <span className={`status-badge compact ${statusTone(row.task.status)}`}>{taskStatusLabels[row.task.status]}</span>
        </>
      ) : null}
      {row.type === "milestone" ? (
        <>
          <Diamond className="plan-row-type-icon" size={16} aria-hidden="true" />
          <span className="plan-row-title milestone-title" title={row.milestone.name}>{row.milestone.name}</span>
          <span className="milestone-type-cell">Milestone</span>
          <span className="milestone-date-cell">{formatDateOnly(row.milestone.date)}</span>
          <span className="milestone-status-cell" title={titleCase(row.milestone.status)}>{row.milestone.status.replace("_", " ")}</span>
        </>
      ) : null}
      {row.type === "empty" ? <span>{row.label}</span> : null}
    </div>
  );
}

function TimelineRow({
  row,
  rowTop,
  range,
  scale,
  colorMode,
  phases,
  users,
  dragState,
  onOpenTask,
  onSelectMilestone,
  onTaskPointerDown
}: {
  row: ScheduleRow;
  rowTop: number;
  range: ReturnType<typeof calculateScheduleRange>;
  scale: TimelineScale;
  colorMode: PlanColorMode;
  phases: Phase[];
  users: User[];
  dragState: DragState | null;
  onOpenTask: (taskId: string) => void;
  onSelectMilestone: (milestoneId: string) => void;
  onTaskPointerDown: (task: Task, mode: DragState["mode"], event: PointerEvent<HTMLElement>) => void;
}) {
  if (row.type === "phase") {
    const x = dateToX(row.phase.startDate, range, scale);
    const width = Math.max(minTaskHitWidth, dateToX(row.phase.endDate, range, scale) - x + scale.pixelsPerDay);
    return (
      <div className="plan-timeline-row phase" style={{ top: rowTop }}>
        <span className="plan-phase-bar" style={{ left: x, width }} title={`${row.phase.name}: ${row.phase.startDate} to ${row.phase.endDate}`} />
      </div>
    );
  }

  if (row.type === "task") {
    if (!isScheduledTask(row.task)) {
      return <div className="plan-timeline-row unscheduled" style={{ top: rowTop }}>Unscheduled or invalid dates</div>;
    }
    const preview = dragState?.taskId === row.task.id ? dragState : null;
    const startDate = preview?.previewStartDate ?? row.task.startDate;
    const dueDate = preview?.previewDueDate ?? row.task.dueDate;
    const x = dateToX(startDate, range, scale);
    const representedWidth = Math.max(1, dateToX(dueDate, range, scale) - x + scale.pixelsPerDay);
    const hitWidth = Math.max(minTaskHitWidth, representedWidth);

    return (
      <div className="plan-timeline-row task" style={{ top: rowTop }}>
        <button
          className={`plan-task-bar ${colorClass(row.task, colorMode, phases, users)}`}
          type="button"
          style={{ left: x, width: hitWidth }}
          onClick={() => onOpenTask(row.task.id)}
          onPointerDown={(event) => onTaskPointerDown(row.task, "move", event)}
          aria-label={`Open task: ${row.task.title}, ${startDate} through ${dueDate}`}
          aria-selected={row.selected}
          title={`${row.task.title}: ${startDate} to ${dueDate}`}
        >
          <span
            className="resize-handle start"
            aria-label={`Resize start for ${row.task.title}`}
            onPointerDown={(event) => {
              event.stopPropagation();
              onTaskPointerDown(row.task, "resize-start", event);
            }}
          />
          <span className="task-bar-label">{row.task.title}</span>
          <span
            className="resize-handle end"
            aria-label={`Resize due date for ${row.task.title}`}
            onPointerDown={(event) => {
              event.stopPropagation();
              onTaskPointerDown(row.task, "resize-end", event);
            }}
          />
        </button>
        {preview ? <span className="drag-preview-label" style={{ left: x + hitWidth + 6 }}>{startDate} - {dueDate}</span> : null}
      </div>
    );
  }

  if (row.type === "milestone" && isDateOnly(row.milestone.date)) {
    const x = dateToX(row.milestone.date, range, scale);
    return (
      <div className="plan-timeline-row milestone" style={{ top: rowTop }}>
        <button
          className={`milestone-marker status-${row.milestone.status}`}
          type="button"
          style={{ left: x }}
          onClick={() => onSelectMilestone(row.milestone.id)}
          aria-label={`Open milestone: ${row.milestone.name}, ${row.milestone.date}`}
          title={`${row.milestone.name}: ${row.milestone.date}`}
        >
          <Diamond size={18} aria-hidden="true" />
        </button>
        <span className="milestone-label" style={{ left: x + 16 }}>{row.milestone.name}</span>
      </div>
    );
  }

  return <div className="plan-timeline-row" style={{ top: rowTop }} />;
}

function DependencyLayer({
  rows,
  dependencies,
  range,
  scale
}: {
  rows: ScheduleRow[];
  dependencies: TaskDependency[];
  range: ReturnType<typeof calculateScheduleRange>;
  scale: TimelineScale;
}) {
  const taskRows = new Map<string, { row: Extract<ScheduleRow, { type: "task" }>; index: number }>();
  rows.forEach((row, index) => {
    if (row.type === "task") {
      taskRows.set(row.task.id, { row, index });
    }
  });

  return (
    <svg className="dependency-layer" width={scale.timelineWidth} height={rows.length * rowHeight} aria-hidden="true">
      {dependencies.flatMap((dependency) => {
        const from = taskRows.get(dependency.dependsOnTaskId);
        const to = taskRows.get(dependency.taskId);
        if (!from || !to || !isScheduledTask(from.row.task) || !isScheduledTask(to.row.task)) {
          return [];
        }
        const x1 = dependency.type === "start_to_start"
          ? dateToX(from.row.task.startDate, range, scale)
          : dateToX(from.row.task.dueDate, range, scale) + scale.pixelsPerDay;
        const x2 = dependency.type === "finish_to_finish"
          ? dateToX(to.row.task.dueDate, range, scale) + scale.pixelsPerDay
          : dateToX(to.row.task.startDate, range, scale);
        const y1 = from.index * rowHeight + rowHeight / 2;
        const y2 = to.index * rowHeight + rowHeight / 2;
        const midX = x1 + Math.max(24, (x2 - x1) / 2);
        const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
        return <path key={dependency.id} className={`dependency-path type-${dependency.type}`} d={path} markerEnd="url(#dependency-arrow)" />;
      })}
      <defs>
        <marker id="dependency-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </defs>
    </svg>
  );
}

function colorClass(task: Task, mode: PlanColorMode, phases: Phase[], users: User[]) {
  if (mode === "status") {
    return `status-${task.status}`;
  }

  const source = mode === "priority"
      ? task.priority
      : mode === "phase"
        ? task.phaseId
        : task.assigneeId ?? "unassigned";
  const index = Math.abs([...source].reduce((total, char) => total + char.charCodeAt(0), 0)) % 8;
  return `color-${index}`;
}

function BulkActionBar({
  selectedCount,
  users,
  phases,
  bulkShiftDays,
  canManageSchedule,
  onBulkShiftDaysChange,
  onSelectAll,
  onClear,
  onShift,
  onUnschedule,
  onSchedule,
  onBatchField
}: {
  selectedCount: number;
  users: User[];
  phases: Phase[];
  bulkShiftDays: number;
  canManageSchedule: boolean;
  onBulkShiftDaysChange: (days: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onShift: () => void;
  onUnschedule: () => void;
  onSchedule: (startDate: string) => void;
  onBatchField: (updates: Pick<Partial<Task>, "assigneeId" | "status" | "priority" | "phaseId">, message: string) => void;
}) {
  const [scheduleDate, setScheduleDate] = useState(todayDateOnly());

  return (
    <div className="bulk-action-bar">
      <strong>{selectedCount} selected</strong>
      <button className="secondary-button compact" type="button" onClick={onSelectAll}>Select visible</button>
      <button className="secondary-button compact" type="button" onClick={onClear}>Clear</button>
      {canManageSchedule && selectedCount > 0 ? (
        <>
          <label className="bulk-compact-field">
            <span>Shift</span>
            <input type="number" value={bulkShiftDays} onChange={(event) => onBulkShiftDaysChange(Number(event.target.value) || 0)} />
          </label>
          <button className="secondary-button compact" type="button" onClick={onShift}>Shift Dates</button>
          <label className="bulk-compact-field">
            <span>Schedule</span>
            <input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} />
          </label>
          <button className="secondary-button compact" type="button" onClick={() => onSchedule(scheduleDate)}>Schedule</button>
          <button className="secondary-button compact" type="button" onClick={onUnschedule}>Unschedule</button>
          <details className="bulk-more-menu">
            <summary className="secondary-button compact" aria-label="More bulk actions">
              <MoreHorizontal size={16} aria-hidden="true" />
              More
            </summary>
            <div className="bulk-more-popover">
              <select aria-label="Bulk assignee" onChange={(event) => event.target.value && onBatchField({ assigneeId: event.target.value === "__unassigned" ? null : event.target.value }, "Updated selected task assignees.")}>
                <option value="">Set assignee</option>
                <option value="__unassigned">Unassigned</option>
                {users.filter((user) => user.role !== "client").map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
              <select aria-label="Bulk status" onChange={(event) => event.target.value && onBatchField({ status: event.target.value as Task["status"] }, "Updated selected task statuses.")}>
                <option value="">Set status</option>
                {Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select aria-label="Bulk priority" onChange={(event) => event.target.value && onBatchField({ priority: event.target.value as Task["priority"] }, "Updated selected task priorities.")}>
                <option value="">Set priority</option>
                {["low", "medium", "high", "urgent"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
              </select>
              <select aria-label="Bulk phase" onChange={(event) => event.target.value && onBatchField({ phaseId: event.target.value }, "Moved selected tasks to phase.")}>
                <option value="">Move to phase</option>
                {phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
              </select>
            </div>
          </details>
        </>
      ) : null}
    </div>
  );
}

function InlineTaskCreator({
  projectId,
  phases,
  users,
  onCreateTask
}: {
  projectId: string;
  phases: Phase[];
  users: User[];
  onCreateTask: (task: Omit<Task, "id" | "completedAt">) => void;
}) {
  const [draft, setDraft] = useState({
    title: "",
    phaseId: phases[0]?.id ?? "",
    assigneeId: "",
    status: "not_started" as Task["status"],
    priority: "medium" as Task["priority"],
    startDate: todayDateOnly(),
    dueDate: addDays(todayDateOnly(), 4),
    unscheduled: false
  });

  return (
    <form
      className="inline-create-form plan-task-create"
      onSubmit={(event) => {
        event.preventDefault();
        if (!draft.title.trim() || !draft.phaseId) {
          return;
        }
        onCreateTask({
          projectId,
          phaseId: draft.phaseId,
          title: draft.title.trim(),
          description: "Created from Plan.",
          status: draft.status,
          priority: draft.priority,
          assigneeId: draft.assigneeId || null,
          startDate: draft.unscheduled ? null : draft.startDate,
          dueDate: draft.unscheduled ? null : draft.dueDate,
          estimateHours: 4
        });
        setDraft({ ...draft, title: "" });
      }}
    >
      <input aria-label="Task title" placeholder="New task title" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      <select aria-label="Task phase" value={draft.phaseId} onChange={(event) => setDraft({ ...draft, phaseId: event.target.value })}>
        {phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
      </select>
      <select aria-label="Task assignee" value={draft.assigneeId} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}>
        <option value="">Unassigned</option>
        {users.filter((user) => user.role !== "client").map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
      </select>
      <input aria-label="Task start date" disabled={draft.unscheduled} type="date" value={draft.startDate} onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
      <input aria-label="Task due date" disabled={draft.unscheduled} type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} />
      <label className="toggle-field"><input type="checkbox" checked={draft.unscheduled} onChange={(event) => setDraft({ ...draft, unscheduled: event.target.checked })} />Unscheduled</label>
      <button className="secondary-button" type="submit">Add Task</button>
    </form>
  );
}

function UnscheduledTray({
  tasks,
  phases,
  canEditTask,
  onOpenTask,
  onSchedule,
  onUpdatePhase
}: {
  tasks: Task[];
  phases: Phase[];
  canEditTask: (task: Task) => boolean;
  onOpenTask: (taskId: string) => void;
  onSchedule: (task: Task, date: string) => void;
  onUpdatePhase: (task: Task, phaseId: string) => void;
}) {
  const [dateByTask, setDateByTask] = useState<Record<string, string>>({});

  if (tasks.length === 0) {
    return null;
  }

  return (
    <section className="unscheduled-tray">
      <h2>Unscheduled and Schedule Errors</h2>
      <div className="unscheduled-list">
        {tasks.map((task) => (
          <article className="unscheduled-card" key={task.id}>
            <button className="link-button" type="button" onClick={() => onOpenTask(task.id)}>{task.title}</button>
            <span>{getTaskScheduleState(task)}</span>
            <select disabled={!canEditTask(task)} value={task.phaseId} onChange={(event) => onUpdatePhase(task, event.target.value)}>
              {phases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
            </select>
            <input aria-label={`Schedule ${task.title}`} disabled={!canEditTask(task)} type="date" value={dateByTask[task.id] ?? todayDateOnly()} onChange={(event) => setDateByTask({ ...dateByTask, [task.id]: event.target.value })} />
            <button className="secondary-button" type="button" disabled={!canEditTask(task)} onClick={() => onSchedule(task, dateByTask[task.id] ?? todayDateOnly())}>Schedule</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ConflictSummary({ conflicts }: { conflicts: ScheduleConflict[] }) {
  return (
    <div className="conflict-summary">
      <strong>{conflicts.length} schedule warning{conflicts.length === 1 ? "" : "s"}</strong>
      {conflicts.slice(0, 5).map((conflict, index) => (
        <span key={`${conflict.entityId}-${conflict.code}-${index}`} className={conflict.severity}>{conflict.message}</span>
      ))}
    </div>
  );
}

function CreateDrawer({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside className="detail-panel create-drawer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="detail-panel-header">
        <div>
          <p className="eyebrow">Create</p>
          <h2>{title}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label={`Close ${title}`}><X size={18} aria-hidden="true" /></button>
      </div>
      {children}
    </aside>
  );
}

function ScheduleChangeDialog({
  change,
  saving,
  onCancel,
  onConfirm
}: {
  change: PendingChange;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const fatal = hasFatalConflicts(change.conflicts);

  return (
    <aside className="schedule-dialog" role="dialog" aria-modal="true" aria-label={change.title}>
      <div className="detail-panel-header">
        <div>
          <p className="eyebrow">Schedule change</p>
          <h2>{change.title}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onCancel} aria-label="Cancel schedule change"><X size={18} aria-hidden="true" /></button>
      </div>
      {change.conflicts.length > 0 ? (
        <ConflictSummary conflicts={change.conflicts} />
      ) : (
        <p>No schedule conflicts detected.</p>
      )}
      {fatal ? <p className="error-message">Fatal conflicts must be corrected before saving.</p> : null}
      <div className="button-row">
        <button className="action-button" type="button" disabled={saving || fatal} onClick={onConfirm}><Check size={16} aria-hidden="true" />Save Change</button>
        <button className="secondary-button" type="button" disabled={saving} onClick={onCancel}>Cancel</button>
      </div>
    </aside>
  );
}

function MilestoneDetailPanel({
  milestone,
  canEdit,
  onClose,
  onUpdate,
  onDelete
}: {
  milestone: Milestone;
  canEdit: boolean;
  onClose: () => void;
  onUpdate: (updates: Partial<Milestone>) => void;
  onDelete: () => void;
}) {
  return (
    <aside className="detail-panel">
      <div className="detail-panel-header">
        <div>
          <p className="eyebrow">Milestone</p>
          <h2>{milestone.name}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close milestone detail"><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="detail-form">
        <label>
          Name
          <input disabled={!canEdit} value={milestone.name} onChange={(event) => onUpdate({ name: event.target.value })} />
        </label>
        <label>
          Date
          <input disabled={!canEdit} type="date" value={milestone.date} onChange={(event) => onUpdate({ date: event.target.value })} />
        </label>
        <label>
          Status
          <select disabled={!canEdit} value={milestone.status} onChange={(event) => onUpdate({ status: event.target.value as Milestone["status"] })}>
            <option value="planned">Planned</option>
            <option value="at_risk">At risk</option>
            <option value="complete">Complete</option>
          </select>
        </label>
      </div>
      {canEdit ? <button className="secondary-button danger-button" type="button" onClick={onDelete}><Trash2 size={16} aria-hidden="true" />Move Milestone to Trash</button> : null}
    </aside>
  );
}

function DependencyManager({
  dependencies,
  tasks,
  canManageSchedule,
  expanded,
  onExpandedChange,
  onOpenTask,
  onCreateDependency,
  onUpdateDependency,
  onDeleteDependency,
  onUndo
}: {
  dependencies: TaskDependency[];
  tasks: Task[];
  canManageSchedule: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onOpenTask: (taskId: string) => void;
  onCreateDependency: (taskId: string, dependsOnTaskId: string, type: TaskDependency["type"]) => Promise<void>;
  onUpdateDependency: (dependencyId: string, updates: Partial<TaskDependency>) => Promise<void>;
  onDeleteDependency: (dependencyId: string) => Promise<void>;
  onUndo: (dependency: TaskDependency) => void;
}) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const [draft, setDraft] = useState({
    taskId: tasks[0]?.id ?? "",
    dependsOnTaskId: tasks.find((task) => task.id !== tasks[0]?.id)?.id ?? "",
    type: "finish_to_start" as TaskDependency["type"]
  });
  const candidates = tasks.filter((task) => task.id !== draft.taskId);

  return (
    <section className="dependency-manager">
      <div className="dependency-manager-header">
        <button
          className="dependency-disclosure button-reset"
          type="button"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? <ChevronDown size={17} aria-hidden="true" /> : <ChevronRight size={17} aria-hidden="true" />}
          <span>
            <strong>Dependencies ({dependencies.length})</strong>
            <small>Manage dependency links when scheduling context is needed.</small>
          </span>
        </button>
      </div>
      {expanded ? (
        <div className="dependency-manager-body">
          {canManageSchedule && tasks.length > 1 ? (
          <form
            className="dependency-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              void onCreateDependency(draft.taskId, draft.dependsOnTaskId, draft.type);
            }}
          >
            <select aria-label="Dependency task" value={draft.taskId} onChange={(event) => {
              const taskId = event.target.value;
              const nextDependsOnTaskId = taskId === draft.dependsOnTaskId ? tasks.find((task) => task.id !== taskId)?.id ?? "" : draft.dependsOnTaskId;
              setDraft({ ...draft, taskId, dependsOnTaskId: nextDependsOnTaskId });
            }}>
              {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
            <select aria-label="Dependency predecessor" value={draft.dependsOnTaskId} onChange={(event) => setDraft({ ...draft, dependsOnTaskId: event.target.value })}>
              {candidates.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select>
            <select aria-label="Dependency type" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as TaskDependency["type"] })}>
              <option value="finish_to_start">Finish to start</option>
              <option value="start_to_start">Start to start</option>
              <option value="finish_to_finish">Finish to finish</option>
            </select>
            <button className="secondary-button" type="submit" disabled={!draft.taskId || !draft.dependsOnTaskId}>Add Dependency</button>
          </form>
          ) : null}
          {dependencies.length === 0 ? <p>No dependencies yet.</p> : (
            <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Depends on</th>
                  <th>Type</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {dependencies.map((dependency) => {
                  const task = taskById.get(dependency.taskId);
                  const predecessor = taskById.get(dependency.dependsOnTaskId);

                  return (
                    <tr key={dependency.id}>
                      <td><button className="link-button" type="button" onClick={() => dependency.taskId && onOpenTask(dependency.taskId)}>{task?.title ?? "Missing task"}</button></td>
                      <td><button className="link-button" type="button" onClick={() => dependency.dependsOnTaskId && onOpenTask(dependency.dependsOnTaskId)}>{predecessor?.title ?? "Missing predecessor"}</button></td>
                      <td>
                        <select
                          disabled={!canManageSchedule}
                          value={dependency.type}
                          onChange={(event) => void onUpdateDependency(dependency.id, { type: event.target.value as TaskDependency["type"] })}
                        >
                          <option value="finish_to_start">Finish to start</option>
                          <option value="start_to_start">Start to start</option>
                          <option value="finish_to_finish">Finish to finish</option>
                        </select>
                      </td>
                      <td>
                        <button
                          className="link-button"
                          disabled={!canManageSchedule}
                          type="button"
                          onClick={async () => {
                            await onDeleteDependency(dependency.id);
                            onUndo(dependency);
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
