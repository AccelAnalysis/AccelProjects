import { ArrowRight, BriefcaseBusiness, CalendarClock, FolderOpen, History, Upload } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import type { ProjectPageProps } from "../App";
import {
  createHomeDashboardView,
  homeUpcomingMilestoneWindowDays,
  type HomeActivityItem,
  type HomeAttentionProject,
  type HomeMilestoneItem,
  type HomeProjectSummary,
  type HomeSummaryMetric,
  type HomeTaskItem
} from "../home/homeDashboardSelectors";
import { buildProjectImportPath } from "../routing/projectRoutes";
import { formatDateOnly, isDateOnly } from "../utils/dateOnly";
import { StatusBadge, taskStatusLabels } from "../components/project/ProjectWidgets";

export function HomePage({
  projectState,
  selectedProjectId,
  role,
  userProfile,
  canManage,
  canViewInternal,
  clientPreview,
  onOpenTask,
  onNavigate
}: ProjectPageProps) {
  const view = useMemo(() => createHomeDashboardView({
    projectState,
    role,
    userProfile,
    selectedProjectId,
    clientPreview
  }), [clientPreview, projectState, role, selectedProjectId, userProfile]);
  const displayName = userProfile?.name.split(" ")[0] ?? "there";

  if (projectState.projects.length === 0) {
    return (
      <section className="home-empty panel">
        <div>
          <p className="eyebrow">Home</p>
          <h1>No projects yet.</h1>
          <p>Import a project package to begin using AccelProjects as a cross-project operating workspace.</p>
        </div>
        {canManage && canViewInternal ? (
          <button className="action-button" type="button" onClick={() => onNavigate(buildProjectImportPath())}>
            <Upload size={16} aria-hidden="true" />
            Import New Project
          </button>
        ) : null}
      </section>
    );
  }

  return (
    <div className="home-command-center">
      <section className="home-hero panel">
        <div>
          <p className="eyebrow">Home</p>
          <h1>Welcome, {displayName}</h1>
          <p>Here is what needs your attention across AccelProjects.</p>
        </div>
        <div className="home-hero-actions">
          <button className="action-button" type="button" onClick={() => onNavigate("/projects")}>
            <BriefcaseBusiness size={16} aria-hidden="true" />
            Open Projects
          </button>
          {canManage && canViewInternal ? (
            <button className="secondary-button" type="button" onClick={() => onNavigate(buildProjectImportPath())}>
              <Upload size={16} aria-hidden="true" />
              Import Project
            </button>
          ) : null}
          {view.quickReturnProject ? (
            <button className="secondary-button" type="button" onClick={() => onNavigate(view.quickReturnProject?.path ?? "/projects")}>
              <FolderOpen size={16} aria-hidden="true" />
              Return to Current Project
            </button>
          ) : null}
        </div>
      </section>

      <section className="home-summary-grid" aria-label="Workspace summary">
        {view.summaryMetrics.map((metric) => (
          <SummaryCard key={metric.id} metric={metric} onNavigate={onNavigate} />
        ))}
      </section>

      {!canViewInternal || clientPreview ? (
        <section className="home-panel panel">
          <div className="home-section-header">
            <div>
              <h2>Your Projects</h2>
              <p>Client-safe project context and upcoming obligations.</p>
            </div>
          </div>
          <ProjectList projects={view.activeProjects.slice(0, 4)} onNavigate={onNavigate} />
        </section>
      ) : (
        <section className="home-grid two">
          <HomePanel
            title="My Priorities"
            description="Assigned work ranked by urgency."
            emptyTitle="No urgent assigned work."
            emptyDescription="No assigned open tasks require immediate attention."
            empty={view.myPriorityTasks.length === 0}
          >
            <div className="home-list">
              {view.myPriorityTasks.map((task) => (
                <TaskPriorityRow key={task.id} task={task} onOpenTask={onOpenTask} onNavigate={onNavigate} />
              ))}
            </div>
          </HomePanel>

          <HomePanel
            title="Projects Needing Attention"
            description="Projects with health, schedule, or client-dependency signals."
            emptyTitle="All active projects are currently on track."
            emptyDescription="No active project has an immediate attention signal."
            empty={view.attentionProjects.length === 0}
          >
            <div className="home-list">
              {view.attentionProjects.map((project) => (
                <AttentionProjectRow key={project.id} project={project} onNavigate={onNavigate} />
              ))}
            </div>
          </HomePanel>
        </section>
      )}

      <section className="home-grid two">
        <HomePanel
          title="Upcoming Milestones"
          description={`Incomplete milestones due in the next ${homeUpcomingMilestoneWindowDays} days.`}
          emptyTitle={`No milestones are due in the next ${homeUpcomingMilestoneWindowDays} days.`}
          emptyDescription="Project plans do not have near-term milestone obligations."
          empty={view.upcomingMilestones.length === 0}
        >
          <div className="home-list">
            {view.upcomingMilestones.map((milestone) => (
              <MilestoneRow key={milestone.id} milestone={milestone} onNavigate={onNavigate} />
            ))}
          </div>
        </HomePanel>

        <HomePanel
          title="Recent Activity"
          description="Recent meaningful project events across accessible workspaces."
          emptyTitle="No recent project activity."
          emptyDescription="Meaningful project activity will appear here as work changes."
          empty={view.recentActivity.length === 0}
        >
          <div className="home-list">
            {view.recentActivity.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} onNavigate={onNavigate} />
            ))}
          </div>
        </HomePanel>
      </section>

      <section className="home-quick-actions panel" aria-label="Quick navigation">
        <button className="secondary-button" type="button" onClick={() => onNavigate("/projects")}>
          <BriefcaseBusiness size={16} aria-hidden="true" />
          Projects
        </button>
        {view.quickReturnProject ? (
          <button className="secondary-button" type="button" onClick={() => onNavigate(view.quickReturnProject?.path ?? "/projects")}>
            <FolderOpen size={16} aria-hidden="true" />
            {view.quickReturnProject.name}
          </button>
        ) : null}
        {canManage && canViewInternal ? (
          <button className="secondary-button" type="button" onClick={() => onNavigate(buildProjectImportPath())}>
            <Upload size={16} aria-hidden="true" />
            Import New Project
          </button>
        ) : null}
      </section>
    </div>
  );
}

