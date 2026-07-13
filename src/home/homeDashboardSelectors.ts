import { buildProjectPath } from "../routing/projectRoutes";
import type { Client, Milestone, Project, ProjectActivityEvent, ProjectState, Task, User, UserRole } from "../types";
import { addDays, compareDateOnly, daysBetween, isDateOnly, todayDateOnly } from "../utils/dateOnly";
import { isLifecycleActive } from "../lifecycle/policy";

export const homeUpcomingMilestoneWindowDays = 30;
const myPriorityLimit = 8;
const attentionProjectLimit = 6;
const upcomingMilestoneLimit = 6;
const recentActivityLimit = 8;

export type HomeMetricTone = "success" | "warning" | "danger" | "info";

export type HomeSummaryMetric = {
  id: string;
  label: string;
  value: number;
  helper: string;
  tone: HomeMetricTone;
  path?: string;
};

export type HomeProjectSummary = {
  id: string;
  name: string;
  clientName: string;
  health: Project["health"];
  status: Project["status"];
  progress: number;
  targetDate: string;
  path: string;
};

export type HomeTaskItem = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  clientName: string;
  dueDate: string | null;
  status: Task["status"];
  priority: Task["priority"];
  reason: string;
  path: string;
};

export type HomeAttentionProject = HomeProjectSummary & {
  reasons: string[];
  primaryReason: string;
};

export type HomeMilestoneItem = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  date: string;
  status: Milestone["status"];
  overdue: boolean;
  daysUntil: number;
  path: string;
};

export type HomeActivityItem = {
  id: string;
  message: string;
  type: string;
  projectId: string;
  projectName: string;
  actorName: string;
  createdAt: string;
  path: string;
};

export type HomeDashboardView = {
  activeProjects: HomeProjectSummary[];
  summaryMetrics: HomeSummaryMetric[];
  myPriorityTasks: HomeTaskItem[];
  attentionProjects: HomeAttentionProject[];
  upcomingMilestones: HomeMilestoneItem[];
  recentActivity: HomeActivityItem[];
  quickReturnProject: HomeProjectSummary | null;
  counts: {
    activeProjects: number;
    atRiskProjects: number;
    overdueTasks: number;
    blockedTasks: number;
    waitingOnClientTasks: number;
    upcomingMilestones: number;
  };
};

export type HomeDashboardInput = {
  projectState: ProjectState;
  role: UserRole;
  userProfile: User | null;
  selectedProjectId?: string;
  clientPreview?: boolean;
  today?: string;
};

const priorityRank: Record<Task["priority"], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};

export function createHomeDashboardView({
  projectState,
  role,
  userProfile,
  selectedProjectId,
  clientPreview = false,
  today = todayDateOnly()
}: HomeDashboardInput): HomeDashboardView {
  const accessibleProjects = getAccessibleProjects(projectState, role, userProfile);
  const accessibleProjectIds = new Set(accessibleProjects.map((project) => project.id));
  const clientById = new Map(projectState.clients.map((client) => [client.id, client]));
  const projectById = new Map(accessibleProjects.map((project) => [project.id, project]));
  const userById = new Map(projectState.users.map((user) => [user.id, user]));
  const tasks = projectState.tasks.filter((task) => accessibleProjectIds.has(task.projectId) && isLifecycleActive(task));
  const activeProjects = accessibleProjects.filter((project) => !isTerminalProject(project));
  const activeProjectIds = new Set(activeProjects.map((project) => project.id));
  const activeTasks = tasks.filter((task) => activeProjectIds.has(task.projectId));
  const openTasks = activeTasks.filter(isOpenTask);
  const overdueTasks = openTasks.filter((task) => isTaskOverdue(task, today));
  const blockedTasks = openTasks.filter((task) => task.status === "blocked");
  const waitingOnClientTasks = openTasks.filter((task) => task.status === "waiting_on_client");
  const atRiskProjects = activeProjects.filter((project) => project.health === "at_risk" || project.health === "blocked");
  const upcomingMilestones = getUpcomingMilestones(projectState.milestones, projectById, today);
  const activeProjectSummaries = activeProjects.map((project) => createProjectSummary(project, clientById, tasks));
  const canViewInternal = role !== "client" && !clientPreview;

  return {
    activeProjects: activeProjectSummaries,
    summaryMetrics: createSummaryMetrics({
      activeProjectCount: activeProjects.length,
      atRiskProjectCount: atRiskProjects.length,
      overdueTaskCount: overdueTasks.length,
      blockedTaskCount: blockedTasks.length,
      waitingOnClientTaskCount: waitingOnClientTasks.length,
      upcomingMilestoneCount: upcomingMilestones.length,
      canViewInternal
    }),
    myPriorityTasks: canViewInternal ? getMyPriorityTasks(openTasks, projectById, clientById, userProfile, today) : [],
    attentionProjects: canViewInternal ? getAttentionProjects(activeProjects, projectState, clientById, today) : [],
    upcomingMilestones: upcomingMilestones.slice(0, upcomingMilestoneLimit),
    recentActivity: getRecentActivity(projectState.activityEvents, projectById, userById, canViewInternal),
    quickReturnProject: selectedProjectId && activeProjectIds.has(selectedProjectId)
      ? createProjectSummary(projectById.get(selectedProjectId) as Project, clientById, tasks)
      : null,
    counts: {
      activeProjects: activeProjects.length,
      atRiskProjects: atRiskProjects.length,
      overdueTasks: overdueTasks.length,
      blockedTasks: blockedTasks.length,
      waitingOnClientTasks: waitingOnClientTasks.length,
      upcomingMilestones: upcomingMilestones.length
    }
  };
}

