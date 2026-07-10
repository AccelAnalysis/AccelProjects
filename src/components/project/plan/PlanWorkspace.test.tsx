/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Milestone, Phase, Project, Task, TaskDependency, User } from "../../../types";
import { PlanWorkspace } from "./PlanWorkspace";

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const project = makeProject({ id: "project_1", name: "Website Launch" });
const phase = makePhase({ id: "phase_1", projectId: project.id, name: "Build" });
const user = makeUser({ id: "user_1", name: "Ada Lovelace" });
const firstTask = makeTask({
  id: "task_a",
  title: "First task",
  projectId: project.id,
  phaseId: phase.id,
  assigneeId: user.id,
  startDate: "2028-02-05",
  dueDate: "2028-02-08"
});
const secondTask = makeTask({
  id: "task_b",
  title: "Second task",
  projectId: project.id,
  phaseId: phase.id,
  startDate: "2028-02-10",
  dueDate: "2028-02-12"
});
const milestone = makeMilestone({ id: "milestone_1", projectId: project.id, name: "Kickoff", date: "2028-02-14" });

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(callback, 0));
  window.sessionStorage.clear();
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollBy = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PlanWorkspace rendered regressions", () => {
  it("starts simple with read-mode rows and no permanent creation or bulk forms", () => {
    renderPlan();

    expect(screen.getByRole("button", { name: "Filter" })).toBeInTheDocument();
    expect(screen.getByLabelText("Timeline zoom")).toHaveValue("week");
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Task title")).not.toBeInTheDocument();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Dependency target for First task")).not.toBeInTheDocument();
    expect(screen.getByText("Feb 5-Feb 8")).toBeInTheDocument();
  });

  it("uses filter disclosure with human-readable chips", async () => {
    const { user } = renderPlan();

    await user.click(screen.getByRole("button", { name: "Filter" }));
    await user.selectOptions(screen.getByLabelText("Phase"), "phase_1");
    await user.selectOptions(screen.getByLabelText("Status"), "done");

    expect(screen.getByRole("button", { name: "Filter 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Phase: 1\. Build/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Status: Complete/ })).toBeInTheDocument();
    expect(screen.queryByText(/phase_1/)).not.toBeInTheDocument();
  });

  it("toggles dependency display from view settings", async () => {
    const dependency: TaskDependency = {
      id: "dependency_1",
      taskId: "task_a",
      dependsOnTaskId: "task_b",
      type: "finish_to_start"
    };
    const { container, user } = renderPlan({ dependencies: [dependency] });

    expect(container.querySelectorAll(".dependency-path")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "View" }));
    await user.click(screen.getByLabelText("Show dependencies"));

    expect(screen.getByText("Dependencies: 1 visible · 0 hidden")).toBeInTheDocument();
    expect(container.querySelectorAll(".dependency-path")).toHaveLength(1);
  });

  it("opens contextual creation drawers from the New menu", async () => {
    const { user } = renderPlan();

    await user.click(screen.getByRole("button", { name: "New" }));
    await user.click(screen.getByRole("menuitem", { name: "New Task" }));

    expect(screen.getByRole("dialog", { name: "New task" })).toBeInTheDocument();
    expect(screen.getByLabelText("Task title")).toBeInTheDocument();
  });

  it("moves and resizes task bars through the rendered timeline confirmation flow", async () => {
    const { handlers, user } = renderPlan();

    dragTask(screen.getByLabelText(/^Open task: First task/), 100, 128);
    await user.click(await screen.findByRole("button", { name: /save change/i }));

    expect(handlers.onUpdateTaskSchedule).toHaveBeenCalledWith("task_a", {
      startDate: "2028-02-07",
      dueDate: "2028-02-10"
    });

    const resizeHandle = screen.getByLabelText("Resize due date for First task");
    dragTask(resizeHandle, 100, 128);
    await user.click(await screen.findByRole("button", { name: /save change/i }));

    expect(handlers.onUpdateTaskSchedule).toHaveBeenLastCalledWith("task_a", {
      startDate: "2028-02-05",
      dueDate: "2028-02-10"
    });
  });

  it("updates milestones with rendered confirmation before persistence", async () => {
    const { handlers, user } = renderPlan();

    await user.click(screen.getByLabelText(/^Open milestone: Kickoff/));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2028-02-16" } });
    await user.click(await screen.findByRole("button", { name: /save change/i }));

    expect(handlers.onUpdateMilestone).toHaveBeenCalledWith("milestone_1", { date: "2028-02-16" });
  });

  it("creates and removes dependencies from rendered dependency controls", async () => {
    const { handlers, user } = renderPlan();

    await user.selectOptions(screen.getByLabelText("Dependency task"), "task_a");
    await user.selectOptions(screen.getByLabelText("Dependency predecessor"), "task_b");
    await user.click(screen.getByRole("button", { name: "Add Dependency" }));

    expect(handlers.onCreateDependency).toHaveBeenCalledWith({
      taskId: "task_a",
      dependsOnTaskId: "task_b",
      type: "finish_to_start"
    });

    cleanup();
    const dependency: TaskDependency = {
      id: "dependency_1",
      taskId: "task_a",
      dependsOnTaskId: "task_b",
      type: "finish_to_start"
    };
    const next = renderPlan({ dependencies: [dependency] });

    await next.user.click(screen.getByRole("button", { name: "Remove" }));

    expect(next.handlers.onDeleteDependency).toHaveBeenCalledWith("dependency_1");
    expect(await screen.findByRole("button", { name: /undo dependency removal/i })).toBeInTheDocument();
  });

  it("applies bulk schedule changes and supports undo", async () => {
    const { handlers, user } = renderPlan();

    await user.click(screen.getByLabelText("Select First task"));
    await user.click(screen.getByRole("button", { name: "Shift Dates" }));
    await user.click(await screen.findByRole("button", { name: /save change/i }));

    expect(handlers.onBatchUpdateTaskSchedules).toHaveBeenCalledWith([
      { taskId: "task_a", updates: { startDate: "2028-02-06", dueDate: "2028-02-09" } }
    ], "Shifted 1 task schedules.");

    await user.click(screen.getByRole("button", { name: /undo bulk schedule change/i }));

    expect(handlers.onBatchUpdateTaskSchedules).toHaveBeenLastCalledWith([
      { taskId: "task_a", updates: { startDate: "2028-02-05", dueDate: "2028-02-08" } }
    ], "Undo: Shifted 1 task schedules.");
  });

  it("clears project-scoped transient state when switching projects", async () => {
    const { rerender, user } = renderPlan();
    const secondProject = makeProject({ id: "project_2", name: "Second Project" });
    const secondPhase = makePhase({ id: "phase_2", projectId: secondProject.id, name: "Discovery" });
    const secondProjectTask = makeTask({
      id: "task_c",
      title: "Second project task",
      projectId: secondProject.id,
      phaseId: secondPhase.id,
      startDate: "2028-03-04",
      dueDate: "2028-03-08"
    });

    await user.click(screen.getByLabelText("Select First task"));
    await user.type(screen.getByLabelText("Search"), "First");

    rerender(planElement({
      project: secondProject,
      phases: [secondPhase],
      tasks: [secondProjectTask],
      milestones: [],
      dependencies: []
    }));

    await waitFor(() => expect(screen.getByLabelText("Search")).toHaveValue(""));
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
    expect(screen.getByText("Second project task")).toBeInTheDocument();
  });

  it("renders permission restrictions for read-only schedule users", () => {
    renderPlan({
      canManageSchedule: false,
      canCreateTasks: false,
      canEditTask: () => false
    });

    expect(screen.queryByRole("button", { name: "Add Task" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Milestone" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Start date for First task")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Due date for First task")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Dependency target for First task")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Shift Dates" })).not.toBeInTheDocument();
  });

  it("keeps failed Firestore writes visible without creating undo state", async () => {
    const onUpdateTaskSchedule = vi.fn().mockRejectedValue(new Error("Firestore write failed."));
    const { user } = renderPlan({ onUpdateTaskSchedule });

    dragTask(screen.getByLabelText(/^Open task: First task/), 100, 128);
    await user.click(await screen.findByRole("button", { name: /save change/i }));

    expect(onUpdateTaskSchedule).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("Schedule change could not be saved.");
    expect(screen.getByRole("dialog", { name: "Move task" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /undo task schedule change/i })).not.toBeInTheDocument();
  });
});