function SummaryCard({ metric, onNavigate }: { metric: HomeSummaryMetric; onNavigate: (path: string) => void }) {
  const content = (
    <>
      <span>{metric.label}</span>
      <strong className={`text-${metric.tone}`}>{metric.value}</strong>
      <p>{metric.helper}</p>
    </>
  );

  if (metric.path) {
    return (
      <button className="home-summary-card metric-card button-reset" type="button" onClick={() => onNavigate(metric.path as string)} aria-label={`${metric.label}: ${metric.value}. ${metric.helper}`}>
        {content}
      </button>
    );
  }

  return <article className="home-summary-card metric-card">{content}</article>;
}

function HomePanel({
  title,
  description,
  emptyTitle,
  emptyDescription,
  empty,
  children
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <section className="home-panel panel">
      <div className="home-section-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {empty ? (
        <div className="home-empty-state">
          <strong>{emptyTitle}</strong>
          <p>{emptyDescription}</p>
        </div>
      ) : children}
    </section>
  );
}

function TaskPriorityRow({ task, onOpenTask, onNavigate }: { task: HomeTaskItem; onOpenTask: (taskId: string) => void; onNavigate: (path: string) => void }) {
  return (
    <article className="home-row priority-row">
      <button className="home-row-main button-reset" type="button" onClick={() => onOpenTask(task.id)} aria-label={`Open task ${task.title}`}>
        <strong>{task.title}</strong>
        <span>{task.projectName} · {task.clientName}</span>
      </button>
      <div className="home-row-meta">
        <span className={`status-badge ${task.status === "blocked" ? "danger" : task.status === "waiting_on_client" ? "warning" : "info"}`}>{taskStatusLabels[task.status]}</span>
        <span>{task.dueDate ? `Due ${formatDateOnly(task.dueDate)}` : "No due date"}</span>
        <span>{task.reason}</span>
      </div>
      <button className="icon-button" type="button" onClick={() => onNavigate(task.path)} aria-label={`Open project for ${task.title}`}>
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </article>
  );
}

