import { AlertTriangle, CheckCircle2, Circle, Clock3 } from "lucide-react";
import { mockPhases, mockProjectRisks, mockTasks, mockTeamCapacity, mockUsers } from "../data/projectMockData";
import type { Task } from "../types";

const statusLabels: Record<Task["status"], string> = {
  done: "Complete",
  in_progress: "In Progress",
  waiting_on_client: "Waiting on Client",
  blocked: "Blocked",
  not_started: "Not Started",
  todo: "Not Started"
};

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

function userName(userId: string | null) {
  return mockUsers.find((user) => user.id === userId)?.name ?? "Unassigned";
}

function phaseName(phaseId: string) {
  return mockPhases.find((phase) => phase.id === phaseId)?.name ?? "Unassigned";
}

export function DashboardPage() {
  const activePhase = mockPhases.find((phase) => phase.name === "Draft Development");
  const phaseTasks = mockTasks.filter((task) => task.phaseId === activePhase?.id);

  return (
    <div className="page-stack">
      <section className="metrics-grid">
        <article className="metric-card">
          <span>Project Health</span>
          <strong className="text-warning">At Risk</strong>
          <p>Client approval dependency open</p>
        </article>
        <article className="metric-card">
          <span>Timeline Progress</span>
          <strong>68%</strong>
          <div className="capacity-bar">
            <span className="info" style={{ width: "68%" }} />
          </div>
        </article>
        <article className="metric-card">
          <span>Budget Utilization</span>
          <strong>75%</strong>
          <div className="capacity-bar">
            <span className="warning" style={{ width: "75%" }} />
          </div>
        </article>
        <article className="metric-card">
          <span>Tasks Completed</span>
          <strong className="text-success">24/36</strong>
          <p>5 items due this week</p>
        </article>
      </section>

      <section className="page-grid dashboard-grid">
        <article className="panel wide-panel">
          <div className="panel-header">
            <div>
              <h2>Phase: Draft Development</h2>
              <p>Current workstream tasks, status, owners, and client dependencies.</p>
            </div>
            <span className="status-badge info">68% progress</span>
          </div>
          <div className="task-list">
            {phaseTasks.map((task) => (
              <div className="task-row" key={task.id}>
                {taskIcon(task.status)}
                <div>
                  <strong>{task.title}</strong>
                  <span>{phaseName(task.phaseId)} / {userName(task.assigneeId)}</span>
                </div>
                <span className={`status-badge status-${task.status}`}>{statusLabels[task.status]}</span>
              </div>
            ))}
          </div>
        </article>

        <aside className="panel">
          <div className="panel-header">
            <div>
              <h2>Team Capacity</h2>
              <p>Workload signals for this delivery cycle.</p>
            </div>
          </div>
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
        </aside>
      </section>

      <section className="panel risk-panel">
        <div className="panel-header">
          <div>
            <h2>Risk & Issue Register</h2>
            <p>Active delivery risks requiring attention.</p>
          </div>
        </div>
        <div className="page-grid two">
          {mockProjectRisks.map((risk) => (
            <article className={`risk-card severity-${risk.severity}`} key={risk.id}>
              <span className={`status-badge ${risk.severity === "high" ? "danger" : "warning"}`}>
                {risk.severity}
              </span>
              <h3>{risk.title}</h3>
              <p>{risk.mitigationPlan}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