function renderPlan(overrides: Partial<PlanProps> = {}) {
  const handlers = makeHandlers(overrides);
  const utils = render(planElement({ ...overrides, ...handlers }));

  return { ...utils, handlers, user: userEvent.setup() };
}

function planElement(overrides: Partial<PlanProps> = {}) {
  const handlers = makeHandlers(overrides);

  return (
    <PlanWorkspace
      project={overrides.project ?? project}
      phases={overrides.phases ?? [phase]}
      tasks={overrides.tasks ?? [firstTask, secondTask]}
      milestones={overrides.milestones ?? [milestone]}
      dependencies={overrides.dependencies ?? []}
      users={overrides.users ?? [user]}
      canManageSchedule={overrides.canManageSchedule ?? true}
      canCreateTasks={overrides.canCreateTasks ?? true}
      canEditTask={overrides.canEditTask ?? (() => true)}
      onOpenTask={handlers.onOpenTask}
      onCreateTask={handlers.onCreateTask}
      onUpdateTaskSchedule={handlers.onUpdateTaskSchedule}
      onBatchUpdateTaskSchedules={handlers.onBatchUpdateTaskSchedules}
      onCreateMilestone={handlers.onCreateMilestone}
      onUpdateMilestone={handlers.onUpdateMilestone}
      onDeleteMilestone={handlers.onDeleteMilestone}
      onCreateDependency={handlers.onCreateDependency}
      onUpdateDependency={handlers.onUpdateDependency}
      onDeleteDependency={handlers.onDeleteDependency}
    />
  );
}

