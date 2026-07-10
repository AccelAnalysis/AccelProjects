import { CalendarDays, FileText, Filter, Mail, Plus, SlidersHorizontal, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ActivityFeed,
  DocumentHub,
  MetricCard,
  RiskRegister,
  StatusBadge,
  SummaryMetricCard,
  TaskTable,
  TimelineSection,
  formatDate,
  taskStatusLabels
} from "../components/project/ProjectWidgets";
import type { ProjectPageProps } from "../App";
import { buildProjectImportPath, buildProjectPath } from "../routing/projectRoutes";
import type { Task } from "../types";
import { todayDateOnly } from "../utils/dateOnly";
import { sortPhases } from "../utils/phaseOrdering";

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
    dependencies: projectState.taskDependencies.filter((dependency) => (
      projectState.tasks.some((task) => task.projectId === projectId && task.id === dependency.taskId)
    ))
  };
}

function projectStats(tasks: Task[]) {
  const today = todayDateOnly();
  const completeTasks = tasks.filter((task) => task.status === "done").length;
  const overdueTasks = tasks.filter((task) => task.status !== "done" && task.dueDate < today).length;

  return {
    completeTasks,
    overdueTasks,
    blockedTasks: tasks.filter((task) => task.status === "blocked").length,
    waitingOnClientTasks: tasks.filter((task) => task.status === "waiting_on_client").length,
    progress: tasks.length > 0 ? Math.round((completeTasks / tasks.length) * 100) : 0
  };
}

function hasPlanFilters(filters: PlanFilters) {
  return Boolean(filters.search.trim() || filters.phaseId !== "all" || filters.status !== "all" || filters.assigneeId !== "all");
}

type PlanFilters = {
  search: string;
  phaseId: string;
  status: string;
  assigneeId: string;
};

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
                Import Project
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
                Import Project
              </button>
            ) : null}
          </div>
        ) : (
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
        )}
      </section>
    </div>
  );
}

