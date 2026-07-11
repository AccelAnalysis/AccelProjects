/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User as FirebaseUser } from "firebase/auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectPageProps } from "../App";
import type { ProjectState, Task } from "../types";
import { ProjectsPage, SettingsPage } from "./ProjectModulePages";

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

describe("SettingsPage", () => {
  it("loads profile data, hides protected fields, and persists valid profile changes", async () => {
    const onUpdateUserProfile = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<SettingsPage {...makeProjectPageProps({ onUpdateUserProfile })} settingsTab="profile" />);

    expect(screen.getByLabelText("Authenticated email")).toHaveValue("owner@example.com");
    expect(screen.getByLabelText("Organization role")).toHaveValue("project manager");
    expect(screen.getByLabelText("Organization role")).toHaveAttribute("readonly");

    await user.clear(screen.getByLabelText("Display name"));
    await user.type(screen.getByLabelText("Display name"), "Updated Owner");
    await user.click(screen.getByRole("button", { name: "Save Profile" }));

    expect(onUpdateUserProfile).toHaveBeenCalledWith({
      name: "Updated Owner",
      avatarInitials: "OO"
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Profile saved.");
  });

  it("persists notification preferences and states delivery is not active yet", async () => {
    const onUpdateUserProfile = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(<SettingsPage {...makeProjectPageProps({ onUpdateUserProfile })} settingsTab="notifications" />);

    await user.click(screen.getByLabelText("Project-message notifications"));
    await user.click(screen.getByRole("button", { name: "Save Notification Preferences" }));

    expect(onUpdateUserProfile).toHaveBeenCalledWith({
      notificationPreferences: expect.objectContaining({
        projectMessages: true,
        emailDelivery: false
      })
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Delivery is not active");
  });

  it("shows access settings from the real role rather than preview role", () => {
    render(<SettingsPage {...makeProjectPageProps({ role: "client", profileRole: "project_manager" })} settingsTab="access" />);

    expect(screen.getByText("Real role")).toBeInTheDocument();
    expect(screen.getByText("project manager")).toBeInTheDocument();
    expect(screen.getByText("client")).toBeInTheDocument();
  });

  it("renders account routes as functional account information", () => {
    render(<SettingsPage {...makeProjectPageProps()} settingsTab="account" />);

    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Firebase UID")).toHaveValue("user_1");
    expect(screen.getByRole("button", { name: "Send Password Reset" })).toBeEnabled();
  });
});

function makeProjectPageProps(overrides: Partial<ProjectPageProps> = {}): ProjectPageProps {
  return {
    projectState,
    selectedProjectId: "project_a",
    activeProjectTab: "plan",
    firebaseUser,
    role: "project_manager",
    profileRole: "project_manager",
    userProfile: projectState.users[0],
    developmentToolsEnabled: false,
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
    onUpdateUserProfile: vi.fn().mockResolvedValue(undefined),
    onSendPasswordReset: vi.fn().mockResolvedValue(undefined),
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

const firebaseUser = {
  uid: "user_1",
  email: "owner@example.com",
  emailVerified: true,
  displayName: "Owner One",
  providerData: [{ providerId: "password" }]
} as FirebaseUser;

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "task",
    projectId: "project_a",
    phaseId: "phase_a",
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