function makeHandlers(overrides: Partial<PlanProps>) {
  return {
    onOpenTask: overrides.onOpenTask ?? vi.fn(),
    onCreateTask: overrides.onCreateTask ?? vi.fn(),
    onUpdateTaskSchedule: overrides.onUpdateTaskSchedule ?? vi.fn().mockResolvedValue(undefined),
    onBatchUpdateTaskSchedules: overrides.onBatchUpdateTaskSchedules ?? vi.fn().mockResolvedValue(undefined),
    onCreateMilestone: overrides.onCreateMilestone ?? vi.fn().mockResolvedValue(milestone),
    onUpdateMilestone: overrides.onUpdateMilestone ?? vi.fn().mockResolvedValue(undefined),
    onDeleteMilestone: overrides.onDeleteMilestone ?? vi.fn().mockResolvedValue(undefined),
    onCreateDependency: overrides.onCreateDependency ?? vi.fn().mockImplementation(async (dependency: Omit<TaskDependency, "id">) => ({ id: "dependency_created", ...dependency })),
    onUpdateDependency: overrides.onUpdateDependency ?? vi.fn().mockResolvedValue(undefined),
    onDeleteDependency: overrides.onDeleteDependency ?? vi.fn().mockResolvedValue(undefined)
  };
}

function dragTask(target: HTMLElement, startX: number, endX: number) {
  fireEvent.pointerDown(target, { clientX: startX, pointerId: 1 });
  fireEvent.pointerMove(window, { clientX: endX, pointerId: 1 });
  fireEvent.pointerUp(window, { clientX: endX, pointerId: 1 });
}

function makeProject(overrides: Partial<Project>): Project {
  return {
    id: "project",
    organizationId: "org",
    clientId: "client",
    name: "Project",
    summary: "Summary",
    status: "active",
    health: "on_track",
    priority: "medium",
    startDate: "2028-02-01",
    targetDate: "2028-03-01",
    budget: 1000,
    currency: "usd",
    ownerId: "user_1",
    createdAt: "2028-01-01T00:00:00.000Z",
    updatedAt: "2028-01-01T00:00:00.000Z",
    ...overrides
  };
}

function makePhase(overrides: Partial<Phase>): Phase {
  return {
    id: "phase",
    projectId: project.id,
    name: "Phase",
    status: "active",
    startDate: "2028-02-01",
    endDate: "2028-02-28",
    sortOrder: 1,
    ...overrides
  };
}

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "task",
    projectId: project.id,
    phaseId: phase.id,
    title: "Task",
    description: "Description",
    status: "not_started",
    priority: "medium",
    assigneeId: null,
    startDate: "2028-02-05",
    dueDate: "2028-02-08",
    estimateHours: 4,
    completedAt: null,
    ...overrides
  };
}

function makeMilestone(overrides: Partial<Milestone>): Milestone {
  return {
    id: "milestone",
    projectId: project.id,
    name: "Milestone",
    date: "2028-02-14",
    status: "planned",
    ...overrides
  };
}

function makeUser(overrides: Partial<User>): User {
  return {
    id: "user",
    organizationId: "org",
    name: "User",
    email: "user@example.com",
    role: "project_manager",
    avatarInitials: "U",
    ...overrides
  };
}

type PlanProps = Parameters<typeof PlanWorkspace>[0];