export function getAccessibleProjects(projectState: ProjectState, role: UserRole, userProfile: User | null) {
  const activeProjects = projectState.projects.filter(isLifecycleActive);
  if (role === "admin" || role === "project_manager" || role === "viewer") {
    return activeProjects;
  }

  if (!userProfile) {
    return [];
  }

  const memberProjectIds = new Set(projectState.projectMembers
    .filter((member) => member.userId === userProfile.id)
    .map((member) => member.projectId));

  if (role === "client") {
    return activeProjects.filter((project) => memberProjectIds.has(project.id));
  }

  const assignedProjectIds = new Set(projectState.tasks
    .filter((task) => task.assigneeId === userProfile.id)
    .map((task) => task.projectId));

  return activeProjects.filter((project) => (
    project.ownerId === userProfile.id
    || memberProjectIds.has(project.id)
    || assignedProjectIds.has(project.id)
  ));
}

export function isTerminalProject(project: Project) {
  return project.status === "complete" || project.status === "archived";
}

export function isOpenTask(task: Task) {
  return task.status !== "done";
}

export function isTaskOverdue(task: Task, today: string) {
  return isOpenTask(task) && isDateOnly(task.dueDate) && task.dueDate < today;
}

function createSummaryMetrics({
  activeProjectCount,
  atRiskProjectCount,
  overdueTaskCount,
  blockedTaskCount,
  waitingOnClientTaskCount,
  upcomingMilestoneCount,
  canViewInternal
}: {
  activeProjectCount: number;
  atRiskProjectCount: number;
  overdueTaskCount: number;
  blockedTaskCount: number;
  waitingOnClientTaskCount: number;
  upcomingMilestoneCount: number;
  canViewInternal: boolean;
}): HomeSummaryMetric[] {
  const metrics: HomeSummaryMetric[] = [
    {
      id: "active-projects",
      label: "Active Projects",
      value: activeProjectCount,
      helper: activeProjectCount === 1 ? "1 open workspace" : `${activeProjectCount} open workspaces`,
      tone: "info",
      path: "/projects"
    },
    {
      id: "upcoming-milestones",
      label: "Upcoming Milestones",
      value: upcomingMilestoneCount,
      helper: `Due in ${homeUpcomingMilestoneWindowDays} days`,
      tone: upcomingMilestoneCount > 0 ? "warning" : "success"
    }
  ];

  if (!canViewInternal) {
    return metrics;
  }

  return [
    metrics[0],
    {
      id: "at-risk-projects",
      label: "At Risk / Blocked",
      value: atRiskProjectCount,
      helper: atRiskProjectCount > 0 ? "Projects need intervention" : "All active projects on track",
      tone: atRiskProjectCount > 0 ? "warning" : "success",
      path: "/projects"
    },
    {
      id: "overdue-tasks",
      label: "Overdue Open Tasks",
      value: overdueTaskCount,
      helper: overdueTaskCount > 0 ? "Past due and not complete" : "No overdue open work",
      tone: overdueTaskCount > 0 ? "danger" : "success"
    },
    {
      id: "blocked-tasks",
      label: "Blocked Tasks",
      value: blockedTaskCount,
      helper: blockedTaskCount > 0 ? "Blocked work items" : "No blocked work",
      tone: blockedTaskCount > 0 ? "danger" : "success"
    },
    {
      id: "waiting-on-client",
      label: "Waiting on Client",
      value: waitingOnClientTaskCount,
      helper: waitingOnClientTaskCount > 0 ? "Client action needed" : "No client blockers",
      tone: waitingOnClientTaskCount > 0 ? "warning" : "success"
    },
    metrics[1]
  ];
}

