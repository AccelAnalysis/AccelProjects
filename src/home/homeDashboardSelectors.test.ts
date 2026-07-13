import { describe, expect, it } from "vitest";
import type { Milestone, Project, ProjectActivityEvent, ProjectState, Task, User } from "../types";
import { createHomeDashboardView, isTaskOverdue } from "./homeDashboardSelectors";

const today = "2026-07-11";
const admin = makeUser({ id: "admin", role: "admin", name: "Admin User" });
const contributor = makeUser({ id: "contributor", role: "contributor", name: "Contributor User" });
const otherUser = makeUser({ id: "other", role: "contributor", name: "Other User" });
const clientUser = makeUser({ id: "client_user", role: "client", name: "Client User" });

describe("home dashboard selectors", () => {
  it("calculates cross-project summary counts from active accessible data", () => {
    const state = makeState();
    const view = createHomeDashboardView({ projectState: state, role: "admin", userProfile: admin, today });

    expect(view.counts.activeProjects).toBe(3);
    expect(view.counts.atRiskProjects).toBe(2);
    expect(view.counts.overdueTasks).toBe(1);
    expect(view.counts.blockedTasks).toBe(1);
    expect(view.counts.waitingOnClientTasks).toBe(1);
    expect(view.counts.upcomingMilestones).toBe(3);
    expect(view.summaryMetrics.map((metric) => metric.id)).toEqual([
      "active-projects",
      "at-risk-projects",
      "overdue-tasks",
      "blocked-tasks",
      "waiting-on-client",
      "upcoming-milestones"
    ]);
  });

  it("excludes completed tasks and terminal projects from active operational counts", () => {
    const state = makeState({
      tasks: [
        task({ id: "done_overdue", projectId: "project_on_track", assigneeId: contributor.id, status: "done", dueDate: "2026-07-01" }),
        task({ id: "archived_overdue", projectId: "project_archived", assigneeId: contributor.id, dueDate: "2026-07-01" })
      ]
    });
    const view = createHomeDashboardView({ projectState: state, role: "admin", userProfile: admin, today });

    expect(view.counts.activeProjects).toBe(3);
    expect(view.counts.overdueTasks).toBe(0);
    expect(isTaskOverdue(task({ status: "done", dueDate: "2026-07-01" }), today)).toBe(false);
    expect(isTaskOverdue(task({ status: "in_progress", dueDate: today }), today)).toBe(false);
    expect(isTaskOverdue(task({ status: "in_progress", dueDate: "2026-07-10" }), today)).toBe(true);
  });

  it("excludes lifecycle-trashed tasks and milestones from every Home summary", () => {
    const lifecycle = { schemaVersion: 1 as const, state: "trashed" as const, retentionClass: "operational_30d" as const, legalHold: false, lastOperationId: "op_trash" };
    const state = makeState({
      projects: [project({ id: "project_on_track", health: "on_track" })],
      tasks: [task({ id: "trashed_overdue", projectId: "project_on_track", dueDate: "2026-07-01", lifecycle })],
      milestones: [milestone({ id: "trashed_milestone", projectId: "project_on_track", date: "2026-07-20", lifecycle })]
    });
    const view = createHomeDashboardView({ projectState: state, role: "admin", userProfile: admin, today });

    expect(view.counts.overdueTasks).toBe(0);
    expect(view.counts.upcomingMilestones).toBe(0);
    expect(view.attentionProjects).toEqual([]);
  });

  it("ranks personal priorities for the current user without including other users", () => {
    const state = makeState({
      tasks: [
        task({ id: "due_soon", title: "Due soon", assigneeId: contributor.id, dueDate: "2026-07-13", priority: "medium" }),
        task({ id: "overdue", title: "Overdue", assigneeId: contributor.id, dueDate: "2026-07-10", priority: "low" }),
        task({ id: "blocked", title: "Blocked", assigneeId: contributor.id, status: "blocked", dueDate: "2026-07-20", priority: "urgent" }),
        task({ id: "waiting", title: "Waiting", assigneeId: contributor.id, status: "waiting_on_client", dueDate: null }),
        task({ id: "done", title: "Done", assigneeId: contributor.id, status: "done", dueDate: "2026-07-09" }),
        task({ id: "other", title: "Other user", assigneeId: otherUser.id, dueDate: "2026-07-09" }),
        task({ id: "missing_date", title: "Missing date", assigneeId: contributor.id, dueDate: null })
      ]
    });
    const view = createHomeDashboardView({ projectState: state, role: "contributor", userProfile: contributor, today });

    expect(view.myPriorityTasks.map((item) => item.id)).toEqual(["overdue", "blocked", "due_soon", "waiting", "missing_date"]);
    expect(view.myPriorityTasks.find((item) => item.id === "missing_date")?.dueDate).toBeNull();
  });

  it("ranks blocked projects above at-risk projects and shows attention reasons", () => {
    const state = makeState({
      projects: [
        project({ id: "project_blocked", name: "Blocked Project", health: "blocked" }),
        project({ id: "project_at_risk", name: "At Risk Project", health: "at_risk" }),
        project({ id: "project_on_track", name: "On Track Project", health: "on_track" })
      ],
      tasks: [
        task({ id: "on_track_overdue", projectId: "project_on_track", dueDate: "2026-07-10" })
      ],
      milestones: []
    });
    const view = createHomeDashboardView({ projectState: state, role: "admin", userProfile: admin, today });

    expect(view.attentionProjects.map((item) => item.id)).toEqual(["project_blocked", "project_at_risk", "project_on_track"]);
    expect(view.attentionProjects[2].primaryReason).toBe("1 overdue task");
  });

  it("sorts upcoming incomplete milestones and indicates overdue dates", () => {
    const state = makeState({
      milestones: [
        milestone({ id: "later", name: "Later", date: "2026-07-30" }),
        milestone({ id: "complete", name: "Complete", date: "2026-07-12", status: "complete" }),
        milestone({ id: "overdue", name: "Overdue", date: "2026-07-01" }),
        milestone({ id: "outside", name: "Outside", date: "2026-09-01" })
      ]
    });
    const view = createHomeDashboardView({ projectState: state, role: "admin", userProfile: admin, today });

    expect(view.upcomingMilestones.map((item) => item.id)).toEqual(["overdue", "later"]);
    expect(view.upcomingMilestones[0].overdue).toBe(true);
  });

  it("filters and sorts recent meaningful activity with safe actor fallback", () => {
    const state = makeState({
      activityEvents: [
        event({ id: "older", type: "task_updated", createdAt: "2026-07-10T12:00:00.000Z", actorId: "missing" }),
        event({ id: "ignored", type: "email_logged", createdAt: "2026-07-12T12:00:00.000Z" }),
        event({ id: "newer", type: "project_file_updated", createdAt: "2026-07-11T12:00:00.000Z" })
      ]
    });
    const view = createHomeDashboardView({ projectState: state, role: "admin", userProfile: admin, today });

    expect(view.recentActivity.map((item) => item.id)).toEqual(["newer", "older"]);
    expect(view.recentActivity.find((item) => item.id === "older")?.actorName).toBe("Unknown actor");
  });

  it("limits contributor and client-safe views to appropriate accessible content", () => {
    const state = makeState({
      projectMembers: [
        { id: "member_contributor", projectId: "project_on_track", userId: contributor.id, role: "contributor", accessState: "active" },
        { id: "member_client", projectId: "project_on_track", userId: clientUser.id, role: "observer", accessState: "active" }
      ],
      tasks: [
        task({ id: "contributor_task", projectId: "project_on_track", assigneeId: contributor.id, dueDate: "2026-07-10" }),
        task({ id: "blocked_elsewhere", projectId: "project_blocked", status: "blocked", assigneeId: otherUser.id })
      ],
      activityEvents: [
        event({ id: "client_event", projectId: "project_on_track", type: "client_update_sent" }),
        event({ id: "internal_event", projectId: "project_on_track", type: "risk_updated" })
      ]
    });

    const contributorView = createHomeDashboardView({ projectState: state, role: "contributor", userProfile: contributor, today });
    const clientView = createHomeDashboardView({ projectState: state, role: "client", userProfile: clientUser, clientPreview: true, today });

    expect(contributorView.activeProjects.map((item) => item.id)).toEqual(["project_on_track"]);
    expect(contributorView.myPriorityTasks.map((item) => item.id)).toEqual(["contributor_task"]);
    expect(clientView.summaryMetrics.map((metric) => metric.id)).toEqual(["active-projects", "upcoming-milestones"]);
    expect(clientView.attentionProjects).toEqual([]);
    expect(clientView.recentActivity.map((item) => item.id)).toEqual(["client_event"]);
  });
});

