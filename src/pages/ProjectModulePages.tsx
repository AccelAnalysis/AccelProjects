import { FileText, Filter, Folder, Mail, Plus, SlidersHorizontal, Upload } from "lucide-react";
import {
  mockClients,
  mockPhases,
  mockProjectActivityEvents,
  mockProjectDocuments,
  mockProjects,
  mockTasks,
  mockTeamCapacity,
  mockUsers
} from "../data/projectMockData";
import type { Task } from "../types";

const statusLabels: Record<Task["status"], string> = {
  done: "Complete",
  in_progress: "In Progress",
  waiting_on_client: "Waiting on Client",
  blocked: "Blocked",
  not_started: "Not Started",
  todo: "Not Started"
};

function userName(userId: string | null) {
  return mockUsers.find((user) => user.id === userId)?.name ?? "Unassigned";
}

function phaseName(phaseId: string) {
  return mockPhases.find((phase) => phase.id === phaseId)?.name ?? "Unassigned";
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ProjectsPage() {
  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h1>Projects</h1>
            <p>Portfolio view for active client delivery work.</p>
          </div>
          <button className="action-button" type="button">
            <Plus size={18} aria-hidden="true" />
            New Project
          </button>
        </div>
        <div className="project-list">
          {mockProjects.map((project) => (
            <article className="project-row project-card" key={project.id}>
              <div>
                <p className="eyebrow">{mockClients.find((client) => client.id === project.clientId)?.name}</p>
                <h2>{project.name}</h2>
                <p>{project.summary}</p>
              </div>
              <div className="project-card-meta">
                <span className={`status-badge ${project.health === "at_risk" ? "warning" : "success"}`}>
                  {project.health.replace("_", " ")}
                </span>
                <strong>{formatDate(project.targetDate)}</strong>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function TasksPage() {
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
            Filter
          </button>
          <button className="secondary-button" type="button">
            <SlidersHorizontal size={18} aria-hidden="true" />
            Sort
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="task-table">
          <thead>
            <tr>
              <th>Task Name</th>
              <th>Phase</th>
              <th>Assignee</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mockTasks.map((task) => (
              <tr key={task.id}>
                <td>
                  <strong>{task.title}</strong>
                  <span>{task.description}</span>
                </td>
                <td>{phaseName(task.phaseId)}</td>
                <td>{userName(task.assigneeId)}</td>
                <td>{formatDate(task.dueDate)}</td>
                <td>
                  <span className={`status-badge status-${task.status}`}>{statusLabels[task.status]}</span>
                </td>
                <td>
                  <button className="link-button" type="button">Open</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function TimelinePage() {
  const phases = [
    { name: "Data Collection", start: "Jun 15", end: "Jul 5", width: "24%", offset: "0%" },
    { name: "Draft Development", start: "Jul 6", end: "Jul 31", width: "34%", offset: "22%" },
    { name: "Review", start: "Aug 1", end: "Aug 16", width: "22%", offset: "58%" },
    { name: "Final Delivery", start: "Aug 17", end: "Aug 30", width: "18%", offset: "82%" }
  ];

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Gantt & Timeline</h1>
          <p>Milestone view for phase sequencing and dependency planning.</p>
        </div>
      </div>
      <div className="timeline-placeholder">
        <div className="timeline-dates">
          <span>Jun 15</span>
          <span>Jul 1</span>
          <span>Jul 15</span>
          <span>Aug 1</span>
          <span>Aug 15</span>
          <span>Aug 30</span>
        </div>
        {phases.map((phase) => (
          <div className="timeline-row" key={phase.name}>
            <strong>{phase.name}</strong>
            <div className="timeline-track">
              <span style={{ marginLeft: phase.offset, width: phase.width }}>
                {phase.start} - {phase.end}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="panel-note">Dependency-aware Gantt engine will be added after real task dependencies are stored.</p>
    </section>
  );
}

export function MessagesPage() {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Project Messages</h1>
          <p>Visual foundation for project communications connected to the existing email logging service.</p>
        </div>
        <button className="action-button" type="button">
          <Mail size={18} aria-hidden="true" />
          Send Project Update
        </button>
      </div>
      <div className="page-grid three">
        {mockProjectActivityEvents.map((event) => (
          <article className="message-card" key={event.id}>
            <span className="status-badge info">{event.type.replaceAll("_", " ")}</span>
            <h2>{event.message}</h2>
            <p>{new Date(event.createdAt).toLocaleString()}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function ClientsPage() {
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
            {mockClients.map((client) => (
              <tr key={client.id}>
                <td><strong>{client.name}</strong></td>
                <td>{mockProjects.filter((project) => project.clientId === client.id).length}</td>
                <td>{client.contactName}</td>
                <td>Jul 9, 2026</td>
                <td><span className="status-badge success">{client.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function DocumentsPage() {
  const folders = ["Client Deliverables", "Source Data", "Reports", "Contracts & Billing"];

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h1>Document Hub</h1>
          <p>Project files, deliverables, reports, and billing documents.</p>
        </div>
        <button className="action-button" type="button">
          <Upload size={18} aria-hidden="true" />
          Upload
        </button>
      </div>
      <div className="page-grid four">
        {folders.map((folder) => (
          <article className="document-card" key={folder}>
            <Folder size={28} aria-hidden="true" />
            <h2>{folder}</h2>
            <p>{mockProjectDocuments.length} linked item{mockProjectDocuments.length === 1 ? "" : "s"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function MetricsPage() {
  const metrics = [
    { label: "Project completion", value: 68, tone: "info" },
    { label: "Overdue work", value: 18, tone: "danger" },
    { label: "Budget hours", value: 75, tone: "warning" },
    { label: "Client response delays", value: 42, tone: "warning" },
    { label: "Team workload", value: 86, tone: "info" }
  ];

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
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}%</strong>
            <div className="capacity-bar">
              <span className={metric.tone} style={{ width: `${metric.value}%` }} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function SettingsPage() {
  return (
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
            <p>Configuration placeholder</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export { mockTeamCapacity };
