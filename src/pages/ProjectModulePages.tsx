import { FileText, Filter, Mail, Plus, SlidersHorizontal, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ActivityFeed,
  ClientPortalPreview,
  DocumentHub,
  MetricCard,
  RiskRegister,
  StatusBadge,
  TaskTable,
  TimelineSection
} from "../components/project/ProjectWidgets";
import type { ProjectPageProps } from "../App";
import type { Task } from "../types";

function projectSlices(projectState: ProjectPageProps["projectState"], projectId: string) {
  return {
    project: projectState.projects.find((project) => project.id === projectId) ?? projectState.projects[0],
    client: projectState.clients.find((client) => client.id === projectState.projects.find((project) => project.id === projectId)?.clientId),
    phases: projectState.phases.filter((phase) => phase.projectId === projectId),
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

export function ProjectsPage({ projectState, selectedProjectId, clientPreview }: ProjectPageProps) {
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Projects</h1>
            <p>Portfolio view for active client delivery work.</p>
          </div>
          {!clientPreview ? (
            <button className="action-button" type="button">
              <Plus size={18} aria-hidden="true" />
              New Project
            </button>
          ) : null}
        </div>
        <div className="project-list">
          {projectState.projects.map((project) => {
            const client = projectState.clients.find((item) => item.id === project.clientId);
            const taskCount = projectState.tasks.filter((task) => task.projectId === project.id).length;

            return (
              <article className={project.id === selectedProjectId ? "project-row project-card selected" : "project-row project-card"} key={project.id}>
                <div>
                  <p className="eyebrow">{client?.name}</p>
                  <h2>{project.name}</h2>
                  <p>{project.summary}</p>
                </div>
                <div className="project-card-meta">
                  <StatusBadge label={project.health.replace("_", " ")} tone={project.health === "at_risk" ? "warning" : "success"} />
                  <strong>{taskCount} tasks</strong>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export function TasksPage({ projectState, selectedProjectId, canEdit, onOpenTask, onUpdateTask }: ProjectPageProps) {
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
          <h1>Task List by Phase</h1>
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
            {["done", "in_progress", "waiting_on_client", "blocked", "not_started"].map((status) => (
              <option key={status} value={status}>{status.replaceAll("_", " ")}</option>
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
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>{phase.name}</option>
            ))}
          </select>
        </label>
      </div>
      <TaskTable
        tasks={filteredTasks}
        phases={phases}
        users={projectState.users}
        canEdit={canEdit}
        onOpenTask={onOpenTask}
        onUpdateTask={onUpdateTask}
      />
    </section>
  );
}

export function TimelinePage({ projectState, selectedProjectId }: ProjectPageProps) {
  const { project, phases, tasks, dependencies } = projectSlices(projectState, selectedProjectId);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Gantt & Timeline</h1>
          <p>Milestone view for phase sequencing and dependency planning.</p>
        </div>
      </div>
      <TimelineSection project={project} phases={phases} tasks={tasks} dependencies={dependencies} />
      <p className="panel-note">Dependency-aware Gantt engine will be replaced with a production scheduler after real task dependencies are stored.</p>
    </section>
  );
}

export function MessagesPage({ projectState, selectedProjectId, clientPreview }: ProjectPageProps) {
  const { events } = projectSlices(projectState, selectedProjectId);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Project Messages</h1>
          <p>Activity and communication history connected to the future project messaging layer.</p>
        </div>
        {!clientPreview ? (
          <button className="action-button" type="button">
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
              <th>Last Activity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {projectState.clients.map((client) => (
              <tr key={client.id}>
                <td><strong>{client.name}</strong></td>
                <td>{projectState.projects.filter((project) => project.clientId === client.id).length}</td>
                <td>{client.contactName}</td>
                <td>Jul 9, 2026</td>
                <td><StatusBadge label={client.status} tone={client.status === "active" ? "success" : "info"} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DocumentsPage({ projectState, selectedProjectId, clientPreview }: ProjectPageProps) {
  const { documents } = projectSlices(projectState, selectedProjectId);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Document Hub</h1>
          <p>Project files, deliverables, reports, and billing documents.</p>
        </div>
        {!clientPreview ? (
          <button className="action-button" type="button">
            <Upload size={18} aria-hidden="true" />
            Upload
          </button>
        ) : null}
      </div>
      <DocumentHub documents={documents} users={projectState.users} />
    </section>
  );
}

export function MetricsPage({ projectState, selectedProjectId }: ProjectPageProps) {
  const { metrics } = projectSlices(projectState, selectedProjectId);

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Metrics & Reports</h1>
          <p>Operational reporting for project progress, budget, delays, and workload.</p>
        </div>
      </div>
      <div className="page-grid two">
        {metrics.map((metric) => (
          <MetricCard metric={metric} key={metric.id} />
        ))}
      </div>
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
            <h2>Firestore Demo Data</h2>
            <p>Seed or reset the Firestore project-management demo dataset. Preview role and client-safe mode remain browser-only prototype controls.</p>
          </div>
          <div className="button-row">
            <button
              className="secondary-button"
              type="button"
              onClick={onSeedProjectState}
            >
              Seed Firestore Demo Data
            </button>
            <button
              className="secondary-button danger-button"
              type="button"
              onClick={onResetProjectState}
            >
              Reset Firestore Demo Data
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function ClientPreviewPage({ projectState, selectedProjectId }: ProjectPageProps) {
  const { project, tasks, documents } = projectSlices(projectState, selectedProjectId);

  return <ClientPortalPreview project={project} tasks={tasks} documents={documents} />;
}
