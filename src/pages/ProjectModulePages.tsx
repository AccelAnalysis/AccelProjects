import { Bell, CalendarDays, Download, ExternalLink, FileText, Filter, History, KeyRound, Mail, Plus, ShieldCheck, SlidersHorizontal, Upload, UserCircle, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityFeed,
  DocumentHub,
  MetricCard,
  RiskRegister,
  StatusBadge,
  SummaryMetricCard,
  TaskTable,
  formatDate,
  taskStatusLabels
} from "../components/project/ProjectWidgets";
import { PlanWorkspace } from "../components/project/plan/PlanWorkspace";
import type { ProjectPageProps } from "../App";
import {
  cancelProjectCalendarEvent,
  createProjectCalendarDraft,
  createProjectCalendarEvent,
  createProjectCommunication,
  sendProjectCommunication,
  updateProjectCalendarEvent,
  type ProjectCalendarEventInput,
  type ProjectCommunicationInput
} from "../data/api";
import { buildProjectPath, buildProjectUpdatePath, buildProjectVersionHistoryPath, type ProjectTabId } from "../routing/projectRoutes";
import type { NotificationPreferences, ProjectCalendarEvent, ProjectCommunication, ProjectRecipient, Task } from "../types";
import { daysBetween, isDateOnly, todayDateOnly } from "../utils/dateOnly";
import { sortPhases } from "../utils/phaseOrdering";
import { compareDateOnly } from "../utils/dateOnly";

function projectSlices(projectState: ProjectPageProps["projectState"], projectId: string) {
  const project = projectState.projects.find((item) => item.id === projectId);

  return {
    project,
    client: projectState.clients.find((client) => client.id === project?.clientId),
    owner: projectState.users.find((user) => user.id === project?.ownerId),
    members: projectState.projectMembers.filter((member) => member.projectId === projectId),
    phases: sortPhases(projectState.phases.filter((phase) => phase.projectId === projectId)),
    milestones: projectState.milestones.filter((milestone) => milestone.projectId === projectId),
    tasks: projectState.tasks.filter((task) => task.projectId === projectId),
    risks: projectState.risks.filter((risk) => risk.projectId === projectId),
    documents: projectState.documents.filter((document) => document.projectId === projectId),
    metrics: projectState.metrics.filter((metric) => metric.projectId === projectId),
    events: projectState.activityEvents.filter((event) => event.projectId === projectId),
    communications: projectState.projectCommunications.filter((communication) => communication.projectId === projectId),
    calendarEvents: projectState.projectCalendarEvents.filter((event) => event.projectId === projectId),
    versions: projectState.projectVersions.filter((version) => version.projectId === projectId),
    dependencies: projectState.taskDependencies.filter((dependency) => (
      projectState.tasks.some((task) => task.projectId === projectId && task.id === dependency.taskId)
    ))
  };
}

function projectStats(tasks: Task[]) {
  const today = todayDateOnly();
  const completeTasks = tasks.filter((task) => task.status === "done").length;
  const overdueTasks = tasks.filter((task) => task.status !== "done" && Boolean(task.dueDate && task.dueDate < today)).length;

  return {
    completeTasks,
    overdueTasks,
    blockedTasks: tasks.filter((task) => task.status === "blocked").length,
    waitingOnClientTasks: tasks.filter((task) => task.status === "waiting_on_client").length,
    progress: tasks.length > 0 ? Math.round((completeTasks / tasks.length) * 100) : 0
  };
}

