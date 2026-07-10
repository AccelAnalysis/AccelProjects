import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Diamond,
  Link2,
  RotateCcw,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
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
  const [milestoneDraft, setMilestoneDraft] = useState({ name: "", date: project.startDate, status: "planned" as Milestone["status"] });
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string | null>(null);
  const [bulkShiftDays, setBulkShiftDays] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(900);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const hierarchyResizeRef = useRef<{ startX: number; width: number } | null>(null);
  const range = useMemo(() => calculateScheduleRange(project, phases, tasks, milestones), [project, phases, tasks, milestones]);
  const scale = useMemo(() => createTimelineScale(viewState.zoomMode, range, viewportWidth), [range, viewState.zoomMode, viewportWidth]);
  const today = todayDateOnly();
  const todayVisible = today >= range.startDate && today <= range.endDate;
  const filtered = useMemo(() => filterPlanData(tasks, milestones, phases, users, viewState.filters), [milestones, phases, tasks, users, viewState.filters]);
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
  const visibleDependencies = dependencies.filter((dependency) => visibleTaskIds.has(dependency.taskId) && visibleTaskIds.has(dependency.dependsOnTaskId));
  const hiddenDependencyCount = dependencies.length - visibleDependencies.length;
  const conflicts = useMemo(() => detectScheduleConflicts({ project, phases, tasks, milestones, dependencies }), [dependencies, milestones, phases, project, tasks]);

  useEffect(() => {
    setSelectedTaskIds(new Set());
    setDragState(null);
    setPendingChange(null);
    setUndoCommand(null);
  }, [project.id]);

  useEffect(() => {
    setSelectedTaskIds((current) => new Set([...current].filter((taskId) => visibleTaskIds.has(taskId))));
  }, [visibleTaskIdKey, visibleTaskIds]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return undefined;
    }

    const observer = new ResizeObserver(([entry]) => {
      setViewportWidth(Math.max(320, entry.contentRect.width - viewState.hierarchyWidth));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewState.hierarchyWidth]);

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
      ? xToDate(Math.max(0, scroll.scrollLeft - viewState.hierarchyWidth + viewportWidth / 2), range, scale)
      : range.startDate;

    setViewState((current) => ({ ...current, zoomMode }));

    window.requestAnimationFrame(() => {
      const nextScale = createTimelineScale(zoomMode, range, viewportWidth);
      const nextCenterX = dateToX(previousCenterDate, range, nextScale);
      scroll?.scrollTo({ left: Math.max(0, nextCenterX - viewportWidth / 2 + viewState.hierarchyWidth), behavior: "smooth" });
    });
  }

  function scrollToday() {
    if (!todayVisible) {
      setNotice(`Today (${formatDateOnly(today)}) is outside this project schedule.`);
      return;
    }

    scrollRef.current?.scrollTo({
      left: Math.max(0, dateToX(today, range, scale) - viewportWidth / 2 + viewState.hierarchyWidth),
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
      setUndoCommand({ label: "Undo dependency creation", run: () => onDeleteDependency(created.id) });
    }
  }

  function bulkShift() {
    const selected = tasks.filter((task) => selectedTaskIds.has(task.id) && isScheduledTask(task));
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
  const selectedMilestone = selectedMilestoneId ? milestones.find((milestone) => milestone.id === selectedMilestoneId) : undefined;

  return (
    <div className="plan-workbench">
      <PlanToolbar
        filters={viewState.filters}
        grouping={viewState.grouping}
        colorMode={viewState.colorMode}
        zoomMode={viewState.zoomMode}
        phases={phases}
        users={users}
        matchingCount={visibleTasks.length + filtered.milestones.length}
        onFiltersChange={updateFilters}
        onClearFilter={clearFilter}
        onClearAll={() => setViewState((current) => ({ ...current, filters: defaultPlanFilters }))}
        onGroupingChange={(grouping) => setViewState((current) => ({ ...current, grouping }))}
        onColorModeChange={(colorMode) => setViewState((current) => ({ ...current, colorMode }))}
        onZoomChange={setZoom}
        onToday={scrollToday}
        onPrevious={() => scrollRef.current?.scrollBy({ left: -viewportWidth * 0.8, behavior: "smooth" })}
        onNext={() => scrollRef.current?.scrollBy({ left: viewportWidth * 0.8, behavior: "smooth" })}
        onExpandAll={() => setViewState((current) => ({ ...current, collapsedIds: [] }))}
        onCollapseAll={() => setViewState((current) => ({ ...current, collapsedIds: rowModel.filter((row) => row.type === "phase" || row.type === "group").map((row) => row.id) }))}
      />

      {notice ? <div className="plan-status" role="status">{notice}<button className="link-button" type="button" onClick={() => setNotice("")}>Dismiss</button></div> : null}
      {undoCommand ? <button className="secondary-button undo-button" type="button" disabled={saving} onClick={() => void runUndo()}><RotateCcw size={16} aria-hidden="true" /> {undoCommand.label}</button> : null}
      {hiddenDependencyCount > 0 ? <div className="plan-status">{hiddenDependencyCount} dependenc{hiddenDependencyCount === 1 ? "y is" : "ies are"} hidden by filters or collapsed rows.</div> : null}
      {conflicts.length > 0 ? <ConflictSummary conflicts={conflicts} /> : null}

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

      <div className="plan-create-row">
        {canCreateTasks ? (
          <InlineTaskCreator projectId={project.id} phases={phases} users={users} onCreateTask={onCreateTask} />
        ) : null}
        {canManageSchedule ? (
          <form
            className="inline-create-form plan-milestone-create"
            onSubmit={(event) => {
              event.preventDefault();
              void createMilestone();
            }}
          >
            <input aria-label="Milestone name" placeholder="Milestone name" value={milestoneDraft.name} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, name: event.target.value })} />
            <input aria-label="Milestone date" type="date" value={milestoneDraft.date} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, date: event.target.value })} />
            <select aria-label="Milestone status" value={milestoneDraft.status} onChange={(event) => setMilestoneDraft({ ...milestoneDraft, status: event.target.value as Milestone["status"] })}>
              <option value="planned">Planned</option>
              <option value="at_risk">At risk</option>
              <option value="complete">Complete</option>
            </select>
            <button className="secondary-button" type="submit"><Diamond size={16} aria-hidden="true" /> Add Milestone</button>
          </form>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="plan-grid-scroll"
        style={{ "--hierarchy-width": `${viewState.hierarchyWidth}px`, "--timeline-width": `${scale.timelineWidth}px` } as CSSProperties}
      >
        <div className="plan-grid" style={{ width: `${viewState.hierarchyWidth + scale.timelineWidth}px` }}>
          <div className="plan-hierarchy-header">
            <span>Work item</span>
            <button
              aria-label="Resize hierarchy pane"
              className="hierarchy-resize-handle"
              type="button"
              onPointerDown={(event) => {
                hierarchyResizeRef.current = { startX: event.clientX, width: viewState.hierarchyWidth };
              }}
            />
          </div>
          <div className="plan-timeline-header" ref={timelineRef}>
            {headers.map((tick) => (
              <span className={`plan-header-tick ${tick.level}`} key={`${tick.level}-${tick.date}`} style={{ left: tick.positionPx }}>
                {tick.label}
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
                phases={phases}
                allTasks={tasks}
                canManageSchedule={canManageSchedule}
                selectedTaskIds={selectedTaskIds}
                onToggleCollapse={toggleCollapse}
                onToggleTask={toggleTask}
                onOpenTask={onOpenTask}
                onProposeTaskChange={proposeTaskChange}
                onCreateDependency={createDependency}
                rowTop={index * rowHeight}
              />
            ))}
          </div>
          <div className="plan-timeline-body" style={{ height: rowCount * rowHeight }}>
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
                onOpenTask={onOpenTask}
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
                onProposeMilestoneChange={proposeMilestoneChange}
              />
            ))}
          </div>
        </div>
      </div>

      <UnscheduledTray
        tasks={sortTasks(tasks.filter((task) => getTaskScheduleState(task) !== "scheduled"))}
        phases={phases}
        canEditTask={canEditTask}
        onOpenTask={onOpenTask}
        onSchedule={(task, date) => proposeTaskChange(task, scheduleTaskAt(task, date, 5), "Schedule task")}
        onUpdatePhase={(task, phaseId) => proposeTaskChange(task, { phaseId }, "Move task to phase")}
      />

      <DependencyManager
        dependencies={dependencies}
        tasks={tasks}
        canManageSchedule={canManageSchedule}
        onOpenTask={onOpenTask}
        onUpdateDependency={onUpdateDependency}
        onDeleteDependency={onDeleteDependency}
        onUndo={(dependency) => setUndoCommand({
          label: "Undo dependency removal",
          run: () => onCreateDependency({ taskId: dependency.taskId, dependsOnTaskId: dependency.dependsOnTaskId, type: dependency.type }).then(() => undefined)
        })}
      />

      {selectedMilestone ? (
        <MilestoneDetailPanel
          milestone={selectedMilestone}
          canEdit={canManageSchedule}
          onClose={() => setSelectedMilestoneId(null)}
          onUpdate={(updates) => proposeMilestoneChange(selectedMilestone, updates, "Update milestone")}
          onDelete={async () => {
            if (window.confirm(`Delete milestone "${selectedMilestone.name}"?`)) {
              await onDeleteMilestone(selectedMilestone.id);
              setUndoCommand({ label: "Undo milestone deletion", run: () => onCreateMilestone({ projectId: selectedMilestone.projectId, name: selectedMilestone.name, date: selectedMilestone.date, status: selectedMilestone.status }).then(() => undefined) });
              setSelectedMilestoneId(null);
            }
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

function filterPlanData(tasks: Task[], milestones: Milestone[], phases: Phase[], users: User[], filters: PlanFilters) {
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
      && matchesDateRange
      && !filters.milestonesOnly;
  });

  const filteredMilestones = milestones.filter((milestone) => {
    const matchesSearch = !normalizedSearch || milestone.name.toLowerCase().includes(normalizedSearch);
    return matchesSearch
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
  phases,
  users,
  matchingCount,
  onFiltersChange,
  onClearFilter,
  onClearAll,
  onGroupingChange,
  onColorModeChange,
  onZoomChange,
  onToday,
  onPrevious,
  onNext,
  onExpandAll,
  onCollapseAll
}: {
  filters: PlanFilters;
  grouping: PlanGrouping;
  colorMode: PlanColorMode;
  zoomMode: TimelineZoomMode;
  phases: Phase[];
  users: User[];
  matchingCount: number;
  onFiltersChange: (filters: Partial<PlanFilters>) => void;
  onClearFilter: (key: keyof PlanFilters) => void;
  onClearAll: () => void;
  onGroupingChange: (grouping: PlanGrouping) => void;
  onColorModeChange: (colorMode: PlanColorMode) => void;
  onZoomChange: (mode: TimelineZoomMode) => void;
  onToday: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
}) {
  const activeChips = activeFilterChips(filters);

  return (
    <section className="plan-workbench-toolbar" aria-label="Plan controls">
      <div className="plan-filter-grid">
        <label>
          Search
          <input value={filters.search} placeholder="Tasks, milestones, phases, assignees" onChange={(event) => onFiltersChange({ search: event.target.value })} />
        </label>
        <label>
          Phase
          <select value={filters.phaseId} onChange={(event) => onFiltersChange({ phaseId: event.target.value })}>
            <option value="all">All phases</option>
            {phases.map((phase, index) => <option key={phase.id} value={phase.id}>{index + 1}. {phase.name}</option>)}
          </select>
        </label>
        <label>
          Assignee
          <select value={filters.assigneeId} onChange={(event) => onFiltersChange({ assigneeId: event.target.value })}>
            <option value="all">All assignees</option>
            <option value="__unassigned">Unassigned</option>
            {users.filter((user) => user.role !== "client").map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(event) => onFiltersChange({ status: event.target.value })}>
            <option value="all">All statuses</option>
            {Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Priority
          <select value={filters.priority} onChange={(event) => onFiltersChange({ priority: event.target.value })}>
            <option value="all">All priorities</option>
            {["low", "medium", "high", "urgent"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </select>
        </label>
        <label>
          Date start
          <input type="date" value={filters.dateStart} onChange={(event) => onFiltersChange({ dateStart: event.target.value })} />
        </label>
        <label>
          Date end
          <input type="date" value={filters.dateEnd} onChange={(event) => onFiltersChange({ dateEnd: event.target.value })} />
        </label>
      </div>
      <div className="plan-toggle-row">
        {[
          ["overdueOnly", "Overdue"],
          ["blockedOnly", "Blocked"],
          ["waitingOnClientOnly", "Waiting on client"],
          ["milestonesOnly", "Milestones"],
          ["unscheduledOnly", "Unscheduled"],
          ["scheduleErrorsOnly", "Schedule errors"]
        ].map(([key, label]) => (
          <label className="toggle-field" key={key}>
            <input type="checkbox" checked={Boolean(filters[key as keyof PlanFilters])} onChange={(event) => onFiltersChange({ [key]: event.target.checked } as Partial<PlanFilters>)} />
            {label}
          </label>
        ))}
      </div>
      <div className="plan-control-row">
        <label>
          Group
          <select value={grouping} onChange={(event) => onGroupingChange(event.target.value as PlanGrouping)}>
            <option value="phase">Phase</option>
            <option value="assignee">Assignee</option>
            <option value="status">Status</option>
            <option value="priority">Priority</option>
          </select>
        </label>
        <label>
          Color
          <select value={colorMode} onChange={(event) => onColorModeChange(event.target.value as PlanColorMode)}>
            <option value="status">Status</option>
            <option value="phase">Phase</option>
            <option value="assignee">Assignee</option>
            <option value="priority">Priority</option>
          </select>
        </label>
        <div className="segmented-control" aria-label="Timeline zoom">
          {(["day", "week", "month", "quarter", "fit"] as TimelineZoomMode[]).map((mode) => (
            <button className={mode === zoomMode ? "active" : ""} type="button" key={mode} onClick={() => onZoomChange(mode)}>
              {mode === "fit" ? "Fit Project" : mode}
            </button>
          ))}
        </div>
        <button className="secondary-button" type="button" onClick={onPrevious}>Previous Period</button>
        <button className="secondary-button" type="button" onClick={onNext}>Next Period</button>
        <button className="secondary-button" type="button" onClick={onToday}><CalendarDays size={16} aria-hidden="true" />Today</button>
        <button className="secondary-button" type="button" onClick={onExpandAll}>Expand All</button>
        <button className="secondary-button" type="button" onClick={onCollapseAll}>Collapse All</button>
      </div>
      <div className="active-filter-row">
        <span>{matchingCount} matching item{matchingCount === 1 ? "" : "s"}</span>
        {activeChips.map((chip) => (
          <button className="filter-chip" key={chip.key} type="button" onClick={() => onClearFilter(chip.key)}>
            {chip.label}
            <X size={13} aria-hidden="true" />
          </button>
        ))}
        {activeChips.length > 0 ? <button className="link-button" type="button" onClick={onClearAll}>Clear All</button> : null}
      </div>
      <ColorLegend colorMode={colorMode} phases={phases} users={users} />
    </section>
  );
}

function activeFilterChips(filters: PlanFilters) {
  return (Object.keys(filters) as Array<keyof PlanFilters>).flatMap((key) => {
    const value = filters[key];
    const defaultValue = defaultPlanFilters[key];
    if (value === defaultValue || value === "" || value === false) {
      return [];
    }
    return [{ key, label: `${key.replace(/Only$/, "").replace(/([A-Z])/g, " $1")}: ${String(value).replaceAll("_", " ")}` }];
  });
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
      {labels.map((label, index) => <span key={label}><i className={`legend-swatch color-${index % 8}`} />{label}</span>)}
    </div>
  );
}

function HierarchyRow({
  row,
  users,
  phases,
  allTasks,
  canManageSchedule,
  selectedTaskIds,
  onToggleCollapse,
  onToggleTask,
  onOpenTask,
  onProposeTaskChange,
  onCreateDependency,
  rowTop
}: {
  row: ScheduleRow;
  users: User[];
  phases: Phase[];
  allTasks: Task[];
  canManageSchedule: boolean;
  selectedTaskIds: Set<string>;
  onToggleCollapse: (id: string) => void;
  onToggleTask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  onProposeTaskChange: (task: Task, updates: Pick<Partial<Task>, "startDate" | "dueDate" | "phaseId">, title: string) => void;
  onCreateDependency: (taskId: string, dependsOnTaskId: string, type: TaskDependency["type"]) => Promise<void>;
  rowTop: number;
}) {
  return (
    <div className={`plan-hierarchy-row row-${row.type}`} style={{ top: rowTop }} role="row" aria-label={row.accessibilityLabel}>
      {row.type === "phase" || row.type === "group" ? (
        <button className="plan-row-title group-title" type="button" onClick={() => onToggleCollapse(row.id)} aria-expanded={row.expanded}>
          {row.expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
          <span>{row.type === "phase" ? `${row.phaseIndex + 1}. ${row.phase.name}` : row.label}</span>
          <small>{row.completedTaskCount}/{row.taskCount} complete · {row.warningCount} warning{row.warningCount === 1 ? "" : "s"}</small>
        </button>
      ) : null}
      {row.type === "task" ? (
        <>
          <input aria-label={`Select ${row.task.title}`} type="checkbox" checked={selectedTaskIds.has(row.task.id)} onChange={() => onToggleTask(row.task.id)} />
          <button className="plan-row-title task-title" type="button" onClick={() => onOpenTask(row.task.id)} title={row.task.title}>
            <span>{row.task.title}</span>
            <small>{row.phase?.name ?? "Unassigned Phase"} · {getTaskScheduleState(row.task)}</small>
          </button>
          <span>{users.find((user) => user.id === row.task.assigneeId)?.name ?? "Unassigned"}</span>
          <input aria-label={`Start date for ${row.task.title}`} disabled={!row.canEdit} type="date" value={row.task.startDate ?? ""} onChange={(event) => onProposeTaskChange(row.task, { startDate: event.target.value || null }, "Update task start")} />
          <input aria-label={`Due date for ${row.task.title}`} disabled={!row.canEdit} type="date" value={row.task.dueDate ?? ""} onChange={(event) => onProposeTaskChange(row.task, { dueDate: event.target.value || null }, "Update task due date")} />
          <span>{taskStatusLabels[row.task.status]}</span>
          {canManageSchedule ? <DependencyEditor task={row.task} allTasks={allTasks} onCreateDependency={onCreateDependency} /> : null}
        </>
      ) : null}
      {row.type === "milestone" ? (
        <>
          <Diamond size={16} aria-hidden="true" />
          <span className="plan-row-title">{row.milestone.name}</span>
          <span>Milestone</span>
          <span>{formatDateOnly(row.milestone.date)}</span>
          <span>{row.milestone.status.replace("_", " ")}</span>
        </>
      ) : null}
      {row.type === "empty" ? <span>{row.label}</span> : null}
    </div>
  );
}

function DependencyEditor({
  task,
  allTasks,
  onCreateDependency
}: {
  task: Task;
  allTasks?: Task[];
  onCreateDependency: (taskId: string, dependsOnTaskId: string, type: TaskDependency["type"]) => Promise<void>;
}) {
  const [target, setTarget] = useState("");
  const [type, setType] = useState<TaskDependency["type"]>("finish_to_start");
  const candidates = (allTasks ?? []).filter((item) => item.id !== task.id);

  if (candidates.length === 0) {
    return null;
  }

  return (
    <span className="dependency-inline-editor">
      <select aria-label={`Dependency target for ${task.title}`} value={target} onChange={(event) => setTarget(event.target.value)}>
        <option value="">Dependency</option>
        {candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}
      </select>
      <select aria-label="Dependency type" value={type} onChange={(event) => setType(event.target.value as TaskDependency["type"])}>
        <option value="finish_to_start">FS</option>
        <option value="start_to_start">SS</option>
        <option value="finish_to_finish">FF</option>
      </select>
      <button className="icon-button mini" type="button" disabled={!target} onClick={() => void onCreateDependency(task.id, target, type)} aria-label={`Create dependency from ${target} to ${task.title}`}>
        <Link2 size={13} aria-hidden="true" />
      </button>
    </span>
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
  onTaskPointerDown,
  onProposeMilestoneChange
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
  onTaskPointerDown: (task: Task, mode: DragState["mode"], event: PointerEvent<HTMLButtonElement>) => void;
  onProposeMilestoneChange: (milestone: Milestone, updates: Partial<Milestone>, title: string) => void;
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
          <span className="resize-handle start" aria-label={`Resize start for ${row.task.title}`} onPointerDown={(event) => onTaskPointerDown(row.task, "resize-start", event)} />
          <span className="task-bar-label">{row.task.status.replace("_", " ")}</span>
          <span className="resize-handle end" aria-label={`Resize due date for ${row.task.title}`} onPointerDown={(event) => onTaskPointerDown(row.task, "resize-end", event)} />
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
        <input
          className="milestone-date-input"
          aria-label={`Move milestone ${row.milestone.name}`}
          type="date"
          value={row.milestone.date}
          onChange={(event) => onProposeMilestoneChange(row.milestone, { date: event.target.value }, "Move milestone")}
        />
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
  const source = mode === "status"
    ? task.status
    : mode === "priority"
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
      <button className="secondary-button" type="button" onClick={onSelectAll}>Select visible</button>
      <button className="secondary-button" type="button" onClick={onClear}>Clear</button>
      {canManageSchedule && selectedCount > 0 ? (
        <>
          <label>
            Shift days
            <input type="number" value={bulkShiftDays} onChange={(event) => onBulkShiftDaysChange(Number(event.target.value) || 0)} />
          </label>
          <button className="secondary-button" type="button" onClick={onShift}>Shift Dates</button>
          <label>
            Schedule date
            <input type="date" value={scheduleDate} onChange={(event) => setScheduleDate(event.target.value)} />
          </label>
          <button className="secondary-button" type="button" onClick={() => onSchedule(scheduleDate)}>Schedule</button>
          <button className="secondary-button" type="button" onClick={onUnschedule}>Unschedule</button>
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
      {canEdit ? <button className="secondary-button danger-button" type="button" onClick={onDelete}><Trash2 size={16} aria-hidden="true" />Delete Milestone</button> : null}
    </aside>
  );
}

function DependencyManager({
  dependencies,
  tasks,
  canManageSchedule,
  onOpenTask,
  onUpdateDependency,
  onDeleteDependency,
  onUndo
}: {
  dependencies: TaskDependency[];
  tasks: Task[];
  canManageSchedule: boolean;
  onOpenTask: (taskId: string) => void;
  onUpdateDependency: (dependencyId: string, updates: Partial<TaskDependency>) => Promise<void>;
  onDeleteDependency: (dependencyId: string) => Promise<void>;
  onUndo: (dependency: TaskDependency) => void;
}) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  if (dependencies.length === 0) {
    return (
      <section className="dependency-manager">
        <h2>Dependencies</h2>
        <p>No dependencies yet.</p>
      </section>
    );
  }

  return (
    <section className="dependency-manager">
      <h2>Dependencies</h2>
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
    </section>
  );
}