function getMyPriorityTasks(
  tasks: Task[],
  projectById: Map<string, Project>,
  clientById: Map<string, Client>,
  userProfile: User | null,
  today: string
): HomeTaskItem[] {
  if (!userProfile) {
    return [];
  }

  return tasks
    .filter((task) => task.assigneeId === userProfile.id)
    .map((task) => {
      const project = projectById.get(task.projectId);
      const client = project ? clientById.get(project.clientId) : undefined;

      return {
        id: task.id,
        title: task.title,
        projectId: task.projectId,
        projectName: project?.name ?? "Project unavailable",
        clientName: client?.name ?? "Client unavailable",
        dueDate: isDateOnly(task.dueDate) ? task.dueDate : null,
        status: task.status,
        priority: task.priority,
        reason: taskPriorityReason(task, today),
        path: buildProjectPath(task.projectId, "plan"),
        rank: taskPriorityRank(task, today)
      };
    })
    .sort((left, right) => (
      left.rank - right.rank
      || compareDateOnly(left.dueDate, right.dueDate)
      || priorityRank[left.priority] - priorityRank[right.priority]
      || left.title.localeCompare(right.title)
    ))
    .slice(0, myPriorityLimit)
    .map(({ rank: _rank, ...item }) => item);
}

function taskPriorityRank(task: Task, today: string) {
  if (isTaskOverdue(task, today)) {
    return 0;
  }

  if (task.status === "blocked") {
    return 1;
  }

  if (task.dueDate === today) {
    return 2;
  }

  if (isDateOnly(task.dueDate) && task.dueDate <= addDays(today, 7)) {
    return 3;
  }

  if (task.status === "waiting_on_client") {
    return 4;
  }

  return 5;
}

function taskPriorityReason(task: Task, today: string) {
  if (isTaskOverdue(task, today)) {
    return "Overdue";
  }

  if (task.status === "blocked") {
    return "Blocked";
  }

  if (task.dueDate === today) {
    return "Due today";
  }

  if (isDateOnly(task.dueDate) && task.dueDate <= addDays(today, 7)) {
    return `Due in ${Math.max(1, daysBetween(today, task.dueDate))} days`;
  }

  if (task.status === "waiting_on_client") {
    return "Waiting on client";
  }

  return "Assigned work";
}

function getAttentionProjects(
  projects: Project[],
  projectState: ProjectState,
  clientById: Map<string, Client>,
  today: string
): HomeAttentionProject[] {
  return projects
    .map((project) => {
      const tasks = projectState.tasks.filter((task) => task.projectId === project.id && isLifecycleActive(task));
      const openTasks = tasks.filter(isOpenTask);
      const overdueCount = openTasks.filter((task) => isTaskOverdue(task, today)).length;
      const blockedCount = openTasks.filter((task) => task.status === "blocked").length;
      const waitingCount = openTasks.filter((task) => task.status === "waiting_on_client").length;
      const nearMilestone = projectState.milestones
        .filter((milestone) => milestone.projectId === project.id && isLifecycleActive(milestone) && milestone.status !== "complete" && isDateOnly(milestone.date) && milestone.date >= today && milestone.date <= addDays(today, 14))
        .sort((left, right) => left.date.localeCompare(right.date))[0];
      const reasons: string[] = [];

      if (project.health === "blocked") {
        reasons.push("Project marked blocked");
      } else if (project.health === "at_risk") {
        reasons.push("Project marked at risk");
      }

      if (overdueCount > 0) {
        reasons.push(`${overdueCount} overdue task${overdueCount === 1 ? "" : "s"}`);
      }
      if (blockedCount > 0) {
        reasons.push(`${blockedCount} blocked task${blockedCount === 1 ? "" : "s"}`);
      }
      if (waitingCount > 0) {
        reasons.push("Waiting on client");
      }
      if (nearMilestone) {
        const daysUntil = daysBetween(today, nearMilestone.date);
        reasons.push(daysUntil === 0 ? "Milestone due today" : `Milestone due in ${daysUntil} days`);
      }

      return {
        ...createProjectSummary(project, clientById, tasks),
        reasons,
        primaryReason: reasons[0] ?? "",
        rank: attentionProjectRank(project, overdueCount, blockedCount, waitingCount, Boolean(nearMilestone))
      };
    })
    .filter((project) => project.reasons.length > 0)
    .sort((left, right) => (
      left.rank - right.rank
      || left.targetDate.localeCompare(right.targetDate)
      || left.name.localeCompare(right.name)
    ))
    .slice(0, attentionProjectLimit)
    .map(({ rank: _rank, ...project }) => project);
}