function makeState(overrides: Partial<ProjectState> = {}): ProjectState {
  const baseProjects = [
    project({ id: "project_on_track", name: "On Track", health: "on_track", status: "active", clientId: "client_a" }),
    project({ id: "project_at_risk", name: "At Risk", health: "at_risk", status: "active", clientId: "client_b" }),
    project({ id: "project_blocked", name: "Blocked", health: "blocked", status: "planning", clientId: "client_a" }),
    project({ id: "project_archived", name: "Archived", health: "blocked", status: "archived", clientId: "client_a" })
  ];

  return {
    users: [admin, contributor, otherUser, clientUser],
    clients: [
      { id: "client_a", organizationId: "org", name: "Client A", contactName: "A", email: "a@example.com", phone: "555", status: "active" },
      { id: "client_b", organizationId: "org", name: "Client B", contactName: "B", email: "b@example.com", phone: "555", status: "active" }
    ],
    projects: baseProjects,
    projectMembers: [],
    phases: [],
    milestones: [
      milestone({ id: "soon", projectId: "project_on_track", date: "2026-07-20" }),
      milestone({ id: "at_risk_soon", projectId: "project_at_risk", date: "2026-07-18", status: "at_risk" }),
      milestone({ id: "blocked_soon", projectId: "project_blocked", date: "2026-07-22" })
    ],
    tasks: [
      task({ id: "overdue", projectId: "project_on_track", assigneeId: contributor.id, dueDate: "2026-07-10" }),
      task({ id: "blocked", projectId: "project_at_risk", assigneeId: otherUser.id, status: "blocked", dueDate: "2026-07-20" }),
      task({ id: "waiting", projectId: "project_blocked", assigneeId: otherUser.id, status: "waiting_on_client", dueDate: "2026-07-21" })
    ],
    taskDependencies: [],
    taskComments: [],
    risks: [],
    documents: [],
    metrics: [],
    activityEvents: [
      event({ id: "activity_task", type: "task_updated", createdAt: "2026-07-10T12:00:00.000Z" })
    ],
    projectCommunications: [],
    projectCalendarEvents: [],
    clientProgressReports: [],
    clientReportSnapshots: [],
    clientReportArtifacts: [],
    projectVersions: [],
    ...overrides
  };
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: "project_on_track",
    organizationId: "org",
    clientId: "client_a",
    name: "Project",
    summary: "Summary",
    status: "active",
    health: "on_track",
    priority: "medium",
    startDate: "2026-07-01",
    targetDate: "2026-08-01",
    budget: 1000,
    currency: "usd",
    ownerId: admin.id,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "task",
    projectId: "project_on_track",
    phaseId: "phase",
    title: "Task",
    description: "Task description",
    status: "in_progress",
    priority: "medium",
    assigneeId: contributor.id,
    startDate: "2026-07-01",
    dueDate: "2026-07-20",
    estimateHours: 4,
    completedAt: null,
    ...overrides
  };
}

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: "milestone",
    projectId: "project_on_track",
    name: "Milestone",
    date: "2026-07-20",
    status: "planned",
    ...overrides
  };
}

function event(overrides: Partial<ProjectActivityEvent> = {}): ProjectActivityEvent {
  return {
    id: "event",
    projectId: "project_on_track",
    actorId: admin.id,
    type: "task_updated",
    message: "Task updated.",
    metadata: {},
    createdAt: "2026-07-10T12:00:00.000Z",
    ...overrides
  };
}

function makeUser(overrides: Partial<User>): User {
  return {
    id: "user",
    organizationId: "org",
    name: "User",
    email: "user@example.com",
    role: "viewer",
    avatarInitials: "U",
    ...overrides
  };
}
