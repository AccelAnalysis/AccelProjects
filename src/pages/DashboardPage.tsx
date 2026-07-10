import {
  ClientPortalPreview,
  MetricCard,
  RiskRegister,
  SummaryMetricCard,
  TaskBoard,
  TeamCapacity
} from "../components/project/ProjectWidgets";
import type { ProjectPageProps } from "../App";

export function DashboardPage({
  projectState,
  selectedProjectId,
  clientPreview,
  onOpenTask,
  onAddRisk,
  onUpdateRisk,
  canManageRisks,
  canViewInternal
}: ProjectPageProps) {
  const project = projectState.projects.find((item) => item.id === selectedProjectId) ?? projectState.projects[0];
  const tasks = projectState.tasks.filter((task) => task.projectId === project.id);
  const phases = projectState.phases.filter((phase) => phase.projectId === project.id);
  const activePhase = phases.find((phase) => phase.status === "active") ?? phases[0];
  const phaseTasks = tasks.filter((task) => task.phaseId === activePhase?.id);
  const risks = projectState.risks.filter((risk) => risk.projectId === project.id);
  const documents = projectState.documents.filter((document) => document.projectId === project.id);
  const metrics = projectState.metrics.filter((metric) => metric.projectId === project.id);
  const completeTasks = tasks.filter((task) => task.status === "done").length;

  if (!canViewInternal) {
    return (
      <div className="page-stack">
        <ClientPortalPreview project={project} tasks={tasks} documents={documents} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="metrics-grid">
        <SummaryMetricCard
          label="Project Health"
          value={project.health.replace("_", " ")}
          helper={risks.length > 0 ? risks[0].title : "No active risks"}
          tone={project.health === "at_risk" ? "warning" : "success"}
        />
        {metrics.slice(0, 2).map((metric) => (
          <MetricCard metric={metric} key={metric.id} />
        ))}
        <SummaryMetricCard
          label="Tasks Completed"
          value={`${completeTasks}/${tasks.length}`}
          helper={`${tasks.filter((task) => task.status !== "done").length} items open`}
          tone="success"
        />
      </section>

      <section className="page-grid dashboard-grid">
        <article className="panel wide-panel">
          <div className="panel-header">
            <div>
              <h2>Phase: {activePhase?.name ?? "Unassigned"}</h2>
              <p>Current workstream tasks, status, owners, and client dependencies.</p>
            </div>
            <span className="status-badge info">{Math.round((completeTasks / Math.max(tasks.length, 1)) * 100)}% progress</span>
          </div>
          <TaskBoard tasks={phaseTasks} phases={phases} users={projectState.users} onOpenTask={onOpenTask} />
        </article>

        {!clientPreview ? (
          <aside className="panel">
            <div className="panel-header">
              <div>
                <h2>Team Capacity</h2>
                <p>Workload signals for this delivery cycle.</p>
              </div>
            </div>
            <TeamCapacity />
          </aside>
        ) : (
          <ClientPortalPreview project={project} tasks={tasks} documents={documents} />
        )}
      </section>

      {!clientPreview ? (
        <RiskRegister risks={risks} canManage={canManageRisks} onAddRisk={onAddRisk} onUpdateRisk={onUpdateRisk} />
      ) : null}
    </div>
  );
}
