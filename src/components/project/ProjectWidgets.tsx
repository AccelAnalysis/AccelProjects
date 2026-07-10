import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock3,
  FileText,
  Folder,
  Link2,
  Mail,
  Plus,
  X
} from "lucide-react";
import { useState } from "react";
import type {
  Client,
  Milestone,
  Phase,
  Project,
  ProjectActivityEvent,
  ProjectDocument,
  ProjectMetric,
  ProjectRisk,
  Task,
  TaskComment,
  TaskDependency,
  User
} from "../../types";
import { mockTeamCapacity } from "../../data/projectMockData";

export const taskStatusLabels: Record<Task["status"], string> = {
  done: "Complete",
  in_progress: "In Progress",
  waiting_on_client: "Waiting on Client",
  blocked: "Blocked",
  not_started: "Not Started",
  todo: "Not Started"
};

export function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function getUserName(users: User[], userId: string | null) {
  return users.find((user) => user.id === userId)?.name ?? "Unassigned";
}

export function getPhaseName(phases: Phase[], phaseId: string) {
  return phases.find((phase) => phase.id === phaseId)?.name ?? "Unassigned";
}

export function StatusBadge({ label, tone = "info" }: { label: string; tone?: "success" | "warning" | "danger" | "info" }) {
  return <span className={`status-badge ${tone}`}>{label}</span>;
}

export function statusTone(status: Task["status"]) {
  if (status === "done") {
    return "success";
  }

  if (status === "blocked") {
    return "danger";
  }

  if (status === "waiting_on_client") {
    return "warning";
  }

  return "info";
}

function taskIcon(status: Task["status"]) {
  if (status === "done") {
    return <CheckCircle2 className="task-icon success" size={18} aria-hidden="true" />;
  }

  if (status === "blocked") {
    return <AlertTriangle className="task-icon danger" size={18} aria-hidden="true" />;
  }

  if (status === "waiting_on_client") {
    return <Clock3 className="task-icon warning" size={18} aria-hidden="true" />;
  }

  return <Circle className="task-icon info" size={18} aria-hidden="true" />;
}