export function PlanPage({ projectState, selectedProjectId, onOpenTask }: ProjectPageProps) {
  const { project, phases, tasks, dependencies } = projectSlices(projectState, selectedProjectId);
  const [filters, setFilters] = useState<PlanFilters>({ search: "", phaseId: "all", status: "all", assigneeId: "all" });
  const collapseKey = `plan-collapse-${selectedProjectId}`;
  const [collapsedPhaseIds, setCollapsedPhaseIds] = useState<Set<string>>(() => new Set(JSON.parse(window.sessionStorage.getItem(collapseKey) ?? "[]") as string[]));
  const activeFilters = hasPlanFilters(filters);

  const visibleTasks = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    return tasks.filter((task) => (
      (!query || `${task.title} ${task.description}`.toLowerCase().includes(query))
      && (filters.phaseId === "all" || task.phaseId === filters.phaseId)
      && (filters.status === "all" || task.status === filters.status)
      && (filters.assigneeId === "all" || (filters.assigneeId === "__unassigned" ? task.assigneeId === null : task.assigneeId === filters.assigneeId))
    ));
  }, [filters, tasks]);
  const visiblePhaseIds = new Set(visibleTasks.map((task) => task.phaseId));
  const visiblePhases = activeFilters ? phases.filter((phase) => visiblePhaseIds.has(phase.id)) : phases;

  function storeCollapsed(next: Set<string>) {
    window.sessionStorage.setItem(collapseKey, JSON.stringify([...next]));
    setCollapsedPhaseIds(next);
  }

  function clearFilters() {
    setFilters({ search: "", phaseId: "all", status: "all", assigneeId: "all" });
  }

  function scrollToToday() {
    const marker = document.querySelector<HTMLElement>(".gantt-today-line");
    marker?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }

  function fitProject() {
    document.querySelector<HTMLElement>(".gantt-scroll")?.scrollTo({ left: 0, behavior: "smooth" });
  }

  if (!project) {
    return <ProjectUnavailable />;
  }

  return (
    <section className="panel plan-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Project schedule</p>
          <h1>Plan</h1>
          <p>Phase sequence, task timing, and delivery context for the selected project.</p>
        </div>
      </div>
      <div className="plan-toolbar">
        <label>
          Search tasks
          <input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Title or description" />
        </label>
        <label>
          Phase
          <select value={filters.phaseId} onChange={(event) => setFilters({ ...filters, phaseId: event.target.value })}>
            <option value="all">All phases</option>
            {phases.map((phase, index) => (
              <option key={phase.id} value={phase.id}>{index + 1}. {phase.name}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="all">All statuses</option>
            {Object.entries(taskStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          Assignee
          <select value={filters.assigneeId} onChange={(event) => setFilters({ ...filters, assigneeId: event.target.value })}>
            <option value="all">All assignees</option>
            <option value="__unassigned">Unassigned</option>
            {projectState.users.filter((user) => user.role !== "client").map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </label>
        <div className="button-row plan-toolbar-actions">
          <button className="secondary-button" type="button" onClick={scrollToToday}>
            <CalendarDays size={16} aria-hidden="true" />
            Today
          </button>
          <button className="secondary-button" type="button" onClick={fitProject}>Fit Project</button>
          <button className="secondary-button" type="button" onClick={() => storeCollapsed(new Set())}>Expand All</button>
          <button className="secondary-button" type="button" onClick={() => storeCollapsed(new Set(phases.map((phase) => phase.id)))}>Collapse All</button>
          {activeFilters ? <button className="link-button" type="button" onClick={clearFilters}>Clear Filters</button> : null}
        </div>
      </div>
      {activeFilters ? (
        <div className="active-filter-row">
          <Filter size={16} aria-hidden="true" />
          <span>{visibleTasks.length} matching task{visibleTasks.length === 1 ? "" : "s"}</span>
        </div>
      ) : null}
      {phases.length === 0 ? <div className="table-empty">This project has no phases yet.</div> : null}
      {phases.length > 0 && tasks.length === 0 ? <div className="table-empty">This project has phases but no tasks yet.</div> : null}
      {activeFilters && visibleTasks.length === 0 ? <div className="table-empty">No tasks match the current Plan filters.</div> : null}
      <TimelineSection
        project={project}
        phases={visiblePhases}
        tasks={visibleTasks}
        dependencies={dependencies}
        collapsedPhaseIds={collapsedPhaseIds}
        onTogglePhase={(phaseId) => {
          const next = new Set(collapsedPhaseIds);
          if (next.has(phaseId)) {
            next.delete(phaseId);
          } else {
            next.add(phaseId);
          }
          storeCollapsed(next);
        }}
        onOpenTask={onOpenTask}
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

  const filteredTasks = useMemo(() => tasks.filter((task) => (
    (statusFilter === "all" || task.status === statusFilter)
    && (ownerFilter === "all" || task.assigneeId === ownerFilter)
    && (phaseFilter === "all" || task.phaseId === phaseFilter)
  )), [ownerFilter, phaseFilter, statusFilter, tasks]);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Tasks</h1>
          <p>Execution board for phase-level ownership, due dates, and blockers.</p>
        </div>
        <div className="button-row">
          <button className="secondary-button" type="button">
            <Filter size={18} aria-hidden="true" />
            Filters Active
          </button>
          <button className="secondary-button" type="button">
            <SlidersHorizontal size={18} aria-hidden="true" />
            Sort: Due Date
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

export function MessagesPage({ projectState, selectedProjectId, clientPreview, canViewInternal }: ProjectPageProps) {
  const { events } = projectSlices(projectState, selectedProjectId);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Messages</h1>
          <p>Project communication history and activity updates.</p>
        </div>
        {canViewInternal ? (
          <button className="secondary-button" type="button" disabled title="Direct project messaging is planned for a later phase.">
            <Mail size={18} aria-hidden="true" />
            Send Project Update
          </button>
        ) : null}
      </div>
      <ActivityFeed events={events} users={projectState.users} clientPreview={clientPreview} />
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
              const overdue = open.filter((task) => task.dueDate < today);

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

export function ProjectSettingsPage({ projectState, selectedProjectId, canManage, canViewInternal, onNavigate }: ProjectPageProps) {
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
          <button className="secondary-button" type="button" onClick={() => onNavigate(buildProjectImportPath(project.id))}>
            <Upload size={18} aria-hidden="true" />
            Import
          </button>
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
      <p className="panel-note">Editable project metadata controls will be enabled when a safe project update workflow is available.</p>
    </section>
  );
}

export function SettingsPage({ role, onResetProjectState, onSeedProjectState }: ProjectPageProps) {
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Settings</h1>
            <p>Workspace, organization, notification, and integration settings will be configured in a later phase.</p>
          </div>
        </div>
        <div className="page-grid three">
          {["Workspace Profile", "Team Access", "Integration Controls"].map((item) => (
            <article className="document-card" key={item}>
              <FileText size={24} aria-hidden="true" />
              <h2>{item}</h2>
              <p>{role === "admin" ? "Admin editable in a future phase" : "Read-only in this role"}</p>
            </article>
          ))}
        </div>
      </section>
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
    </div>
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

export function LegacyProjectRoutePage({ selectedProjectId, onNavigate, targetTab }: ProjectPageProps & { targetTab: "plan" | "tasks" | "messages" | "files" | "metrics" }) {
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
