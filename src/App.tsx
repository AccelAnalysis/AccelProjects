import {
  BarChart3,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  Gauge,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AdminPage } from "./pages/AdminPage";
import { CustomerOrderPage } from "./pages/CustomerOrderPage";
import { DashboardPage } from "./pages/DashboardPage";
import {
  ClientsPage,
  DocumentsPage,
  MetricsPage,
  MessagesPage,
  ProjectsPage,
  SettingsPage,
  TasksPage,
  TimelinePage
} from "./pages/ProjectModulePages";
import { PaymentCancelPage } from "./pages/PaymentCancelPage";
import { PaymentSuccessPage } from "./pages/PaymentSuccessPage";
import { SystemTestsPage } from "./pages/SystemTestsPage";
import { TestPage } from "./pages/TestPage";
import {
  canEditProjects,
  canManageProjects,
  GlobalSearchResults,
  NewTaskForm,
  ProjectSelector,
  TaskDetailPanel
} from "./components/project/ProjectWidgets";
import { demoRoles } from "./data/projectMockData";
import { loadProjectState, saveProjectState } from "./data/projectStore";
import type { ProjectRisk, ProjectState, Task, UserRole } from "./types";
import accelLogo from "../Accel_GOH_Logo.png";

const navItems = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/projects", label: "Projects", icon: BriefcaseBusiness },
  { href: "/tasks", label: "Tasks & Phases", icon: ClipboardList },
  { href: "/timeline", label: "Gantt & Timeline", icon: CalendarDays },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/documents", label: "Document Hub", icon: FileText },
  { href: "/metrics", label: "Metrics & Reports", icon: BarChart3 },
  { href: "/billing", label: "Billing", icon: ClipboardList },
  { href: "/system-tests", label: "System Tests", icon: FlaskConical },
  { href: "/settings", label: "Settings", icon: Settings }
];

export type ProjectPageProps = {
  projectState: ProjectState;
  selectedProjectId: string;
  role: UserRole;
  canEdit: boolean;
  canManage: boolean;
  clientPreview: boolean;
  onOpenTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onCreateTask: (task: Omit<Task, "id" | "completedAt">) => void;
  onAddRisk: (risk: Pick<ProjectRisk, "title" | "severity" | "probability" | "status" | "mitigationPlan">) => void;
  onUpdateRisk: (riskId: string, updates: Partial<ProjectRisk>) => void;
};

function getRoute(props: ProjectPageProps) {
  const path = window.location.pathname;

  if (path === "/") {
    return <DashboardPage {...props} />;
  }

  if (path === "/projects") {
    return <ProjectsPage {...props} />;
  }

  if (path === "/tasks") {
    return <TasksPage {...props} />;
  }

  if (path === "/timeline") {
    return <TimelinePage {...props} />;
  }

  if (path === "/messages") {
    return <MessagesPage {...props} />;
  }

  if (path === "/clients") {
    return <ClientsPage {...props} />;
  }

  if (path === "/documents") {
    return <DocumentsPage {...props} />;
  }

  if (path === "/metrics") {
    return <MetricsPage {...props} />;
  }

  if (path === "/billing") {
    return <CustomerOrderPage />;
  }

  if (path === "/settings") {
    return <SettingsPage {...props} />;
  }

  if (path === "/system-tests") {
    return <SystemTestsPage />;
  }

  if (path === "/admin") {
    return <AdminPage />;
  }

  if (path === "/test") {
    return <TestPage />;
  }

  if (path === "/payment-success") {
    return <PaymentSuccessPage />;
  }

  if (path === "/payment-cancel") {
    return <PaymentCancelPage />;
  }

  return <DashboardPage {...props} />;
}

function isActiveRoute(href: string) {
  const path = window.location.pathname;

  if (href === "/") {
    return path === "/";
  }

  return path === href || (href === "/system-tests" && (path === "/admin" || path === "/test"));
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <a className="sidebar-brand" href="/">
        <span className="brand-logo">
          <img src={accelLogo} alt="AccelProjects" />
        </span>
        <span>
          <strong>AccelProjects</strong>
          <small>Project Operations</small>
        </span>
      </a>
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActiveRoute(item.href);

          return (
            <a className={active ? "sidebar-link active" : "sidebar-link"} href={item.href} key={item.href}>
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <span>Prototype Mode</span>
        <strong>Local task, risk, role, and client-preview changes persist in this browser.</strong>
      </div>
    </aside>
  );
}

