/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User as FirebaseUser } from "firebase/auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectPageProps } from "../App";
import type { ProjectCalendarEvent, ProjectCommunication, ProjectState, Task } from "../types";
import {
  createProjectCalendarDraft,
  createProjectCalendarEvent,
  createProjectCommunication,
  sendProjectCommunication
} from "../data/api";
import { MessagesPage, ProjectsPage, SettingsPage } from "./ProjectModulePages";

vi.mock("../data/api", async () => {
  const actual = await vi.importActual<typeof import("../data/api")>("../data/api");
  return {
    ...actual,
    createProjectCommunication: vi.fn(),
    sendProjectCommunication: vi.fn(),
    createProjectCalendarDraft: vi.fn(),
    createProjectCalendarEvent: vi.fn(),
    updateProjectCalendarEvent: vi.fn(),
    cancelProjectCalendarEvent: vi.fn()
  };
});

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

describe("MessagesPage", () => {
  it("opens compose email, previews, confirms, and shows accepted wording", async () => {
    const communication = makeCommunication();
    vi.mocked(createProjectCommunication).mockResolvedValueOnce(communication);
    vi.mocked(sendProjectCommunication).mockResolvedValueOnce({ communication });

    render(<MessagesPage {...makeProjectPageProps()} />);

    expect(screen.queryByText("Send Project Update")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Compose Email" }));

    expect(screen.getByRole("dialog", { name: "Compose Email" })).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toHaveValue("a@example.com");
    fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Here is the weekly update." } });
    fireEvent.click(screen.getByRole("button", { name: "Review Email" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm Send" }));

    await waitFor(() => expect(createProjectCommunication).toHaveBeenCalledWith("project_a", expect.objectContaining({ subject: "Alpha Build project update" })));
    expect(sendProjectCommunication).toHaveBeenCalledWith("project_a", "comm_1");
    expect(await screen.findAllByText(/Accepted by Microsoft 365 for delivery/)).toHaveLength(2);
  });

  it("opens schedule event, warns about invitations, and stores the scheduled event", async () => {
    const draft = makeCalendarEvent({ status: "draft" });
    const scheduled = makeCalendarEvent();
    vi.mocked(createProjectCalendarDraft).mockResolvedValueOnce(draft);
    vi.mocked(createProjectCalendarEvent).mockResolvedValueOnce(scheduled);

    render(<MessagesPage {...makeProjectPageProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Schedule Event" }));
    expect(screen.getByRole("dialog", { name: "Schedule Event" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review Event" }));
    expect(screen.getByText(/Outlook will send invitations/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm Schedule" }));

    await waitFor(() => expect(createProjectCalendarDraft).toHaveBeenCalledWith("project_a", expect.objectContaining({ title: "Alpha Build project meeting" })));
    expect(createProjectCalendarEvent).toHaveBeenCalledWith("project_a", "cal_1");
    expect(await screen.findByText("Outlook calendar event scheduled. Attendees receive invitations when included.")).toBeInTheDocument();
  });

  it("shows read-only behavior for viewers and keeps existing activity available", () => {
    render(<MessagesPage {...makeProjectPageProps({ canManage: false })} />);

    expect(screen.queryByRole("button", { name: "Compose Email" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Schedule Event" })).not.toBeInTheDocument();
    expect(screen.getByText(/only project managers and administrators/)).toBeInTheDocument();
    expect(screen.getByText("No project communications yet.")).toBeInTheDocument();
  });

  it("closes communication dialogs with Escape", () => {
    render(<MessagesPage {...makeProjectPageProps()} />);

    fireEvent.click(screen.getByRole("button", { name: "Compose Email" }));
    expect(screen.getByRole("dialog", { name: "Compose Email" })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Compose Email" })).not.toBeInTheDocument();
  });

  it("renders existing communication and Outlook controls", () => {
    render(<MessagesPage {...makeProjectPageProps({
      projectState: {
        ...projectState,
        projectCommunications: [makeCommunication()],
        projectCalendarEvents: [makeCalendarEvent()]
      }
    })} />);

    expect(screen.getByText("Project update")).toBeInTheDocument();
    expect(screen.getByText("Accepted by Microsoft 365 for delivery")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Project review in Outlook" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
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
  projectCommunications: [],
  projectCalendarEvents: [],
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

function makeCommunication(overrides: Partial<ProjectCommunication> = {}): ProjectCommunication {
  return {
    id: "comm_1",
    organizationId: "org",
    projectId: "project_a",
    channel: "email",
    direction: "outbound",
    audience: "client",
    visibility: "internal",
    status: "accepted",
    subject: "Project update",
    bodyText: "Body",
    toRecipients: [{ name: "A", email: "a@example.com" }],
    ccRecipients: [],
    bccRecipients: [],
    senderMailbox: "sender@example.com",
    provider: "microsoft_graph",
    sourceType: "manual_project_update",
    sourceId: null,
    attachmentRefs: [],
    idempotencyKey: "idem",
    createdBy: "user_1",
    createdAt: "2028-01-01T00:00:00.000Z",
    updatedBy: "user_1",
    updatedAt: "2028-01-01T00:00:00.000Z",
    sendRequestedAt: "2028-01-01T00:00:00.000Z",
    acceptedAt: "2028-01-01T00:00:00.000Z",
    failedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides
  };
}

function makeCalendarEvent(overrides: Partial<ProjectCalendarEvent> = {}): ProjectCalendarEvent {
  return {
    id: "cal_1",
    organizationId: "org",
    projectId: "project_a",
    title: "Project review",
    descriptionText: "Review",
    visibility: "internal",
    status: "scheduled",
    calendarOwnerEmail: "calendar@example.com",
    startDateTime: "2028-01-05T15:00:00.000Z",
    endDateTime: "2028-01-05T16:00:00.000Z",
    timeZone: "Eastern Standard Time",
    isAllDay: false,
    location: "Teams",
    attendees: [{ name: "A", email: "a@example.com" }],
    reminderMinutesBeforeStart: 15,
    relatedEntityType: "project",
    relatedEntityId: null,
    transactionId: "txn",
    graphEventId: "graph_1",
    graphICalUId: "ical",
    graphWebLink: "https://outlook.example/event",
    graphChangeKey: "ck",
    createdBy: "user_1",
    createdAt: "2028-01-01T00:00:00.000Z",
    updatedBy: "user_1",
    updatedAt: "2028-01-01T00:00:00.000Z",
    lastSyncedAt: "2028-01-01T00:00:00.000Z",
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides
  };
}
