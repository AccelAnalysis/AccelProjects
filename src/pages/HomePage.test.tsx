/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectPageProps } from "../App";
import { initialProjectState } from "../data/projectMockData";
import { HomePage } from "./HomePage";

afterEach(() => {
  cleanup();
});

describe("HomePage", () => {
  it("renders a cross-project command center instead of the legacy single-project dashboard", () => {
    renderHome();

    expect(screen.getByRole("heading", { name: "Welcome, Elena" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Projects" })).toBeInTheDocument();
    expect(screen.getByText("Active Projects")).toBeInTheDocument();
    expect(screen.getByText("My Priorities")).toBeInTheDocument();
    expect(screen.getByText("Projects Needing Attention")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upcoming Milestones" })).toBeInTheDocument();
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    expect(screen.queryByText("Team Capacity")).not.toBeInTheDocument();
    expect(screen.queryByText(/Phase:/)).not.toBeInTheDocument();
    expect(screen.queryByText("Employer survey assumptions are not yet approved")).not.toBeInTheDocument();
  });

  it("uses real navigation actions from the header and summary cards", async () => {
    const onNavigate = vi.fn();
    renderHome({ onNavigate });

    await userEvent.click(screen.getByRole("button", { name: "Open Projects" }));
    await userEvent.click(screen.getByRole("button", { name: /Active Projects:/ }));
    await userEvent.click(screen.getByRole("button", { name: "Import Project" }));

    expect(onNavigate).toHaveBeenCalledWith("/projects");
    expect(onNavigate).toHaveBeenCalledWith("/projects/import");
  });

  it("opens existing task detail behavior from personal priority rows", async () => {
    const onOpenTask = vi.fn();
    renderHome({ onOpenTask });

    await userEvent.click(screen.getByRole("button", { name: "Open task Prepare client review packet" }));

    expect(onOpenTask).toHaveBeenCalledWith("task_prepare_review_packet");
  });

  it("keeps client-safe preview focused on accessible project context", () => {
    const client = initialProjectState.users.find((user) => user.role === "client") ?? null;

    renderHome({
      role: "client",
      userProfile: client,
      canManage: false,
      canViewInternal: false,
      clientPreview: true
    });

    expect(screen.getByText("Your Projects")).toBeInTheDocument();
    expect(screen.queryByText("My Priorities")).not.toBeInTheDocument();
    expect(screen.queryByText("Projects Needing Attention")).not.toBeInTheDocument();
    expect(screen.queryByText("Overdue Open Tasks")).not.toBeInTheDocument();
    expect(screen.queryByText("Blocked Tasks")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import Project" })).not.toBeInTheDocument();
  });

  it("renders a useful empty state without fake metrics when there are no projects", () => {
    renderHome({
      projectState: {
        users: [],
        clients: [],
        projects: [],
        projectMembers: [],
        phases: [],
        milestones: [],
        tasks: [],
        taskDependencies: [],
        taskComments: [],
        risks: [],
        documents: [],
        metrics: [],
        activityEvents: [],
        projectCommunications: [],
        projectCalendarEvents: [],
        clientProgressReports: [],
        clientReportSnapshots: [],
        clientReportArtifacts: [],
        projectVersions: []
      }
    });

    expect(screen.getByRole("heading", { name: "No projects yet." })).toBeInTheDocument();
    expect(screen.queryByText("Active Projects")).not.toBeInTheDocument();
  });
});

function renderHome(overrides: Partial<ProjectPageProps> = {}) {
  const userProfile = overrides.userProfile ?? initialProjectState.users.find((user) => user.id === "user_elena") ?? null;
  const props: ProjectPageProps = {
    projectState: overrides.projectState ?? initialProjectState,
    selectedProjectId: overrides.selectedProjectId ?? "project_northstar_portal",
    activeProjectTab: overrides.activeProjectTab ?? "plan",
    firebaseUser: overrides.firebaseUser ?? firebaseUser,
    role: overrides.role ?? "admin",
    profileRole: overrides.profileRole ?? "admin",
    userProfile,
    developmentToolsEnabled: overrides.developmentToolsEnabled ?? false,
    canEdit: overrides.canEdit ?? true,
    canManage: overrides.canManage ?? true,
    canAddTaskComments: overrides.canAddTaskComments ?? true,
    canCreateTasks: overrides.canCreateTasks ?? true,
    canEditDocuments: overrides.canEditDocuments ?? true,
    canEditMetrics: overrides.canEditMetrics ?? true,
    canManageRisks: overrides.canManageRisks ?? true,
    canManageSchedule: overrides.canManageSchedule ?? true,
    canViewInternal: overrides.canViewInternal ?? true,
    clientPreview: overrides.clientPreview ?? false,
    canEditTask: overrides.canEditTask ?? (() => true),
    canAddTaskComment: overrides.canAddTaskComment ?? (() => true),
    onOpenTask: overrides.onOpenTask ?? vi.fn(),
    onUpdateTask: overrides.onUpdateTask ?? vi.fn(),
    onCreateTask: overrides.onCreateTask ?? vi.fn(),
    onUpdateTaskSchedule: overrides.onUpdateTaskSchedule ?? vi.fn().mockResolvedValue(undefined),
    onBatchUpdateTaskSchedules: overrides.onBatchUpdateTaskSchedules ?? vi.fn().mockResolvedValue(undefined),
    onCreateMilestone: overrides.onCreateMilestone ?? vi.fn().mockResolvedValue(null),
    onUpdateMilestone: overrides.onUpdateMilestone ?? vi.fn().mockResolvedValue(undefined),
    onDeleteMilestone: overrides.onDeleteMilestone ?? vi.fn().mockResolvedValue(undefined),
    onCreateDependency: overrides.onCreateDependency ?? vi.fn().mockResolvedValue(null),
    onUpdateDependency: overrides.onUpdateDependency ?? vi.fn().mockResolvedValue(undefined),
    onDeleteDependency: overrides.onDeleteDependency ?? vi.fn().mockResolvedValue(undefined),
    onAddRisk: overrides.onAddRisk ?? vi.fn(),
    onUpdateRisk: overrides.onUpdateRisk ?? vi.fn(),
    onResetProjectState: overrides.onResetProjectState ?? vi.fn(),
    onSeedProjectState: overrides.onSeedProjectState ?? vi.fn(),
    onProjectImported: overrides.onProjectImported ?? vi.fn().mockResolvedValue(undefined),
    onProjectUpdated: overrides.onProjectUpdated ?? vi.fn().mockResolvedValue(undefined),
    onExportProject: overrides.onExportProject ?? vi.fn().mockResolvedValue(undefined),
    onUpdateUserProfile: overrides.onUpdateUserProfile ?? vi.fn().mockResolvedValue(undefined),
    onSendPasswordReset: overrides.onSendPasswordReset ?? vi.fn().mockResolvedValue(undefined),
    onNavigate: overrides.onNavigate ?? vi.fn(),
    onProjectChange: overrides.onProjectChange ?? vi.fn(),
    onNewTask: overrides.onNewTask ?? vi.fn()
  };

  return render(<HomePage {...props} />);
}

const firebaseUser = {
  uid: "user_elena",
  email: "elena@example.com",
  emailVerified: true,
  displayName: "Elena Torres",
  providerData: [{ providerId: "password" }]
} as ProjectPageProps["firebaseUser"];