function AttentionProjectRow({ project, onNavigate }: { project: HomeAttentionProject; onNavigate: (path: string) => void }) {
  return (
    <article className="home-row project-attention-row">
      <div className="home-row-main">
        <strong>{project.name}</strong>
        <span>{project.clientName} · Target {formatHomeDate(project.targetDate)}</span>
      </div>
      <div className="home-row-meta">
        <StatusBadge
          label={project.health.replace("_", " ")}
          tone={project.health === "blocked" ? "danger" : project.health === "at_risk" ? "warning" : "success"}
        />
        <span>{project.progress}% complete</span>
        <span>{project.primaryReason}</span>
      </div>
      <button className="secondary-button" type="button" onClick={() => onNavigate(project.path)}>
        Open Project
      </button>
    </article>
  );
}

function MilestoneRow({ milestone, onNavigate }: { milestone: HomeMilestoneItem; onNavigate: (path: string) => void }) {
  return (
    <article className="home-row milestone-row">
      <div className="home-row-icon" aria-hidden="true">
        <CalendarClock size={16} />
      </div>
      <div className="home-row-main">
        <strong>{milestone.name}</strong>
        <span>{milestone.projectName}</span>
      </div>
      <div className="home-row-meta">
        <span>{formatDateOnly(milestone.date)}</span>
        <span className={milestone.overdue ? "text-warning" : undefined}>{milestone.overdue ? "Overdue" : milestone.daysUntil === 0 ? "Due today" : `Due in ${milestone.daysUntil} days`}</span>
      </div>
      <button className="icon-button" type="button" onClick={() => onNavigate(milestone.path)} aria-label={`Open plan for ${milestone.name}`}>
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </article>
  );
}

function ActivityRow({ activity, onNavigate }: { activity: HomeActivityItem; onNavigate: (path: string) => void }) {
  return (
    <article className="home-row activity-row">
      <div className="home-row-icon" aria-hidden="true">
        <History size={16} />
      </div>
      <div className="home-row-main">
        <strong>{activity.message}</strong>
        <span>{activity.projectName} · {activity.actorName}</span>
      </div>
      <div className="home-row-meta">
        <span>{formatActivityDate(activity.createdAt)}</span>
      </div>
      <button className="icon-button" type="button" onClick={() => onNavigate(activity.path)} aria-label={`Open project for activity: ${activity.message}`}>
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </article>
  );
}

function ProjectList({ projects, onNavigate }: { projects: HomeProjectSummary[]; onNavigate: (path: string) => void }) {
  if (projects.length === 0) {
    return (
      <div className="home-empty-state">
        <strong>No accessible active projects.</strong>
        <p>Projects shared with you will appear here.</p>
      </div>
    );
  }

  return (
    <div className="home-list">
      {projects.map((project) => (
        <article className="home-row" key={project.id}>
          <div className="home-row-main">
            <strong>{project.name}</strong>
            <span>{project.clientName} · Target {formatHomeDate(project.targetDate)}</span>
          </div>
          <div className="home-row-meta">
            <StatusBadge label={project.health.replace("_", " ")} tone={project.health === "blocked" ? "danger" : project.health === "at_risk" ? "warning" : "success"} />
            <span>{project.progress}% complete</span>
          </div>
          <button className="secondary-button" type="button" onClick={() => onNavigate(project.path)}>Open Project</button>
        </article>
      ))}
    </div>
  );
}

function formatHomeDate(value: string) {
  return isDateOnly(value) ? formatDateOnly(value) : "Unavailable";
}

function formatActivityDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