export function ProjectSelector({
  projects,
  clients,
  selectedProjectId,
  onProjectChange
}: {
  projects: Project[];
  clients: Client[];
  selectedProjectId: string;
  onProjectChange: (projectId: string) => void;
}) {
  return (
    <label className="compact-field">
      Project
      <select value={selectedProjectId} onChange={(event) => onProjectChange(event.target.value)}>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name} - {clients.find((client) => client.id === project.clientId)?.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function MetricCard({ metric }: { metric: ProjectMetric }) {
  return (
    <article className="metric-card">
      <span>{metric.label}</span>
      <strong className={`text-${metric.tone}`}>{metric.value}{metric.suffix}</strong>
      <div className="capacity-bar">
        <span className={metric.tone} style={{ width: `${Math.min(metric.value, 100)}%` }} />
      </div>
    </article>
  );
}

export function SummaryMetricCard({
  label,
  value,
  helper,
  tone = "info"
}: {
  label: string;
  value: string;
  helper: string;
  tone?: "success" | "warning" | "danger" | "info";
}) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong className={`text-${tone}`}>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}

export function TaskBoard({
  tasks,
  phases,
  users,
  onOpenTask
}: {
  tasks: Task[];
  phases: Phase[];
  users: User[];
  onOpenTask: (taskId: string) => void;
}) {
  return (
    <div className="task-list">
      {tasks.map((task) => (
        <button className="task-row button-reset" key={task.id} type="button" onClick={() => onOpenTask(task.id)}>
          {taskIcon(task.status)}
          <div>
            <strong>{task.title}</strong>
            <span>{getPhaseName(phases, task.phaseId)} / {getUserName(users, task.assigneeId)}</span>
          </div>
          <span className={`status-badge ${statusTone(task.status)}`}>{taskStatusLabels[task.status]}</span>
        </button>
      ))}
    </div>
  );
}

export function TaskTable({
  tasks,
  phases,
  users,
  canEdit,
  canEditTask,
  onOpenTask,
  onUpdateTask
}: {
  tasks: Task[];
  phases: Phase[];
  users: User[];
  canEdit: boolean;
  canEditTask?: (task: Task) => boolean;
  onOpenTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
}) {
  return (
    <div className="table-wrap">
      <table className="task-table">
        <thead>
          <tr>
            <th>Task Name</th>
            <th>Phase</th>
            <th>Assignee</th>
            <th>Due Date</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const taskCanEdit = canEditTask ? canEditTask(task) : canEdit;

            return (
              <tr key={task.id}>
                <td>
                  <strong>{task.title}</strong>
                  <span>{task.description}</span>
                </td>
                <td>{getPhaseName(phases, task.phaseId)}</td>
                <td>{getUserName(users, task.assigneeId)}</td>
                <td>
                  {taskCanEdit ? (
                    <input
                      type="date"
                      value={task.dueDate}
                      onChange={(event) => onUpdateTask(task.id, { dueDate: event.target.value })}
                    />
                  ) : (
                    formatDate(task.dueDate)
                  )}
                </td>
                <td>
                  {taskCanEdit ? (
                    <select
                      value={task.status}
                      onChange={(event) => onUpdateTask(task.id, { status: event.target.value as Task["status"] })}
                    >
                      {Object.entries(taskStatusLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={`status-badge ${statusTone(task.status)}`}>{taskStatusLabels[task.status]}</span>
                  )}
                </td>
                <td>
                  {taskCanEdit ? (
                    <select
                      value={task.priority}
                      onChange={(event) => onUpdateTask(task.id, { priority: event.target.value as Task["priority"] })}
                    >
                      {["low", "medium", "high", "urgent"].map((priority) => (
                        <option key={priority} value={priority}>{priority}</option>
                      ))}
                    </select>
                  ) : (
                    task.priority
                  )}
                </td>
                <td>
                  <button className="link-button" type="button" onClick={() => onOpenTask(task.id)}>Open</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TaskDetailPanel({
  task,
  phases,
  users,
  comments,
  canEdit,
  canAddComment,
  onClose,
  onUpdateTask,
  onAddComment
}: {
  task: Task;
  phases: Phase[];
  users: User[];
  comments: TaskComment[];
  canEdit: boolean;
  canAddComment: boolean;
  onClose: () => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onAddComment: (taskId: string, body: string) => void;
}) {
  const [newComment, setNewComment] = useTaskCommentDraft(task.id);

  return (
    <aside className="detail-panel">
      <div className="detail-panel-header">
        <div>
          <p className="eyebrow">{getPhaseName(phases, task.phaseId)}</p>
          <h2>{task.title}</h2>
        </div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close task detail">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p>{task.description}</p>
      <div className="detail-form">
        <label>
          Status
          <select
            disabled={!canEdit}
            value={task.status}
            onChange={(event) => onUpdateTask(task.id, { status: event.target.value as Task["status"] })}
          >
            {Object.entries(taskStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          Owner
          <select
            disabled={!canEdit}
            value={task.assigneeId ?? ""}
            onChange={(event) => onUpdateTask(task.id, { assigneeId: event.target.value || null })}
          >
            <option value="">Unassigned</option>
            {users.filter((user) => user.role !== "client").map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </label>
        <label>
          Due Date
          <input
            disabled={!canEdit}
            type="date"
            value={task.dueDate}
            onChange={(event) => onUpdateTask(task.id, { dueDate: event.target.value })}
          />
        </label>
        <label>
          Priority
          <select
            disabled={!canEdit}
            value={task.priority}
            onChange={(event) => onUpdateTask(task.id, { priority: event.target.value as Task["priority"] })}
          >
            {["low", "medium", "high", "urgent"].map((priority) => (
              <option key={priority} value={priority}>{priority}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="comment-list">
        <h3>Activity Notes</h3>
        {comments.length === 0 ? <p>No comments yet.</p> : null}
        {comments.map((comment) => (
          <article className="comment-card" key={comment.id}>
            <strong>{getUserName(users, comment.authorId)}</strong>
            <p>{comment.body}</p>
            <span>{new Date(comment.createdAt).toLocaleString()}</span>
          </article>
        ))}
      </div>
      {canAddComment ? (
        <form
          className="comment-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (newComment.trim()) {
              onAddComment(task.id, newComment.trim());
              setNewComment("");
            }
          }}
        >
          <label>
            Add note
            <textarea value={newComment} onChange={(event) => setNewComment(event.target.value)} rows={3} />
          </label>
          <button className="action-button" type="submit">Add Note</button>
        </form>
      ) : null}
    </aside>
  );
}

export function NewTaskForm({
  projectId,
  phases,
  users,
  onCreateTask,
  onCancel
}: {
  projectId: string;
  phases: Phase[];
  users: User[];
  onCreateTask: (task: Omit<Task, "id" | "completedAt">) => void;
  onCancel: () => void;
}) {
  const defaultPhase = phases[0]?.id ?? "";
  const [draft, setDraft] = useState({
    title: "",
    description: "",
    phaseId: defaultPhase,
    assigneeId: users.find((user) => user.role !== "client")?.id ?? "",
    startDate: "2026-07-09",
    dueDate: "2026-07-16",
    priority: "medium" as Task["priority"],
    status: "not_started" as Task["status"],
    estimateHours: 4
  });

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Create New Task</h2>
          <p>Add a task to the selected project. Saved through Firestore.</p>
        </div>
      </div>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.title.trim()) {
            onCreateTask({
              ...draft,
              projectId,
              title: draft.title.trim(),
              description: draft.description.trim() || "No description yet.",
              assigneeId: draft.assigneeId || null
            });
          }
        }}
      >
        <label>
          Task Name
          <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </label>
        <label>
          Phase
          <select value={draft.phaseId} onChange={(event) => setDraft({ ...draft, phaseId: event.target.value })}>
            {phases.map((phase) => (
              <option key={phase.id} value={phase.id}>{phase.name}</option>
            ))}
          </select>
        </label>
        <label>
          Owner
          <select value={draft.assigneeId} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}>
            {users.filter((user) => user.role !== "client").map((user) => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </label>
        <label>
          Due Date
          <input type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} />
        </label>
        <label>
          Priority
          <select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Task["priority"] })}>
            {["low", "medium", "high", "urgent"].map((priority) => (
              <option key={priority} value={priority}>{priority}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as Task["status"] })}>
            {Object.entries(taskStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="full-width">
          Description
          <textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </label>
        <div className="button-row full-width">
          <button className="action-button" type="submit">Create Task</button>
          <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </section>
  );
}

export function GlobalSearchResults({
  query,
  tasks,
  documents,
  users,
  onOpenTask
}: {
  query: string;
  tasks: Task[];
  documents: ProjectDocument[];
  users: User[];
  onOpenTask: (taskId: string) => void;
}) {
  if (!query.trim()) {
    return null;
  }

  const normalizedQuery = query.toLowerCase();
  const matchingTasks = tasks.filter((task) => `${task.title} ${task.description}`.toLowerCase().includes(normalizedQuery));
  const matchingDocuments = documents.filter((document) => document.title.toLowerCase().includes(normalizedQuery));
  const matchingUsers = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(normalizedQuery));

  return (
    <section className="panel search-results-panel">
      <div className="panel-header">
        <div>
          <h2>Search Results</h2>
          <p>Tasks, files, and people matching "{query}"</p>
        </div>
      </div>
      <div className="page-grid three">
        <div>
          <h3>Tasks</h3>
          {matchingTasks.length === 0 ? <p>No matching tasks.</p> : null}
          {matchingTasks.map((task) => (
            <button className="search-result-row" key={task.id} type="button" onClick={() => onOpenTask(task.id)}>
              <strong>{task.title}</strong>
              <span>{taskStatusLabels[task.status]}</span>
            </button>
          ))}
        </div>
        <div>
          <h3>Files</h3>
          {matchingDocuments.length === 0 ? <p>No matching files.</p> : null}
          {matchingDocuments.map((document) => (
            <div className="search-result-row" key={document.id}>
              <strong>{document.title}</strong>
              <span>{document.type.replace("_", " ")}</span>
            </div>
          ))}
        </div>
        <div>
          <h3>People</h3>
          {matchingUsers.length === 0 ? <p>No matching people.</p> : null}
          {matchingUsers.map((user) => (
            <div className="search-result-row" key={user.id}>
              <strong>{user.name}</strong>
              <span>{user.role.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function useTaskCommentDraft(taskId: string): [string, (value: string) => void] {
  const key = `task-comment-${taskId}`;
  const [value, setValue] = useState(() => window.sessionStorage.getItem(key) ?? "");

  return [
    value,
    (nextValue: string) => {
      window.sessionStorage.setItem(key, nextValue);
      setValue(nextValue);
    }
  ];
}

function toDateNumber(value: string) {
  return new Date(`${value}T12:00:00`).getTime();
}

function timelinePosition(date: string, start: string, end: string) {
  const total = toDateNumber(end) - toDateNumber(start);
  const current = toDateNumber(date) - toDateNumber(start);

  if (total <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (current / total) * 100));
}

function timelineTone(task: Task) {
  const today = "2026-07-09";

  if (task.status === "done") {
    return "success";
  }

  if (task.status === "blocked") {
    return "danger";
  }

  if (task.dueDate < today) {
    return "warning";
  }

  if (task.status === "in_progress") {
    return "info";
  }

  return "muted";
}

export function TimelineSection({
  project,
  phases,
  tasks,
  dependencies
}: {
  project: Project;
  phases: Phase[];
  tasks: Task[];
  dependencies: TaskDependency[];
}) {
  const todayOffset = timelinePosition("2026-07-09", project.startDate, project.targetDate);

  return (
    <div className="timeline-placeholder">
      <div className="timeline-dates">
        <span>{formatDate(project.startDate)}</span>
        <span>Jul 1</span>
        <span>Jul 15</span>
        <span>Aug 1</span>
        <span>Aug 15</span>
        <span>{formatDate(project.targetDate)}</span>
      </div>
      <div className="timeline-body">
        <span className="today-marker" style={{ left: `${todayOffset}%` }}>Today</span>
        {phases.map((phase) => {
          const start = timelinePosition(phase.startDate, project.startDate, project.targetDate);
          const end = timelinePosition(phase.endDate, project.startDate, project.targetDate);

          return (
            <div className="timeline-row" key={phase.id}>
              <strong>{phase.name}</strong>
              <div className="timeline-track">
                <span className={`phase-bar status-${phase.status}`} style={{ marginLeft: `${start}%`, width: `${Math.max(end - start, 8)}%` }}>
                  {formatDate(phase.startDate)} - {formatDate(phase.endDate)}
                </span>
              </div>
            </div>
          );
        })}
        {tasks.map((task) => {
          const start = timelinePosition(task.startDate, project.startDate, project.targetDate);
          const end = timelinePosition(task.dueDate, project.startDate, project.targetDate);
          const dependency = dependencies.find((item) => item.taskId === task.id);

          return (
            <div className="timeline-row task-timeline-row" key={task.id}>
              <span>{task.title}</span>
              <div className="timeline-track thin">
                <span className={`task-bar ${timelineTone(task)}`} style={{ marginLeft: `${start}%`, width: `${Math.max(end - start, 4)}%` }}>
                  {dependency ? <Link2 size={13} aria-hidden="true" /> : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TeamCapacity() {
  return (
    <div className="capacity-list">
      {mockTeamCapacity.map((member) => (
        <div className="capacity-row" key={member.name}>
          <div>
            <strong>{member.name}</strong>
            <span>{member.role}</span>
          </div>
          <span>{member.capacity}%</span>
          <div className="capacity-bar">
            <span
              className={member.status === "overloaded" ? "warning" : "success"}
              style={{ width: `${Math.min(member.capacity, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RiskRegister({
  risks,
  canManage,
  onAddRisk,
  onUpdateRisk
}: {
  risks: ProjectRisk[];
  canManage: boolean;
  onAddRisk: (risk: Pick<ProjectRisk, "title" | "severity" | "probability" | "status" | "mitigationPlan">) => void;
  onUpdateRisk: (riskId: string, updates: Partial<ProjectRisk>) => void;
}) {
  const [draft, setDraft] = useRiskDraft();

  return (
    <section className="panel risk-panel">
      <div className="panel-header">
        <div>
          <h2>Risk & Issue Register</h2>
          <p>Active delivery risks requiring attention.</p>
        </div>
      </div>
      <div className="page-grid two">
        {risks.map((risk) => (
          <article className={`risk-card severity-${risk.severity}`} key={risk.id}>
            <span className={`status-badge ${risk.severity === "high" || risk.severity === "critical" ? "danger" : "warning"}`}>
              {risk.severity}
            </span>
            <h3>{risk.title}</h3>
            <p>{risk.mitigationPlan}</p>
            {canManage ? (
              <div className="risk-controls">
                <select value={risk.status} onChange={(event) => onUpdateRisk(risk.id, { status: event.target.value as ProjectRisk["status"] })}>
                  {["monitoring", "mitigating", "resolved"].map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
                <select value={risk.severity} onChange={(event) => onUpdateRisk(risk.id, { severity: event.target.value as ProjectRisk["severity"] })}>
                  {["low", "medium", "high", "critical"].map((severity) => (
                    <option key={severity} value={severity}>{severity}</option>
                  ))}
                </select>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {canManage ? (
        <form
          className="inline-create-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.title.trim()) {
              onAddRisk(draft);
              setDraft({ ...draft, title: "", mitigationPlan: "" });
            }
          }}
        >
          <input
            aria-label="Risk title"
            placeholder="Add risk or issue..."
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
          <select value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value as ProjectRisk["severity"] })}>
            {["low", "medium", "high", "critical"].map((severity) => (
              <option key={severity} value={severity}>{severity}</option>
            ))}
          </select>
          <input
            aria-label="Mitigation plan"
            placeholder="Mitigation plan"
            value={draft.mitigationPlan}
            onChange={(event) => setDraft({ ...draft, mitigationPlan: event.target.value })}
          />
          <button className="action-button" type="submit">
            <Plus size={16} aria-hidden="true" />
            Add Risk
          </button>
        </form>
      ) : null}
    </section>
  );
}

function useRiskDraft(): [
  Pick<ProjectRisk, "title" | "severity" | "probability" | "status" | "mitigationPlan">,
  (value: Pick<ProjectRisk, "title" | "severity" | "probability" | "status" | "mitigationPlan">) => void
] {
  const key = "risk-draft";
  const fallback = { title: "", severity: "medium" as const, probability: "medium" as const, status: "monitoring" as const, mitigationPlan: "" };
  const [value, setValue] = useState(() => {
    const stored = window.sessionStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  });

  return [
    value,
    (nextValue) => {
      window.sessionStorage.setItem(key, JSON.stringify(nextValue));
      setValue(nextValue);
    }
  ];
}

export function DocumentHub({ documents, users }: { documents: ProjectDocument[]; users: User[] }) {
  const folders = ["Client Deliverables", "Source Data", "Reports", "Contracts & Billing"];

  return (
    <div className="page-grid four">
      {folders.map((folder) => (
        <article className="document-card" key={folder}>
          <Folder size={28} aria-hidden="true" />
          <h2>{folder}</h2>
          <p>{documents.length} linked item{documents.length === 1 ? "" : "s"}</p>
        </article>
      ))}
      {documents.map((document) => (
        <article className="document-card" key={document.id}>
          <FileText size={24} aria-hidden="true" />
          <h2>{document.title}</h2>
          <p>{document.type.replace("_", " ")} / {getUserName(users, document.ownerId)}</p>
        </article>
      ))}
    </div>
  );
}

export function ActivityFeed({
  events,
  users,
  clientPreview
}: {
  events: ProjectActivityEvent[];
  users: User[];
  clientPreview: boolean;
}) {
  const visibleEvents = clientPreview ? events.filter((event) => event.type !== "email_logged") : events;

  return (
    <div className="page-grid three">
      {visibleEvents.map((event) => (
        <article className="message-card" key={event.id}>
          <span className="status-badge info">{event.type.replaceAll("_", " ")}</span>
          <h2>{event.message}</h2>
          <p>{getUserName(users, event.actorId)} / {new Date(event.createdAt).toLocaleString()}</p>
        </article>
      ))}
    </div>
  );
}

export function ClientPortalPreview({
  project,
  tasks,
  documents
}: {
  project: Project;
  tasks: Task[];
  documents: ProjectDocument[];
}) {
  const clientVisibleTasks = tasks.filter((task) => task.status === "waiting_on_client" || task.status === "done");

  return (
    <section className="panel client-preview-panel">
      <div className="panel-header">
        <div>
          <h2>Client Portal Preview</h2>
          <p>Client-safe view for {project.name}</p>
        </div>
        <StatusBadge label="Preview" tone="info" />
      </div>
      <div className="page-grid three">
        <article className="metric-card">
          <span>Visible tasks</span>
          <strong>{clientVisibleTasks.length}</strong>
          <p>Only complete or client-actionable items</p>
        </article>
        <article className="metric-card">
          <span>Shared documents</span>
          <strong>{documents.length}</strong>
          <p>Draft files stay internal until approved</p>
        </article>
        <article className="metric-card">
          <span>Project status</span>
          <strong>{project.health.replace("_", " ")}</strong>
          <p>Client-safe summary, no internal risk detail</p>
        </article>
      </div>
    </section>
  );
}
