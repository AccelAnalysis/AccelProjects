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

function getRoute() {
  const path = window.location.pathname;

  if (path === "/") {
    return <DashboardPage />;
  }

  if (path === "/projects") {
    return <ProjectsPage />;
  }

  if (path === "/tasks") {
    return <TasksPage />;
  }

  if (path === "/timeline") {
    return <TimelinePage />;
  }

  if (path === "/messages") {
    return <MessagesPage />;
  }

  if (path === "/clients") {
    return <ClientsPage />;
  }

  if (path === "/documents") {
    return <DocumentsPage />;
  }

  if (path === "/metrics") {
    return <MetricsPage />;
  }

  if (path === "/billing") {
    return <CustomerOrderPage />;
  }

  if (path === "/settings") {
    return <SettingsPage />;
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

  return <DashboardPage />;
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
        <span>Operations Mode</span>
        <strong>Billing, email, SMS, and payments preserved</strong>
      </div>
    </aside>
  );
}

function TopHeader() {
  return (
    <header className="top-header">
      <label className="search-box" aria-label="Search">
        <Search size={18} aria-hidden="true" />
        <input placeholder="Search tasks, files, projects, or people..." />
      </label>
      <div className="top-header-actions">
        <button className="icon-button" type="button" aria-label="Notifications">
          <Bell size={18} aria-hidden="true" />
          <span className="notification-dot" />
        </button>
        <div className="user-chip">
          <span className="user-avatar">SJ</span>
          <span>
            <strong>Sarah Jenkins</strong>
            <small>Program Director</small>
          </span>
        </div>
      </div>
    </header>
  );
}

function ProjectHeader() {
  return (
    <section className="project-header">
      <div>
        <p className="eyebrow">Hampton Economic Development</p>
        <div className="project-title-row">
          <h1>City of Hampton - Demographic & Workforce Analysis</h1>
          <span className="status-badge warning">At Risk</span>
        </div>
        <p>Sarah Jenkins owns delivery. Draft development is active with client data dependencies under review.</p>
        <div className="progress-track">
          <span style={{ width: "68%" }} />
        </div>
      </div>
      <button className="action-button" type="button">
        <Plus size={18} aria-hidden="true" />
        New Task
      </button>
    </section>
  );
}

export function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-shell">
        <TopHeader />
        <main className="content-area">
          <ProjectHeader />
          {getRoute()}
        </main>
      </div>
    </div>
  );
}