function attentionProjectRank(project: Project, overdueCount: number, blockedCount: number, waitingCount: number, hasNearMilestone: boolean) {
  if (project.health === "blocked") {
    return 0;
  }
  if (project.health === "at_risk") {
    return 1;
  }
  if (overdueCount > 0) {
    return 2;
  }
  if (blockedCount > 0) {
    return 3;
  }
  if (waitingCount > 0) {
    return 4;
  }
  return hasNearMilestone ? 5 : 6;
}

function getUpcomingMilestones(milestones: Milestone[], projectById: Map<string, Project>, today: string): HomeMilestoneItem[] {
  const windowEnd = addDays(today, homeUpcomingMilestoneWindowDays);

  return milestones
    .filter((milestone) => (
      milestone.status !== "complete"
      && isLifecycleActive(milestone)
      && isDateOnly(milestone.date)
      && milestone.date <= windowEnd
      && projectById.has(milestone.projectId)
      && !isTerminalProject(projectById.get(milestone.projectId) as Project)
    ))
    .map((milestone) => {
      const project = projectById.get(milestone.projectId);

      return {
        id: milestone.id,
        name: milestone.name,
        projectId: milestone.projectId,
        projectName: project?.name ?? "Project unavailable",
        date: milestone.date,
        status: milestone.status,
        overdue: milestone.date < today,
        daysUntil: daysBetween(today, milestone.date),
        path: buildProjectPath(milestone.projectId, "plan")
      };
    })
    .sort((left, right) => left.date.localeCompare(right.date) || left.name.localeCompare(right.name));
}

function getRecentActivity(
  events: ProjectActivityEvent[],
  projectById: Map<string, Project>,
  userById: Map<string, User>,
  canViewInternal: boolean
): HomeActivityItem[] {
  return events
    .filter((event) => projectById.has(event.projectId) && isMeaningfulActivity(event, canViewInternal))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, recentActivityLimit)
    .map((event) => ({
      id: event.id,
      message: event.message,
      type: event.type,
      projectId: event.projectId,
      projectName: projectById.get(event.projectId)?.name ?? "Project unavailable",
      actorName: userById.get(event.actorId)?.name ?? "Unknown actor",
      createdAt: event.createdAt,
      path: buildProjectPath(event.projectId, "overview")
    }));
}

function isMeaningfulActivity(event: ProjectActivityEvent, canViewInternal: boolean) {
  const type = String(event.type ?? "").toLowerCase();

  if (!canViewInternal) {
    return type.includes("client") || type.includes("approval");
  }

  return [
    "approval",
    "client",
    "dependency",
    "import",
    "milestone",
    "project",
    "revision",
    "risk",
    "schedule",
    "task",
    "update"
  ].some((keyword) => type.includes(keyword));
}

function createProjectSummary(project: Project, clientById: Map<string, Client>, allTasks: Task[]): HomeProjectSummary {
  const tasks = allTasks.filter((task) => task.projectId === project.id && isLifecycleActive(task));
  const completeTasks = tasks.filter((task) => task.status === "done").length;

  return {
    id: project.id,
    name: project.name,
    clientName: clientById.get(project.clientId)?.name ?? "Client unavailable",
    health: project.health,
    status: project.status,
    progress: tasks.length > 0 ? Math.round((completeTasks / tasks.length) * 100) : 0,
    targetDate: isDateOnly(project.targetDate) ? project.targetDate : "",
    path: buildProjectPath(project.id, "plan")
  };
}