function TopHeader({
  role,
  onRoleChange,
  searchQuery,
  onSearchChange,
  clientPreview,
  onClientPreviewChange
}: {
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  clientPreview: boolean;
  onClientPreviewChange: (value: boolean) => void;
}) {
  const selectedRole = demoRoles.find((item) => item.role === role);
  const initials = role === "client" ? "DW" : role === "admin" ? "ER" : role === "contributor" ? "MT" : role === "viewer" ? "VL" : "SJ";
  const displayName = role === "client" ? "Dana Whitfield" : role === "admin" ? "Elena Rivera" : role === "contributor" ? "Marcus Turner" : role === "viewer" ? "Victor Lee" : "Sarah Jenkins";

  return (
    <header className="top-header">
      <label className="search-box" aria-label="Search">
        <Search size={18} aria-hidden="true" />
        <input
          placeholder="Search tasks, files, projects, or people..."
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      <div className="top-header-actions">
        <label className="compact-field role-field">
          Role
          <select value={role} onChange={(event) => onRoleChange(event.target.value as UserRole)}>
            {demoRoles.map((item) => (
              <option key={item.role} value={item.role}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="toggle-field">
          <input type="checkbox" checked={clientPreview} onChange={(event) => onClientPreviewChange(event.target.checked)} />
          Client-safe preview
        </label>
        <button className="icon-button" type="button" aria-label="Notifications">
          <Bell size={18} aria-hidden="true" />
          <span className="notification-dot" />
        </button>
        <div className="user-chip">
          <span className="user-avatar">{initials}</span>
          <span>
            <strong>{displayName}</strong>
            <small>{selectedRole?.label ?? "Project Manager"}</small>
          </span>
        </div>
      </div>
    </header>
  );
}

function ProjectHeader({
  projectState,
  selectedProjectId,
  onProjectChange,
  canEdit,
  onNewTask
}: {
  projectState: ProjectState;
  selectedProjectId: string;
  onProjectChange: (projectId: string) => void;
  canEdit: boolean;
  onNewTask: () => void;
}) {
  const project = projectState.projects.find((item) => item.id === selectedProjectId) ?? projectState.projects[0];
  const client = projectState.clients.find((item) => item.id === project.clientId);
  const owner = projectState.users.find((item) => item.id === project.ownerId);
  const tasks = projectState.tasks.filter((task) => task.projectId === project.id);
  const completeTasks = tasks.filter((task) => task.status === "done").length;
  const progress = tasks.length > 0 ? Math.round((completeTasks / tasks.length) * 100) : 0;

  return (
    <section className="project-header">
      <div>
        <p className="eyebrow">{client?.name ?? "Client"}</p>
        <div className="project-title-row">
          <h1>{project.name}</h1>
          <span className={`status-badge ${project.health === "at_risk" ? "warning" : "success"}`}>
            {project.health.replace("_", " ")}
          </span>
        </div>
        <p>{owner?.name ?? "Project owner"} owns delivery. {completeTasks}/{tasks.length} tasks complete.</p>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="project-header-actions">
        <ProjectSelector
          clients={projectState.clients}
          projects={projectState.projects}
          selectedProjectId={selectedProjectId}
          onProjectChange={onProjectChange}
        />
        {canEdit ? (
          <button className="action-button" type="button" onClick={onNewTask}>
            <Plus size={18} aria-hidden="true" />
            New Task
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function App() {
  const [projectState, setProjectState] = useState(loadProjectState);
  const [selectedProjectId, setSelectedProjectId] = useState(() => (
    window.localStorage.getItem("accelprojects.selectedProjectId") ?? projectState.projects[0]?.id ?? ""
  ));
  const [role, setRole] = useState<UserRole>(() => (window.localStorage.getItem("accelprojects.role") as UserRole) ?? "project_manager");
  const [clientPreview, setClientPreview] = useState(() => window.localStorage.getItem("accelprojects.clientPreview") === "true");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);

  const selectedProject = projectState.projects.find((project) => project.id === selectedProjectId) ?? projectState.projects[0];
  const projectPhases = useMemo(
    () => projectState.phases.filter((phase) => phase.projectId === selectedProject?.id),
    [projectState.phases, selectedProject?.id]
  );
  const projectTasks = useMemo(
    () => projectState.tasks.filter((task) => task.projectId === selectedProject?.id),
    [projectState.tasks, selectedProject?.id]
  );
  const selectedTask = selectedTaskId ? projectState.tasks.find((task) => task.id === selectedTaskId) : undefined;
  const editable = canEditProjects(role) && !clientPreview;
  const manageable = canManageProjects(role) && !clientPreview;

  useEffect(() => {
    saveProjectState(projectState);
  }, [projectState]);

  useEffect(() => {
    if (selectedProjectId) {
      window.localStorage.setItem("accelprojects.selectedProjectId", selectedProjectId);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    window.localStorage.setItem("accelprojects.role", role);
  }, [role]);

  useEffect(() => {
    window.localStorage.setItem("accelprojects.clientPreview", String(clientPreview));
  }, [clientPreview]);

  function updateTask(taskId: string, updates: Partial<Task>) {
    setProjectState((current) => ({
      ...current,
      tasks: current.tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const nextStatus = updates.status ?? task.status;

        return {
          ...task,
          ...updates,
          completedAt: nextStatus === "done" ? task.completedAt ?? new Date().toISOString() : null
        };
      })
    }));
  }

  function createTask(task: Omit<Task, "id" | "completedAt">) {
    const newTask: Task = {
      ...task,
      id: `task_${Date.now()}`,
      completedAt: task.status === "done" ? new Date().toISOString() : null
    };

    setProjectState((current) => ({
      ...current,
      tasks: [newTask, ...current.tasks],
      activityEvents: [
        {
          id: `event_${Date.now()}`,
          projectId: task.projectId,
          actorId: "user_sarah",
          type: "task_created",
          message: `Task created: ${task.title}`,
          metadata: { taskId: newTask.id },
          createdAt: new Date().toISOString()
        },
        ...current.activityEvents
      ]
    }));
    setSelectedTaskId(newTask.id);
    setShowNewTaskForm(false);
  }

  function addTaskComment(taskId: string, body: string) {
    const task = projectState.tasks.find((item) => item.id === taskId);

    if (!task) {
      return;
    }

    setProjectState((current) => ({
      ...current,
      taskComments: [
        {
          id: `comment_${Date.now()}`,
          taskId,
          authorId: role === "client" ? "user_dana" : "user_sarah",
          body,
          visibility: role === "client" ? "client" : "internal",
          createdAt: new Date().toISOString()
        },
        ...current.taskComments
      ],
      activityEvents: [
        {
          id: `event_${Date.now()}`,
          projectId: task.projectId,
          actorId: role === "client" ? "user_dana" : "user_sarah",
          type: "task_note_added",
          message: `Note added to ${task.title}`,
          metadata: { taskId },
          createdAt: new Date().toISOString()
        },
        ...current.activityEvents
      ]
    }));
  }

  function addRisk(risk: Pick<ProjectRisk, "title" | "severity" | "probability" | "status" | "mitigationPlan">) {
    if (!selectedProject) {
      return;
    }

    setProjectState((current) => ({
      ...current,
      risks: [
        {
          id: `risk_${Date.now()}`,
          projectId: selectedProject.id,
          ...risk
        },
        ...current.risks
      ]
    }));
  }

  function updateRisk(riskId: string, updates: Partial<ProjectRisk>) {
    setProjectState((current) => ({
      ...current,
      risks: current.risks.map((risk) => risk.id === riskId ? { ...risk, ...updates } : risk)
    }));
  }

  const pageProps: ProjectPageProps = {
    projectState,
    selectedProjectId: selectedProject?.id ?? selectedProjectId,
    role,
    canEdit: editable,
    canManage: manageable,
    clientPreview,
    onOpenTask: setSelectedTaskId,
    onUpdateTask: updateTask,
    onCreateTask: createTask,
    onAddRisk: addRisk,
    onUpdateRisk: updateRisk
  };

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-shell">
        <TopHeader
          role={role}
          onRoleChange={setRole}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          clientPreview={clientPreview}
          onClientPreviewChange={setClientPreview}
        />
        <main className="content-area">
          <ProjectHeader
            projectState={projectState}
            selectedProjectId={selectedProject?.id ?? selectedProjectId}
            onProjectChange={setSelectedProjectId}
            canEdit={editable}
            onNewTask={() => setShowNewTaskForm(true)}
          />
          <GlobalSearchResults
            query={searchQuery}
            tasks={projectTasks}
            documents={projectState.documents.filter((document) => document.projectId === selectedProject?.id)}
            users={projectState.users}
            onOpenTask={setSelectedTaskId}
          />
          {showNewTaskForm && selectedProject ? (
            <NewTaskForm
              projectId={selectedProject.id}
              phases={projectPhases}
              users={projectState.users}
              onCreateTask={createTask}
              onCancel={() => setShowNewTaskForm(false)}
            />
          ) : null}
          {getRoute(pageProps)}
        </main>
      </div>
      {selectedTask ? (
        <TaskDetailPanel
          task={selectedTask}
          phases={projectState.phases}
          users={projectState.users}
          comments={projectState.taskComments.filter((comment) => comment.taskId === selectedTask.id)}
          canEdit={editable}
          onClose={() => setSelectedTaskId(undefined)}
          onUpdateTask={updateTask}
          onAddComment={addTaskComment}
        />
      ) : null}
    </div>
  );
}
