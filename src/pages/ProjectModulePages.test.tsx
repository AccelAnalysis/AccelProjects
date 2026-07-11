/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectPageProps } from "../App";
import type { ProjectState, Task } from "../types";
import { ProjectsPage } from "./ProjectModulePages";

afterEach(() => {
  cleanup();
});

describe("ProjectsPage portfolio timeline", () => {
  it("shows projects as timeline bars while preserving the existing project cards", async () => {
    const onNavigate = vi.fn();
    const user = userEvent.setup();

    render(<ProjectsPage {...makeProjectPageProps({ onNavigate })} />);

    const timeline = screen.getByRole("region", { name: "Project portfolio timeline" });

    expect(within(timeline).getByRole("heading", { name: "Project Timeline" })).toBeInTheDocument();
    expect(within(timeline).getByRole("button", { name: "Alpha BuildClient A" })).toBeInTheDocument();
    expect(within(timeline).getByRole("button", { name: "Open project Alpha Build" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Alpha Build" })).toBeInTheDocument();

    await user.click(within(timeline).getByRole("button", { name: "Open project Beta Launch" }));

    expect(onNavigate).toHaveBeenCalledWith("/projects/project_b/plan");
  });
});

function makeProjectPageProps(overrides: Partial<ProjectPageProps> = {}): ProjectPageProps {
  return {
    projectState,
    selectedProjectId: "project_a",
    activeProjectTab: "plan",
    role: "project_manager",
    userProfile: projectState.users[0],
    canEdit: true,
    canManage: true,
    canAddTaskComments: true,
    canCreateTasks: true,
    canEditDocuments: true,
    canEditMetrics: true,
    canManageRisks: true,
    canManageSchedule: true,
    canViewInternal: true,
    clientPreview: false,
    canEditTask: () => true,
    canAddTaskComment: () => true,
    onOpenTask: vi.fn(),
    onUpdateTask: vi.fn(),
    onCreateTask: vi.fn(),
    onUpdateTaskSchedule: vi.fn().mockResolvedValue(undefined),
    onBatchUpdateTaskSchedules: vi.fn().mockResolvedValue(undefined),
    onCreateMilestone: vi.fn().mockResolvedValue(null),
    onUpdateMilestone: vi.fn().mockResolvedValue(undefined),
    onDeleteMilestone: vi.fn().mockResolvedValue(undefined),
    onCreateDependency: vi.fn().mockResolvedValue(null),
    onUpdateDependency: vi.fn().mockResolvedValue(undefined),
    onDeleteDependency: vi.fn().mockResolvedValue(undefined),
    onAddRisk: vi.fn(),
    onUpdateRisk: vi.fn(),
    onResetProjectState: vi.fn(),
    onSeedProjectState: vi.fn(),
    onProjectImported: vi.fn().mockResolvedValue(undefined),
    onProjectUpdated: vi.fn().mockResolvedValue(undefined),
    onExportProject: vi.fn().mockResolvedValue(undefined),
    onNavigate: vi.fn(),
    onProjectChange: vi.fn(),
    onNewTask: vi.fn(),
    ...overrides
  };
}

const projectState: ProjectState = {
  users: [
    {
      id: "user_1",
      organizationId: "org",
      name: "Owner One",
      email: "owner@example.com",
      role: "project_manager",
      avatarInitials: "OO"
    }
  ],
  clients: [
    { id: "client_a", organizationId: "org", name: "Client A", contactName: "A", email: "a@example.com", phone: "555", status: "active" },
    { id: "client_b", organizationId: "org", name: "Client B", contactName: "B", email: "b@example.com", phone: "555", status: "active" }
  ],
  projects: [
    {
      id: "project_a",
      organizationId: "org",
      clientId: "client_a",
      name: "Alpha Build",
      summary: "Alpha summary",
      status: "active",
      health: "on_track",
      priority: "medium",
      startDate: "2028-01-01",
      targetDate: "2028-02-01",
      budget: 1000,
      currency: "usd",
      ownerId: "user_1",
      createdAt: "2028-01-01T00:00:00.000Z",
      updatedAt: "2028-01-01T00:00:00.000Z"
    },
    {
      id: "project_b",
      organizationId: "org",
      clientId: "client_b",
      name: "Beta Launch",
      summary: "Beta summary",
      status: "active",
      health: "at_risk",
      priority: "high",
      startDate: "2028-01-15",
      targetDate: "2028-03-15",
      budget: 1000,
      currency: "usd",
      ownerId: "user_1",
      createdAt: "2028-01-01T00:00:00.000Z",
      updatedAt: "2028-01-01T00:00:00.000Z"
    }
  ],
  projectMembers: [],
  phases: [],
  milestones: [],
  tasks: [
    makeTask({ id: "task_a", projectId: "project_a", status: "done" }),
    makeTask({ id: "task_b", projectId: "project_b", status: "not_started" })
  ],
  taskDependencies: [],
  taskComments: [],
  risks: [],
  documents: [],
  metrics: [],
  activityEvents: [],
  projectVersions: []
};

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "task",
    projectId: "project_a",
    phaseId: null,
    title: "Task",
    description: "Description",
    status: "not_started",
    priority: "medium",
    assigneeId: null,
    startDate: "2028-01-01",
    dueDate: "2028-01-05",
    estimateHours: 1,
    completedAt: null,
    ...overrides
  };
}