export function ProjectsPage({ projectState, selectedProjectId, canManage, canViewInternal, onNavigate }: ProjectPageProps) {
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Projects</h1>
            <p>Choose a client project, then work from its Plan workspace.</p>
          </div>
          <div className="button-row">
            {canManage && canViewInternal ? (
              <button className="secondary-button" type="button" disabled title="Project creation is not available in Phase 1.">
                <Plus size={18} aria-hidden="true" />
                New Project
              </button>
            ) : null}
            {canManage && canViewInternal ? (
              <button className="action-button" type="button" onClick={() => onNavigate("/projects/import")}>
                <Upload size={18} aria-hidden="true" />
                Import New Project
              </button>
            ) : null}
          </div>
        </div>
        {projectState.projects.length === 0 ? (
          <div className="empty-state portfolio-empty">
            <h2>No projects yet</h2>
            <p>Import a project package to create the first project workspace.</p>
            {canManage && canViewInternal ? (
              <button className="action-button" type="button" onClick={() => onNavigate("/projects/import")}>
                <Upload size={18} aria-hidden="true" />
                Import New Project
              </button>
            ) : null}
          </div>
        ) : (
          <>
          <ProjectPortfolioTimeline
            projectState={projectState}
            selectedProjectId={selectedProjectId}
            onNavigate={onNavigate}
          />
          <div className="project-list portfolio-list">
            {projectState.projects.map((project) => {
              const client = projectState.clients.find((item) => item.id === project.clientId);
              const owner = projectState.users.find((item) => item.id === project.ownerId);
              const tasks = projectState.tasks.filter((task) => task.projectId === project.id);
              const stats = projectStats(tasks);
              const selected = project.id === selectedProjectId;

              return (
                <article className={selected ? "project-row project-card selected" : "project-row project-card"} key={project.id}>
                  <button
                    className="project-card-main"
                    type="button"
                    onClick={() => onNavigate(buildProjectPath(project.id, "plan"))}
                    aria-label={`Open project ${project.name}`}
                  >
                    <p className="eyebrow">{client?.name ?? "Client unavailable"}</p>
                    <h2>{project.name}</h2>
                    <p>{project.summary}</p>
                    <div className="project-card-progress" aria-label={`${stats.progress}% task progress`}>
                      <span style={{ width: `${stats.progress}%` }} />
                    </div>
                  </button>
                  <div className="project-card-meta">
                    <StatusBadge label={project.health.replace("_", " ")} tone={project.health === "blocked" ? "danger" : project.health === "at_risk" ? "warning" : "success"} />
                    <span>{stats.progress}% complete</span>
                    <span>Target {formatDate(project.targetDate)}</span>
                    <span>{owner?.name ?? "No owner"}</span>
                    <strong>{tasks.length} tasks</strong>
                    {stats.overdueTasks > 0 ? <span className="text-warning">{stats.overdueTasks} overdue</span> : <span>No overdue tasks</span>}
                    <button className="action-button" type="button" onClick={() => onNavigate(buildProjectPath(project.id, "plan"))}>
                      Open Project
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          </>
        )}
      </section>
    </div>
  );
}

function ProjectPortfolioTimeline({
  projectState,
  selectedProjectId,
  onNavigate
}: {
  projectState: ProjectPageProps["projectState"];
  selectedProjectId: string;
  onNavigate: (path: string) => void;
}) {
  const scheduledProjects = projectState.projects.filter((project) => isDateOnly(project.startDate) && isDateOnly(project.targetDate));

  if (scheduledProjects.length === 0) {
    return null;
  }

  const startDate = scheduledProjects.map((project) => project.startDate).sort(compareDateOnly)[0];
  const endDate = scheduledProjects.map((project) => project.targetDate).sort(compareDateOnly).at(-1) ?? startDate;
  const totalDays = Math.max(daysBetween(startDate, endDate), 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const dayOffset = Math.round(totalDays * ratio);
    const date = new Date(`${startDate}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    return {
      label: formatDate(date.toISOString().slice(0, 10)),
      left: ratio * 100
    };
  });

  return (
    <section className="portfolio-timeline" aria-label="Project portfolio timeline">
      <div className="portfolio-timeline-header">
        <div>
          <h2>Project Timeline</h2>
          <p>Compare active project schedules across the portfolio.</p>
        </div>
      </div>
      <div className="portfolio-timeline-grid">
        <div className="portfolio-timeline-axis" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={`${tick.label}-${tick.left}`} style={{ left: `${tick.left}%` }}>{tick.label}</span>
          ))}
        </div>
        {scheduledProjects.map((project) => {
          const client = projectState.clients.find((item) => item.id === project.clientId);
          const owner = projectState.users.find((item) => item.id === project.ownerId);
          const tasks = projectState.tasks.filter((task) => task.projectId === project.id);
          const stats = projectStats(tasks);
          const offset = Math.max(0, daysBetween(startDate, project.startDate));
          const duration = Math.max(1, daysBetween(project.startDate, project.targetDate));
          const left = (offset / totalDays) * 100;
          const width = Math.max(3, (duration / totalDays) * 100);
          const selected = project.id === selectedProjectId;

          return (
            <div className={selected ? "portfolio-timeline-row selected" : "portfolio-timeline-row"} key={project.id}>
              <button className="portfolio-timeline-title button-reset" type="button" onClick={() => onNavigate(buildProjectPath(project.id, "plan"))}>
                <strong>{project.name}</strong>
                <span>{client?.name ?? "Client unavailable"}</span>
              </button>
              <div className="portfolio-timeline-track">
                <button
                  className={`portfolio-project-bar health-${project.health}`}
                  type="button"
                  style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                  onClick={() => onNavigate(buildProjectPath(project.id, "plan"))}
                  aria-label={`Open project ${project.name}`}
                  title={`${project.name} — ${client?.name ?? "Client unavailable"} — ${stats.progress}% complete — Target ${formatDate(project.targetDate)} — Owner ${owner?.name ?? "No owner"}`}
                >
                  <span>{project.name}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PlanPage(props: ProjectPageProps) {
  const {
    projectState,
    selectedProjectId,
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
  } = props;
  const { project, phases, tasks, milestones, dependencies } = projectSlices(projectState, selectedProjectId);
  if (!project) {
    return <ProjectUnavailable />;
  }

  return (
    <section className="panel plan-panel">
      <PlanWorkspace
        project={project}
        phases={phases}
        tasks={tasks}
        milestones={milestones}
        dependencies={dependencies}
        users={projectState.users}
        canManageSchedule={canManageSchedule}
        canCreateTasks={canCreateTasks}
        canEditTask={canEditTask}
        onOpenTask={onOpenTask}
        onCreateTask={onCreateTask}
        onUpdateTaskSchedule={onUpdateTaskSchedule}
        onBatchUpdateTaskSchedules={onBatchUpdateTaskSchedules}
        onCreateMilestone={onCreateMilestone}
        onUpdateMilestone={onUpdateMilestone}
        onDeleteMilestone={onDeleteMilestone}
        onCreateDependency={onCreateDependency}
        onUpdateDependency={onUpdateDependency}
        onDeleteDependency={onDeleteDependency}
      />
    </section>
  );
}

export function OverviewPage({ projectState, selectedProjectId, onNavigate }: ProjectPageProps) {
  const { project, client, owner, tasks, risks, documents, milestones, events } = projectSlices(projectState, selectedProjectId);

  if (!project) {
    return <ProjectUnavailable />;
  }

  const stats = projectStats(tasks);
  const nextMilestone = milestones
    .filter((milestone) => milestone.status !== "complete")
    .sort((left, right) => left.date.localeCompare(right.date))[0];

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Overview</h1>
            <p>{project.summary}</p>
          </div>
          <StatusBadge label={project.health.replace("_", " ")} tone={project.health === "blocked" ? "danger" : project.health === "at_risk" ? "warning" : "success"} />
        </div>
        <div className="page-grid four">
          <SummaryMetricCard label="Progress" value={`${stats.progress}%`} helper={`${stats.completeTasks}/${tasks.length} tasks complete`} />
          <SummaryMetricCard label="Overdue" value={`${stats.overdueTasks}`} helper="Open tasks past due" tone={stats.overdueTasks > 0 ? "warning" : "success"} />
          <SummaryMetricCard label="Blocked" value={`${stats.blockedTasks}`} helper="Tasks blocked now" tone={stats.blockedTasks > 0 ? "danger" : "success"} />
          <SummaryMetricCard label="Waiting on Client" value={`${stats.waitingOnClientTasks}`} helper="Client-actionable work" tone={stats.waitingOnClientTasks > 0 ? "warning" : "info"} />
        </div>
      </section>
      <section className="panel">
        <div className="page-grid three">
          <article className="metric-card">
            <span>Client</span>
            <strong>{client?.name ?? "Unavailable"}</strong>
            <p>{client?.contactName ?? "No contact"}</p>
          </article>
          <article className="metric-card">
            <span>Owner</span>
            <strong>{owner?.name ?? "No owner"}</strong>
            <p>{project.status.replace("_", " ")}</p>
          </article>
          <article className="metric-card">
            <span>Schedule</span>
            <strong>{formatDate(project.targetDate)}</strong>
            <p>Started {formatDate(project.startDate)}</p>
          </article>
        </div>
        <div className="button-row form-status">
          <button className="secondary-button" type="button" onClick={() => onNavigate(buildProjectPath(project.id, "plan"))}>Open Plan</button>
          <button className="secondary-button" type="button" onClick={() => onNavigate(buildProjectPath(project.id, "tasks"))}>View Tasks</button>
          <button className="secondary-button" type="button" onClick={() => onNavigate(buildProjectPath(project.id, "risks"))}>View Risks</button>
          <button className="secondary-button" type="button" onClick={() => onNavigate(buildProjectPath(project.id, "files"))}>View Files</button>
        </div>
      </section>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Current Context</h2>
            <p>{nextMilestone ? `Next milestone: ${nextMilestone.name} on ${formatDate(nextMilestone.date)}.` : "No upcoming milestones."}</p>
          </div>
        </div>
        <div className="page-grid three">
          <SummaryMetricCard label="Active risks" value={`${risks.filter((risk) => risk.status !== "resolved").length}`} helper="Open risk register items" />
          <SummaryMetricCard label="Files" value={`${documents.length}`} helper="Linked project files" />
          <SummaryMetricCard label="Recent activity" value={`${events.length}`} helper={events[0]?.message ?? "No activity yet"} />
        </div>
      </section>
    </div>
  );
}

export function TasksPage({ projectState, selectedProjectId, canEdit, canEditTask, onOpenTask, onUpdateTask }: ProjectPageProps) {
  const { phases, tasks } = projectSlices(projectState, selectedProjectId);
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [sortMode, setSortMode] = useState("dueDate");

  const filtersActive = statusFilter !== "all" || ownerFilter !== "all" || phaseFilter !== "all";
  const filteredTasks = useMemo(() => tasks
    .filter((task) => (
      (statusFilter === "all" || task.status === statusFilter)
      && (ownerFilter === "all" || task.assigneeId === ownerFilter)
      && (phaseFilter === "all" || task.phaseId === phaseFilter)
    ))
    .sort((left, right) => {
      if (sortMode === "phase") {
        return left.phaseId.localeCompare(right.phaseId) || compareDateOnly(left.dueDate, right.dueDate);
      }

      if (sortMode === "priority") {
        const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 };
        return priorityRank[left.priority] - priorityRank[right.priority] || compareDateOnly(left.dueDate, right.dueDate);
      }

      if (sortMode === "status") {
        return left.status.localeCompare(right.status) || compareDateOnly(left.dueDate, right.dueDate);
      }

      return compareDateOnly(left.dueDate, right.dueDate) || left.title.localeCompare(right.title);
    }), [ownerFilter, phaseFilter, sortMode, statusFilter, tasks]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Tasks</h1>
          <p>Execution board for phase-level ownership, due dates, and blockers.</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" type="button" disabled={!filtersActive}>
            <Filter size={18} aria-hidden="true" />
            {filtersActive ? "Filters Active" : "No Filters"}
          </button>
          <label className="compact-field">
            Sort
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value)}>
              <option value="dueDate">Due Date</option>
              <option value="phase">Phase</option>
              <option value="priority">Priority</option>
              <option value="status">Status</option>
            </select>
          </label>
          <button className="secondary-button" type="button" disabled>
            <SlidersHorizontal size={18} aria-hidden="true" />
            {filteredTasks.length} tasks
          </button>
        </div>
      </div>
      <div className="filter-row">
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(taskStatusLabels).map(([status, label]) => (
              <option key={status} value={status}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Owner
          <select value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
            <option value="all">All owners</option>
            {projectState.users.filter((user) => user.role !== "client").map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </label>
        <label>
          Phase
          <select value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)}>
            <option value="all">All phases</option>
            {phases.map((phase, index) => (
              <option key={phase.id} value={phase.id}>{index + 1}. {phase.name}</option>
            ))}
          </select>
        </label>
      </div>
      <TaskTable
        tasks={filteredTasks}
        phases={phases}
        users={projectState.users}
        canEdit={canEdit}
        canEditTask={canEditTask}
        onOpenTask={onOpenTask}
        onUpdateTask={onUpdateTask}
      />
    </section>
  );
}

export function RisksPage({ projectState, selectedProjectId, canManageRisks, onAddRisk, onUpdateRisk }: ProjectPageProps) {
  const { risks } = projectSlices(projectState, selectedProjectId);

  return <RiskRegister risks={risks} canManage={canManageRisks} onAddRisk={onAddRisk} onUpdateRisk={onUpdateRisk} />;
}

type MessageTab = "all" | "email" | "calendar" | "activity";

const defaultEmailForm: ProjectCommunicationInput = {
  subject: "",
  bodyText: "",
  toRecipients: [],
  ccRecipients: [],
  bccRecipients: [],
  audience: "client",
  visibility: "internal"
};

function defaultCalendarForm(): ProjectCalendarEventInput {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    title: "",
    descriptionText: "",
    visibility: "internal",
    startDateTime: start.toISOString().slice(0, 16),
    endDateTime: end.toISOString().slice(0, 16),
    timeZone: "Eastern Standard Time",
    isAllDay: false,
    location: "",
    attendees: [],
    reminderMinutesBeforeStart: 15,
    relatedEntityType: "project",
    relatedEntityId: null
  };
}

function parseRecipientText(value: string): ProjectRecipient[] {
  return value
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((email) => ({ email }));
}

function recipientText(recipients: ProjectRecipient[]) {
  return recipients.map((recipient) => recipient.email).join(", ");
}

function statusLabel(status: string) {
  return status === "accepted" ? "Accepted by Microsoft 365 for delivery" : status.replaceAll("_", " ");
}

function statusTone(status: string) {
  if (["accepted", "scheduled"].includes(status)) return "success";
  if (["failed", "unknown", "canceled"].includes(status)) return "danger";
  if (["sending", "creating", "updating", "canceling"].includes(status)) return "warning";
  return "info";
}

export function MessagesPage({ projectState, selectedProjectId, clientPreview, canViewInternal, canManage, onNavigate }: ProjectPageProps) {
  const { project, client, events, tasks, milestones } = projectSlices(projectState, selectedProjectId);
  const [activeTab, setActiveTab] = useState<MessageTab>("all");
  const [communications, setCommunications] = useState<ProjectCommunication[]>(() => projectState.projectCommunications.filter((communication) => communication.projectId === selectedProjectId));
  const [calendarEvents, setCalendarEvents] = useState<ProjectCalendarEvent[]>(() => projectState.projectCalendarEvents.filter((event) => event.projectId === selectedProjectId));
  const [composeOpen, setComposeOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [reviewMode, setReviewMode] = useState<"email" | "calendar" | null>(null);
  const [emailForm, setEmailForm] = useState<ProjectCommunicationInput>(defaultEmailForm);
  const [calendarForm, setCalendarForm] = useState<ProjectCalendarEventInput>(defaultCalendarForm());
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const canManageCommunications = canViewInternal && canManage && !clientPreview;

  useEffect(() => {
    setCommunications(projectState.projectCommunications.filter((communication) => communication.projectId === selectedProjectId));
    setCalendarEvents(projectState.projectCalendarEvents.filter((event) => event.projectId === selectedProjectId));
  }, [projectState.projectCommunications, projectState.projectCalendarEvents, selectedProjectId]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || working) {
        return;
      }

      setComposeOpen(false);
      setScheduleOpen(false);
      setReviewMode(null);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [working]);

  function openCompose() {
    setError("");
    setNotice("");
    setEmailForm({
      ...defaultEmailForm,
      subject: project ? `${project.name} project update` : "",
      toRecipients: client?.email ? [{ name: client.contactName, email: client.email }] : []
    });
    setReviewMode(null);
    setComposeOpen(true);
  }

  function openSchedule(calendarEvent?: ProjectCalendarEvent) {
    setError("");
    setNotice("");
    if (calendarEvent) {
      setEditingCalendarId(calendarEvent.id);
      setCalendarForm({
        title: calendarEvent.title,
        descriptionText: calendarEvent.descriptionText,
        visibility: calendarEvent.visibility,
        startDateTime: calendarEvent.startDateTime.slice(0, 16),
        endDateTime: calendarEvent.endDateTime.slice(0, 16),
        timeZone: calendarEvent.timeZone,
        isAllDay: calendarEvent.isAllDay,
        location: calendarEvent.location,
        attendees: calendarEvent.attendees,
        reminderMinutesBeforeStart: calendarEvent.reminderMinutesBeforeStart,
        relatedEntityType: calendarEvent.relatedEntityType,
        relatedEntityId: calendarEvent.relatedEntityId
      });
    } else {
      setEditingCalendarId(null);
      setCalendarForm({
        ...defaultCalendarForm(),
        title: project ? `${project.name} project meeting` : "",
        attendees: client?.email ? [{ name: client.contactName, email: client.email }] : []
      });
    }
    setReviewMode(null);
    setScheduleOpen(true);
  }

  async function confirmSendEmail() {
    setWorking(true);
    setError("");
    try {
      const draft = await createProjectCommunication(selectedProjectId, emailForm);
      const result = await sendProjectCommunication(selectedProjectId, draft.id);
      setCommunications((current) => [result.communication, ...current.filter((item) => item.id !== result.communication.id)]);
      setNotice("Accepted by Microsoft 365 for delivery. This does not prove final recipient delivery.");
      setComposeOpen(false);
      setReviewMode(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Project email could not be sent.");
    } finally {
      setWorking(false);
    }
  }

  async function confirmCalendar() {
    setWorking(true);
    setError("");
    try {
      const saved = editingCalendarId
        ? await updateProjectCalendarEvent(selectedProjectId, editingCalendarId, calendarForm)
        : await createProjectCalendarEvent(selectedProjectId, (await createProjectCalendarDraft(selectedProjectId, calendarForm)).id);
      setCalendarEvents((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setNotice(saved.status === "scheduled" ? "Outlook calendar event scheduled. Attendees receive invitations when included." : "Calendar event updated.");
      setScheduleOpen(false);
      setReviewMode(null);
      setEditingCalendarId(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Calendar event could not be saved.");
    } finally {
      setWorking(false);
    }
  }

  async function cancelEvent(calendarEvent: ProjectCalendarEvent) {
    if (!window.confirm("Cancel this Outlook calendar event? The local audit record will be retained.")) {
      return;
    }

    setWorking(true);
    setError("");
    try {
      const canceled = await cancelProjectCalendarEvent(selectedProjectId, calendarEvent.id);
      setCalendarEvents((current) => current.map((item) => item.id === canceled.id ? canceled : item));
      setNotice("Outlook calendar event canceled and the local audit record was retained.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Calendar event could not be canceled.");
    } finally {
      setWorking(false);
    }
  }

  const filteredCommunications = activeTab === "all" || activeTab === "email" ? communications : [];
  const filteredCalendarEvents = activeTab === "all" || activeTab === "calendar" ? calendarEvents : [];
  const showActivity = activeTab === "all" || activeTab === "activity";

  return (
    <section className="panel messages-workspace">
      <div className="panel-header">
        <div>
          <h1>Messages</h1>
          <p>Project communications, Outlook calendar links, and activity history.</p>
        </div>
        {canManageCommunications ? (
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => openSchedule()}>
              <CalendarDays size={18} aria-hidden="true" />
              Schedule Event
            </button>
            <button className="action-button" type="button" onClick={openCompose}>
              <Mail size={18} aria-hidden="true" />
              Compose Email
            </button>
          </div>
        ) : (
          <p className="panel-note">You can view permitted project history, but only project managers and administrators can send email or manage Outlook events.</p>
        )}
      </div>

      {notice ? <p className="form-success" role="status">{notice}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="segmented-control" role="tablist" aria-label="Message workspace filters">
        {(["all", "email", "calendar", "activity"] as MessageTab[]).map((tab) => (
          <button key={tab} type="button" className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
            {tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {(filteredCommunications.length > 0 || filteredCalendarEvents.length > 0) ? (
        <div className="communication-list">
          {filteredCommunications.map((communication) => (
            <article className="communication-row" key={communication.id}>
              <Mail size={18} aria-hidden="true" />
              <div>
                <strong>{communication.subject}</strong>
                <span>{communication.toRecipients.length} To · {communication.visibility.replace("_", " ")} · {communication.createdBy}</span>
                {communication.status === "unknown" ? <em>Prior send status is unknown. Manual retry may duplicate delivery.</em> : null}
              </div>
              <StatusBadge label={statusLabel(communication.status)} tone={statusTone(communication.status)} />
            </article>
          ))}
          {filteredCalendarEvents.map((calendarEvent) => (
            <article className="communication-row" key={calendarEvent.id}>
              <CalendarDays size={18} aria-hidden="true" />
              <div>
                <strong>{calendarEvent.title}</strong>
                <span>{formatDate(calendarEvent.startDateTime)} · {calendarEvent.attendees.length} attendees · {calendarEvent.visibility.replace("_", " ")}</span>
              </div>
              <div className="button-row">
                <StatusBadge label={statusLabel(calendarEvent.status)} tone={statusTone(calendarEvent.status)} />
                {calendarEvent.graphWebLink ? (
                  <button className="icon-button" type="button" onClick={() => window.open(calendarEvent.graphWebLink || "", "_blank", "noopener,noreferrer")} aria-label={`Open ${calendarEvent.title} in Outlook`}>
                    <ExternalLink size={16} aria-hidden="true" />
                  </button>
                ) : null}
                {canManageCommunications && calendarEvent.status !== "canceled" ? (
                  <>
                    <button className="secondary-button compact-button" type="button" onClick={() => openSchedule(calendarEvent)}>Edit</button>
                    <button className="secondary-button compact-button" type="button" onClick={() => cancelEvent(calendarEvent)} disabled={working}>Cancel</button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      ) : activeTab !== "activity" ? (
        <div className="empty-state">
          <h2>No project communications yet.</h2>
          <p>Emails and Outlook events created through AccelProjects will appear here.</p>
        </div>
      ) : null}

      {showActivity ? <ActivityFeed events={events} users={projectState.users} clientPreview={clientPreview} /> : null}

      {composeOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !working && setComposeOpen(false)}>
          <section className="modal-panel communication-modal" role="dialog" aria-modal="true" aria-labelledby="compose-email-heading" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 id="compose-email-heading">{reviewMode === "email" ? "Review Email" : "Compose Email"}</h2>
              <button className="icon-button" type="button" aria-label="Close compose email" onClick={() => setComposeOpen(false)} disabled={working}><X size={18} /></button>
            </div>
            {reviewMode === "email" ? (
              <div className="review-stack">
                <p><strong>To:</strong> {recipientText(emailForm.toRecipients)}</p>
                <p><strong>CC:</strong> {recipientText(emailForm.ccRecipients) || "None"}</p>
                <p><strong>BCC:</strong> {emailForm.bccRecipients.length} hidden recipients</p>
                <p><strong>Subject:</strong> {emailForm.subject}</p>
                <pre>{emailForm.bodyText}</pre>
                <p className="panel-note">Microsoft Graph returns Accepted when Microsoft 365 accepts the request. This is not final delivery confirmation.</p>
                <div className="button-row">
                  <button className="secondary-button" type="button" onClick={() => setReviewMode(null)} disabled={working}>Back</button>
                  <button className="action-button" type="button" onClick={confirmSendEmail} disabled={working}>{working ? "Sending..." : "Confirm Send"}</button>
                </div>
              </div>
            ) : (
              <form className="settings-form" onSubmit={(event) => { event.preventDefault(); setReviewMode("email"); }}>
                <label>To<input value={recipientText(emailForm.toRecipients)} onChange={(event) => setEmailForm({ ...emailForm, toRecipients: parseRecipientText(event.target.value) })} required /></label>
                <label>CC<input value={recipientText(emailForm.ccRecipients)} onChange={(event) => setEmailForm({ ...emailForm, ccRecipients: parseRecipientText(event.target.value) })} /></label>
                <label>BCC<input value={recipientText(emailForm.bccRecipients)} onChange={(event) => setEmailForm({ ...emailForm, bccRecipients: parseRecipientText(event.target.value) })} /></label>
                <label>Subject<input value={emailForm.subject} onChange={(event) => setEmailForm({ ...emailForm, subject: event.target.value })} required /></label>
                <label>Message<textarea value={emailForm.bodyText} onChange={(event) => setEmailForm({ ...emailForm, bodyText: event.target.value })} required rows={8} /></label>
                <div className="form-grid two">
                  <label>Audience<select value={emailForm.audience} onChange={(event) => setEmailForm({ ...emailForm, audience: event.target.value as ProjectCommunicationInput["audience"] })}><option value="client">Client</option><option value="internal">Internal</option><option value="mixed">Mixed</option></select></label>
                  <label>Visibility<select value={emailForm.visibility} onChange={(event) => setEmailForm({ ...emailForm, visibility: event.target.value as ProjectCommunicationInput["visibility"] })}><option value="internal">Internal</option><option value="client_visible">Client visible later</option></select></label>
                </div>
                <button className="action-button" type="submit">Review Email</button>
              </form>
            )}
          </section>
        </div>
      ) : null}

      {scheduleOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !working && setScheduleOpen(false)}>
          <section className="modal-panel communication-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-event-heading" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 id="schedule-event-heading">{reviewMode === "calendar" ? "Review Event" : editingCalendarId ? "Edit Event" : "Schedule Event"}</h2>
              <button className="icon-button" type="button" aria-label="Close schedule event" onClick={() => setScheduleOpen(false)} disabled={working}><X size={18} /></button>
            </div>
            {reviewMode === "calendar" ? (
              <div className="review-stack">
                <p><strong>Title:</strong> {calendarForm.title}</p>
                <p><strong>When:</strong> {calendarForm.startDateTime} to {calendarForm.endDateTime} ({calendarForm.timeZone})</p>
                <p><strong>Attendees:</strong> {recipientText(calendarForm.attendees) || "None"}</p>
                {calendarForm.attendees.length > 0 ? <p className="form-warning">Outlook will send invitations to attendees after confirmation.</p> : null}
                <div className="button-row">
                  <button className="secondary-button" type="button" onClick={() => setReviewMode(null)} disabled={working}>Back</button>
                  <button className="action-button" type="button" onClick={confirmCalendar} disabled={working}>{working ? "Saving..." : editingCalendarId ? "Confirm Update" : "Confirm Schedule"}</button>
                </div>
              </div>
            ) : (
              <form className="settings-form" onSubmit={(event) => { event.preventDefault(); setReviewMode("calendar"); }}>
                <label>Title<input value={calendarForm.title} onChange={(event) => setCalendarForm({ ...calendarForm, title: event.target.value })} required /></label>
                <label>Description<textarea value={calendarForm.descriptionText} onChange={(event) => setCalendarForm({ ...calendarForm, descriptionText: event.target.value })} rows={4} /></label>
                <div className="form-grid two">
                  <label>Start<input type="datetime-local" value={calendarForm.startDateTime} onChange={(event) => setCalendarForm({ ...calendarForm, startDateTime: event.target.value })} required /></label>
                  <label>End<input type="datetime-local" value={calendarForm.endDateTime} onChange={(event) => setCalendarForm({ ...calendarForm, endDateTime: event.target.value })} required /></label>
                </div>
                <div className="form-grid two">
                  <label>Time zone<input value={calendarForm.timeZone} onChange={(event) => setCalendarForm({ ...calendarForm, timeZone: event.target.value })} /></label>
                  <label>Reminder minutes<input type="number" min={0} value={calendarForm.reminderMinutesBeforeStart} onChange={(event) => setCalendarForm({ ...calendarForm, reminderMinutesBeforeStart: Number(event.target.value) })} /></label>
                </div>
                <label>Location<input value={calendarForm.location} onChange={(event) => setCalendarForm({ ...calendarForm, location: event.target.value })} /></label>
                <label>Attendees<input value={recipientText(calendarForm.attendees)} onChange={(event) => setCalendarForm({ ...calendarForm, attendees: parseRecipientText(event.target.value) })} /></label>
                <div className="form-grid two">
                  <label>Related item<select value={`${calendarForm.relatedEntityType}:${calendarForm.relatedEntityId || ""}`} onChange={(event) => {
                    const [type, id] = event.target.value.split(":");
                    setCalendarForm({ ...calendarForm, relatedEntityType: type as ProjectCalendarEventInput["relatedEntityType"], relatedEntityId: id || null });
                  }}>
                    <option value="project:">Project</option>
                    {tasks.map((task) => <option key={task.id} value={`task:${task.id}`}>Task: {task.title}</option>)}
                    {milestones.map((milestone) => <option key={milestone.id} value={`milestone:${milestone.id}`}>Milestone: {milestone.name}</option>)}
                  </select></label>
                  <label>Visibility<select value={calendarForm.visibility} onChange={(event) => setCalendarForm({ ...calendarForm, visibility: event.target.value as ProjectCalendarEventInput["visibility"] })}><option value="internal">Internal</option><option value="client_visible">Client visible later</option></select></label>
                </div>
                <label className="checkbox-label"><input type="checkbox" checked={calendarForm.isAllDay} onChange={(event) => setCalendarForm({ ...calendarForm, isAllDay: event.target.checked })} /> All-day event</label>
                <button className="action-button" type="submit">Review Event</button>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}

export function ClientsPage({ projectState }: ProjectPageProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Clients</h1>
          <p>Client relationships, contacts, active projects, and recent activity.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Active Projects</th>
              <th>Primary Contact</th>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {projectState.clients.map((client) => (
              <tr key={client.id}>
                <td><strong>{client.name}</strong></td>
                <td>{projectState.projects.filter((project) => project.clientId === client.id).length}</td>
                <td>{client.contactName}</td>
                <td>{client.email}</td>
                <td><StatusBadge label={client.status} tone={client.status === "active" ? "success" : "info"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DocumentsPage({ projectState, selectedProjectId, clientPreview, canEditDocuments }: ProjectPageProps) {
  const { documents } = projectSlices(projectState, selectedProjectId);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Files</h1>
          <p>Project files, deliverables, reports, and billing documents.</p>
        </div>
        {canEditDocuments && !clientPreview ? (
          <button className="secondary-button" type="button" disabled title="File upload is not implemented in Phase 1.">
            <Upload size={18} aria-hidden="true" />
            Upload
          </button>
        ) : null}
      </div>
      <DocumentHub documents={documents} users={projectState.users} />
    </section>
  );
}

export function MetricsPage({ projectState, selectedProjectId, canViewInternal }: ProjectPageProps) {
  const { metrics } = projectSlices(projectState, selectedProjectId);

  if (!canViewInternal) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Metrics</h1>
            <p>Client-safe project reporting is available from the project overview.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Metrics</h1>
          <p>Operational reporting for project progress, budget, delays, and workload.</p>
        </div>
      </div>
      <div className="page-grid two">
        {metrics.length === 0 ? <div className="table-empty">No project metrics are available yet.</div> : null}
        {metrics.map((metric) => (
          <MetricCard metric={metric} key={metric.id} />
        ))}
      </div>
    </section>
  );
}

export function TeamPage({ projectState, selectedProjectId }: ProjectPageProps) {
  const { members, tasks } = projectSlices(projectState, selectedProjectId);
  const today = todayDateOnly();

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Team</h1>
          <p>Project access, roles, and task assignment context.</p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team Member</th>
              <th>Organization Role</th>
              <th>Project Access</th>
              <th>Assigned Tasks</th>
              <th>Open Tasks</th>
              <th>Overdue Tasks</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const user = projectState.users.find((item) => item.id === member.userId);
              const assigned = tasks.filter((task) => task.assigneeId === member.userId);
              const open = assigned.filter((task) => task.status !== "done");
              const overdue = open.filter((task) => task.dueDate && task.dueDate < today);

              return (
                <tr key={member.id}>
                  <td><strong>{user?.name ?? member.userId}</strong><span>{user?.email}</span></td>
                  <td>{user?.role.replace("_", " ") ?? "Unknown"}</td>
                  <td>{member.role}</td>
                  <td>{assigned.length}</td>
                  <td>{open.length}</td>
                  <td>{overdue.length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ProjectSettingsPage({ projectState, selectedProjectId, canManage, canViewInternal, onExportProject, onNavigate }: ProjectPageProps) {
  const { project, client, owner } = projectSlices(projectState, selectedProjectId);

  if (!project) {
    return <ProjectUnavailable />;
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Project Settings</h1>
          <p>Project metadata and available management actions.</p>
        </div>
        {canManage && canViewInternal ? (
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={() => void onExportProject(project.id)}>
              <Download size={18} aria-hidden="true" />
              Export Project
            </button>
            <button className="secondary-button" type="button" onClick={() => onNavigate(buildProjectVersionHistoryPath(project.id))}>
              <History size={18} aria-hidden="true" />
              Version History
            </button>
            <button className="secondary-button" type="button" onClick={() => onNavigate(buildProjectUpdatePath(project.id))}>
              <Upload size={18} aria-hidden="true" />
              Update via File
            </button>
          </div>
        ) : null}
      </div>
      <div className="form-grid readonly-grid">
        {[
          ["Project name", project.name],
          ["Summary", project.summary],
          ["Client", client?.name ?? "Unavailable"],
          ["Owner", owner?.name ?? "No owner"],
          ["Start date", project.startDate],
          ["Target date", project.targetDate],
          ["Health", project.health.replace("_", " ")],
          ["Status", project.status]
        ].map(([label, value]) => (
          <label key={label}>
            {label}
            <input readOnly value={value} />
          </label>
        ))}
      </div>
      <p className="panel-note">Update via File applies a verified export back to this existing project. Portfolio Import New Project still creates a separate project.</p>
    </section>
  );
}

export function VersionHistoryPage({ projectState, selectedProjectId, canViewInternal }: ProjectPageProps) {
  const { project, versions } = projectSlices(projectState, selectedProjectId);

  if (!project) {
    return <ProjectUnavailable />;
  }

  if (!canViewInternal) {
    return (
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Version History</h1>
            <p>Version history is limited to internal project users.</p>
          </div>
        </div>
      </section>
    );
  }

  const sortedVersions = [...versions].sort((left, right) => right.revision - left.revision || right.createdAt.localeCompare(left.createdAt));

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Version History</h1>
            <p>{project.name} is currently at revision {project.revision ?? 1}.</p>
          </div>
          <StatusBadge label={`Revision ${project.revision ?? 1}`} tone="info" />
        </div>
        {sortedVersions.length === 0 ? (
          <div className="table-empty">No version records have been created for this project yet.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Revision</th>
                  <th>Change</th>
                  <th>Summary</th>
                  <th>Actor</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {sortedVersions.map((version) => {
                  const actor = projectState.users.find((user) => user.id === version.actorId);
                  const metadata = version.metadata as Record<string, unknown>;

                  return (
                    <tr key={version.id}>
                      <td><strong>r{version.revision}</strong><span>from r{version.previousRevision}</span></td>
                      <td>{version.changeType.replaceAll("_", " ")}</td>
                      <td>
                        <strong>{version.summary}</strong>
                        {version.changeType === "project_file_updated" ? (
                          <details>
                            <summary>File update details</summary>
                            <p>Added {String(metadata.addedCount ?? 0)} · Modified {String(metadata.modifiedCount ?? 0)} · Removed {String(metadata.removedCount ?? 0)}</p>
                            <p>Base revision {String(metadata.baseRevision ?? version.previousRevision)}</p>
                            <p>Uploaded {String(metadata.uploadedFileHash ?? "").slice(0, 12)} · Result {String(metadata.resultStateHash ?? "").slice(0, 12)}</p>
                          </details>
                        ) : null}
                      </td>
                      <td>{actor?.name ?? version.actorId}</td>
                      <td>{formatDate(version.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const defaultNotificationPreferences: NotificationPreferences = {
  taskAssignments: true,
  dueDates: true,
  risks: true,
  projectMessages: false,
  emailDelivery: false
};

type SettingsTab = "profile" | "account" | "access" | "notifications";

export function SettingsPage({
  firebaseUser,
  profileRole,
  role,
  userProfile,
  projectState,
  developmentToolsEnabled,
  onNavigate,
  onUpdateUserProfile,
  onSendPasswordReset,
  settingsTab = "profile"
}: ProjectPageProps & { settingsTab?: SettingsTab }) {
  const [displayName, setDisplayName] = useState(userProfile?.name ?? firebaseUser.displayName ?? "");
  const [avatarInitials, setAvatarInitials] = useState(userProfile?.avatarInitials ?? deriveInitials(userProfile?.name ?? firebaseUser.displayName ?? firebaseUser.email ?? "AP"));
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    ...defaultNotificationPreferences,
    ...userProfile?.notificationPreferences
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const providerIds = firebaseUser.providerData.map((provider) => provider.providerId).join(", ") || "password";
  const memberships = userProfile
    ? projectState.projectMembers.filter((member) => member.userId === userProfile.id)
    : [];

  useEffect(() => {
    setDisplayName(userProfile?.name ?? firebaseUser.displayName ?? "");
    setAvatarInitials(userProfile?.avatarInitials ?? deriveInitials(userProfile?.name ?? firebaseUser.displayName ?? firebaseUser.email ?? "AP"));
    setNotificationPreferences({ ...defaultNotificationPreferences, ...userProfile?.notificationPreferences });
  }, [firebaseUser.displayName, firebaseUser.email, userProfile]);

  async function saveProfile() {
    setStatusMessage("");
    setErrorMessage("");

    try {
      await onUpdateUserProfile({
        name: displayName.trim(),
        avatarInitials: avatarInitials.trim().toUpperCase()
      });
      setStatusMessage("Profile saved.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Profile could not be saved.");
    }
  }

  async function saveNotifications() {
    setStatusMessage("");
    setErrorMessage("");

    try {
      await onUpdateUserProfile({ notificationPreferences });
      setStatusMessage("Notification preferences saved. Delivery is not active until project messaging and notification delivery are implemented.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Notification preferences could not be saved.");
    }
  }

  async function sendPasswordReset() {
    setStatusMessage("");
    setErrorMessage("");

    try {
      await onSendPasswordReset();
      setStatusMessage(`Password reset email sent to ${firebaseUser.email}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Password reset is unavailable for this account.");
    }
  }

  const tabs: Array<{ id: SettingsTab; label: string; icon: typeof UserCircle }> = [
    { id: "profile", label: "Profile", icon: UserCircle },
    { id: "account", label: "Account", icon: KeyRound },
    { id: "access", label: "Access", icon: ShieldCheck },
    { id: "notifications", label: "Notifications", icon: Bell }
  ];

  return (
    <div className="page-stack">
      <section className="panel settings-shell">
        <div className="panel-header">
          <div>
            <h1>Account Settings</h1>
            <p>Manage your own profile, account information, access summary, and notification preferences.</p>
          </div>
        </div>
        <div className="settings-layout">
          <nav className="settings-tabs" aria-label="Account settings">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = settingsTab === tab.id;

              return (
                <button
                  aria-current={active ? "page" : undefined}
                  className={active ? "settings-tab active" : "settings-tab"}
                  key={tab.id}
                  type="button"
                  onClick={() => onNavigate(tab.id === "profile" ? "/settings/profile" : `/settings/${tab.id}`)}
                >
                  <Icon size={17} aria-hidden="true" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
          <div className="settings-content">
            {statusMessage ? <p className="form-status success" role="status">{statusMessage}</p> : null}
            {errorMessage ? <p className="form-status error" role="alert">{errorMessage}</p> : null}

            {settingsTab === "profile" ? (
              <section aria-labelledby="profile-settings-heading">
                <h2 id="profile-settings-heading">Profile</h2>
                <div className="form-grid two">
                  <label>
                    Display name
                    <input value={displayName} onChange={(event) => {
                      setDisplayName(event.target.value);
                      setAvatarInitials((current) => current || deriveInitials(event.target.value));
                    }} />
                  </label>
                  <label>
                    Avatar initials
                    <input maxLength={4} value={avatarInitials} onChange={(event) => setAvatarInitials(event.target.value.toUpperCase())} />
                  </label>
                  <label>
                    Authenticated email
                    <input readOnly value={firebaseUser.email ?? userProfile?.email ?? ""} />
                  </label>
                  <label>
                    Organization role
                    <input readOnly value={profileRole.replace("_", " ")} />
                  </label>
                </div>
                <p className="panel-note">Profile editing is limited to your display name and avatar initials. Email, organization, and role changes require administrator action.</p>
                <button className="action-button" type="button" onClick={() => void saveProfile()}>Save Profile</button>
              </section>
            ) : null}

            {settingsTab === "account" ? (
              <section aria-labelledby="account-settings-heading">
                <h2 id="account-settings-heading">Account</h2>
                <div className="form-grid two readonly-grid">
                  <label>
                    Authenticated email
                    <input readOnly value={firebaseUser.email ?? ""} />
                  </label>
                  <label>
                    Authentication provider
                    <input readOnly value={providerIds} />
                  </label>
                  <label>
                    Firebase UID
                    <input readOnly value={firebaseUser.uid} />
                  </label>
                  <label>
                    Email verified
                    <input readOnly value={firebaseUser.emailVerified ? "Yes" : "No"} />
                  </label>
                </div>
                <button className="secondary-button" type="button" disabled={!firebaseUser.email || !providerIds.includes("password")} onClick={() => void sendPasswordReset()}>
                  Send Password Reset
                </button>
                {!providerIds.includes("password") ? <p className="panel-note">Password reset is available only for password-based Firebase accounts.</p> : null}
              </section>
            ) : null}

            {settingsTab === "access" ? (
              <section aria-labelledby="access-settings-heading">
                <h2 id="access-settings-heading">Access</h2>
                <div className="page-grid three">
                  <SummaryMetricCard label="Real role" value={profileRole.replace("_", " ")} helper="Loaded from your Firestore organization-user profile." />
                  <SummaryMetricCard label="Preview role" value={role === profileRole ? "Off" : role.replace("_", " ")} helper="Preview mode is visual only and never changes authorization." />
                  <SummaryMetricCard label="Memberships" value={`${memberships.length}`} helper="Project memberships visible to your account." />
                </div>
                {memberships.length > 0 ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Project</th>
                          <th>Membership role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {memberships.map((member) => {
                          const project = projectState.projects.find((item) => item.id === member.projectId);

                          return (
                            <tr key={`${member.projectId}-${member.userId}`}>
                              <td>{project?.name ?? member.projectId}</td>
                              <td>{member.role}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="panel-note">No project memberships are currently visible for this account.</p>}
                {profileRole === "admin" && developmentToolsEnabled ? (
                  <button className="secondary-button" type="button" onClick={() => onNavigate("/admin")}>Open Administration</button>
                ) : null}
              </section>
            ) : null}

            {settingsTab === "notifications" ? (
              <section aria-labelledby="notification-settings-heading">
                <h2 id="notification-settings-heading">Notifications</h2>
                <p className="panel-note">These preferences are saved now. Automatic email delivery is not active until project messaging and notification delivery are implemented.</p>
                <div className="settings-checklist">
                  {[
                    ["taskAssignments", "Task assignment notifications"],
                    ["dueDates", "Due-date notifications"],
                    ["risks", "Risk notifications"],
                    ["projectMessages", "Project-message notifications"],
                    ["emailDelivery", "Email delivery enabled"]
                  ].map(([key, label]) => (
                    <label key={key}>
                      <input
                        checked={Boolean(notificationPreferences[key as keyof NotificationPreferences])}
                        type="checkbox"
                        onChange={(event) => setNotificationPreferences((current) => ({
                          ...current,
                          [key]: event.target.checked
                        }))}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
                <button className="action-button" type="button" onClick={() => void saveNotifications()}>Save Notification Preferences</button>
              </section>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function deriveInitials(source: string) {
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AP";
}

export function DevelopmentSettingsPanel({ onResetProjectState, onSeedProjectState }: Pick<ProjectPageProps, "onResetProjectState" | "onSeedProjectState">) {
  return (
    <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Demo Data</h2>
            <p>Seed or reset the project-management demo dataset.</p>
          </div>
          <div className="button-row">
            <button className="secondary-button" type="button" onClick={onSeedProjectState}>Seed Demo Data</button>
            <button className="secondary-button danger-button" type="button" onClick={onResetProjectState}>Reset Demo Data</button>
          </div>
        </div>
      </section>
  );
}

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
    </section>
  );
}

export function LegacyProjectRoutePage({ selectedProjectId, onNavigate, targetTab }: ProjectPageProps & { targetTab: ProjectTabId }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Select a project</h1>
          <p>This workspace area now lives inside a selected project. Open Projects to choose a project workspace.</p>
        </div>
        <div className="button-row">
          <button className="action-button" type="button" onClick={() => onNavigate("/projects")}>Open Projects</button>
          {selectedProjectId ? (
            <button className="secondary-button" type="button" onClick={() => onNavigate(buildProjectPath(selectedProjectId, targetTab))}>
              Open selected project
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ProjectUnavailable() {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Project unavailable</h1>
          <p>The selected project was deleted, is inaccessible, or could not be loaded.</p>
        </div>
      </div>
    </section>
  );
}
