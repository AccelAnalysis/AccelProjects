import { Download, LogOut, UserCircle } from "lucide-react";
import type { User as FirebaseUser } from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import {
  downloadPortalReportPdf,
  getPortalMe,
  getPortalProject,
  getPortalProjects,
  getPortalReport
} from "../data/api";
import type { PortalProjectCard, PortalReportDetail, PortalReportSummary, User } from "../types";
import { formatDateOnly } from "../utils/dateOnly";
import accelLogo from "../../Accel_GOH_Logo.png";

type PortalMe = Awaited<ReturnType<typeof getPortalMe>>;

type ClientPortalPageProps = {
  firebaseUser: FirebaseUser;
  userProfile: User | null;
  pathname: string;
  onNavigate: (path: string, options?: { replace?: boolean }) => void;
  onLogout: () => void;
};

function parsePortalRoute(pathname: string) {
  const reportMatch = pathname.match(/^\/portal\/projects\/([^/]+)\/reports\/([^/]+)$/);
  if (reportMatch) {
    return {
      view: "report" as const,
      projectId: decodeURIComponent(reportMatch[1]),
      reportId: decodeURIComponent(reportMatch[2])
    };
  }

  const projectMatch = pathname.match(/^\/portal\/projects\/([^/]+)$/);
  if (projectMatch) {
    return {
      view: "project" as const,
      projectId: decodeURIComponent(projectMatch[1])
    };
  }

  return { view: "home" as const };
}

function healthLabel(health: PortalProjectCard["health"]) {
  if (health === "blocked") return "Blocked";
  if (health === "at_risk") return "At risk";
  return "On track";
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function PortalHeader({
  me,
  fallbackName,
  onNavigate,
  onLogout
}: {
  me: PortalMe | null;
  fallbackName: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const name = me?.displayName || fallbackName || "Client Portal User";
  const initials = name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AP";

  useEffect(() => {
    if (!menuOpen) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  return (
    <header className="portal-header">
      <button className="portal-brand" type="button" onClick={() => onNavigate("/portal")}>
        <img src={accelLogo} alt="" />
        <span>
          <strong>AccelProjects</strong>
          <small>Client Portal</small>
        </span>
      </button>
      <div className="profile-menu-anchor">
        <button
          className="user-chip profile-menu-trigger"
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="user-avatar">{initials}</span>
          <span>
            <strong>{name}</strong>
            <small>{me?.clientName ?? "Client access"}</small>
          </span>
        </button>
        {menuOpen ? (
          <div className="profile-menu" role="menu" aria-label="Client portal profile menu">
            <div className="profile-menu-summary">
              <strong>{name}</strong>
              {me?.email ? <span>{me.email}</span> : null}
            </div>
            <button type="button" role="menuitem" onClick={() => onNavigate("/portal")}>
              <UserCircle size={16} aria-hidden="true" />
              Portal Home
            </button>
            <div className="profile-menu-separator" />
            <button className="danger-menu-item" type="button" role="menuitem" onClick={onLogout}>
              <LogOut size={16} aria-hidden="true" />
              Log Out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}

function PortalProjectList({
  projects,
  onNavigate
}: {
  projects: PortalProjectCard[];
  onNavigate: (path: string) => void;
}) {
  if (projects.length === 0) {
    return (
      <section className="portal-empty">
        <h1>No client projects are published yet.</h1>
        <p>Your AccelProjects team has not published a client-visible project summary for this account.</p>
      </section>
    );
  }

  return (
    <section className="portal-project-grid" aria-label="Published client projects">
      {projects.map((project) => (
        <button
          className="portal-project-card"
          key={project.projectId}
          type="button"
          onClick={() => onNavigate(`/portal/projects/${encodeURIComponent(project.projectId)}`)}
        >
          <span className={`status-badge ${project.health === "blocked" ? "danger" : project.health === "at_risk" ? "warning" : "success"}`}>
            {healthLabel(project.health)}
          </span>
          <strong>{project.projectName}</strong>
          <span>{project.clientFacingSummary || project.statusNarrative || "Published client project summary."}</span>
          <span className="portal-progress-track" aria-label={`${project.progressPercent}% complete`}>
            <span style={{ width: `${Math.min(100, Math.max(0, project.progressPercent))}%` }} />
          </span>
          <small>{project.progressPercent}% complete · Target {formatDateOnly(project.targetDate)}</small>
        </button>
      ))}
    </section>
  );
}

function PortalReportList({
  projectId,
  reports,
  onNavigate
}: {
  projectId: string;
  reports: PortalReportSummary[];
  onNavigate: (path: string) => void;
}) {
  if (reports.length === 0) {
    return <p className="muted">No approved reports have been published to the portal yet.</p>;
  }

  return (
    <div className="portal-report-list">
      {reports.map((report) => (
        <button
          className="portal-report-row"
          key={report.portalReportId}
          type="button"
          onClick={() => onNavigate(`/portal/projects/${encodeURIComponent(projectId)}/reports/${encodeURIComponent(report.portalReportId)}`)}
        >
          <span>
            <strong>{report.title}</strong>
            {report.sourceReportStatus && report.sourceReportStatus !== "approved" ? <em>{report.sourceReportStatus === "voided" ? "This report was later voided" : "A newer approved report supersedes this report"}</em> : null}
            <small>{formatDateOnly(report.reportingPeriodStart)} to {formatDateOnly(report.reportingPeriodEnd)}</small>
          </span>
          <small>Published {formatDateOnly(report.publishedAt)}</small>
        </button>
      ))}
    </div>
  );
}

function PortalReportSections({ report }: { report: PortalReportDetail }) {
  const itemSections = [
    { key: "completedTasks", title: "Completed work", items: report.sections.completedTasks },
    { key: "upcomingTasks", title: "Upcoming work", items: report.sections.upcomingTasks },
    { key: "milestones", title: "Milestones", items: report.sections.milestones },
    { key: "risks", title: "Risks", items: report.sections.risks }
  ];

  return (
    <div className="portal-report-sections">
      <section className="portal-report-section">
        <h3>Executive summary</h3>
        <p>{report.sections.executiveSummary || "No executive summary was included."}</p>
      </section>
      <section className="portal-report-section">
        <h3>Progress summary</h3>
        <p>{report.sections.progressSummary || "No progress summary was included."}</p>
      </section>
      {report.sections.highlights.length > 0 ? (
        <section className="portal-report-section">
          <h3>Highlights</h3>
          <ul>
            {report.sections.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
          </ul>
        </section>
      ) : null}
      {itemSections.map((section) => (
        section.items.length > 0 ? (
          <section className="portal-report-section" key={section.key}>
            <h3>{section.title}</h3>
            <ul>
              {section.items.map((item) => (
                <li key={`${item.title}-${item.dueDate}-${item.status}`}>
                  <strong>{item.title}</strong>
                  <span>{item.status}{item.dueDate ? ` · ${formatDateOnly(item.dueDate)}` : ""}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null
      ))}
      {report.sections.nextSteps || report.sections.clientActions.length > 0 ? (
        <section className="portal-report-section">
          <h3>Next steps</h3>
          {report.sections.nextSteps ? <p>{report.sections.nextSteps}</p> : null}
          {report.sections.clientActions.length > 0 ? (
            <ul>
              {report.sections.clientActions.map((action) => <li key={action}>{action}</li>)}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

export function ClientPortalPage({
  firebaseUser,
  userProfile,
  pathname,
  onNavigate,
  onLogout
}: ClientPortalPageProps) {
  const route = useMemo(() => parsePortalRoute(pathname), [pathname]);
  const [me, setMe] = useState<PortalMe | null>(null);
  const [projects, setProjects] = useState<PortalProjectCard[]>([]);
  const [selectedProject, setSelectedProject] = useState<PortalProjectCard | null>(null);
  const [reports, setReports] = useState<PortalReportSummary[]>([]);
  const [selectedReport, setSelectedReport] = useState<PortalReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pathname.startsWith("/portal")) {
      onNavigate("/portal", { replace: true });
    }
  }, [pathname, onNavigate]);

  useEffect(() => {
    let active = true;

    async function loadPortal() {
      try {
        setLoading(true);
        setError("");
        const [meResult, projectResult] = await Promise.all([getPortalMe(), getPortalProjects()]);
        if (!active) return;
        setMe(meResult);
        setProjects(projectResult.projects);

        if (route.view === "project" || route.view === "report") {
          const projectResponse = await getPortalProject(route.projectId);
          if (!active) return;
          setSelectedProject(projectResponse.project);
          setReports(projectResponse.latestReports);
        } else {
          setSelectedProject(null);
          setReports([]);
        }

        if (route.view === "report") {
          const reportResponse = await getPortalReport(route.projectId, route.reportId);
          if (!active) return;
          setSelectedReport(reportResponse.report);
        } else {
          setSelectedReport(null);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Client portal data could not be loaded.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPortal();
    return () => {
      active = false;
    };
  }, [route, pathname]);

  async function downloadReport(projectId: string, reportId: string) {
    try {
      const result = await downloadPortalReportPdf(projectId, reportId);
      saveBlob(result.blob, result.filename);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "The PDF could not be downloaded.");
    }
  }

  const fallbackName = userProfile?.name ?? firebaseUser.displayName ?? firebaseUser.email ?? "Client Portal User";

  return (
    <div className="portal-shell">
      <PortalHeader me={me} fallbackName={fallbackName} onNavigate={onNavigate} onLogout={onLogout} />
      <main className="portal-content">
        {error ? (
          <section className="portal-alert" role="alert">
            <h1>Client portal unavailable</h1>
            <p>{error}</p>
          </section>
        ) : null}
        {loading ? (
          <section className="portal-empty">
            <h1>Loading client portal</h1>
            <p>Loading published client project data.</p>
          </section>
        ) : null}
        {!loading && !error && route.view === "home" ? (
          <>
            <section className="portal-hero">
              <p>{me?.clientName ?? "Client Portal"}</p>
              <h1>Published project updates</h1>
              <span>{projects.length} active project{projects.length === 1 ? "" : "s"}</span>
            </section>
            <PortalProjectList projects={projects} onNavigate={onNavigate} />
          </>
        ) : null}
        {!loading && !error && (route.view === "project" || route.view === "report") && selectedProject ? (
          <section className="portal-workspace">
            <button className="link-button" type="button" onClick={() => onNavigate("/portal")}>
              Back to portal home
            </button>
            <div className="portal-hero compact">
              <p>{me?.clientName ?? "Client Portal"}</p>
              <h1>{selectedProject.projectName}</h1>
              <span>{selectedProject.progressPercent}% complete · {healthLabel(selectedProject.health)} · Target {formatDateOnly(selectedProject.targetDate)}</span>
            </div>
            {route.view === "project" ? (
              <>
                <section className="portal-summary-panel">
                  <h2>Current status</h2>
                  <p>{selectedProject.statusNarrative || selectedProject.clientFacingSummary || "No client-facing status narrative has been published."}</p>
                  <dl>
                    <div>
                      <dt>Current phase</dt>
                      <dd>{selectedProject.currentPhaseLabel || "Not specified"}</dd>
                    </div>
                    <div>
                      <dt>Next update</dt>
                      <dd>{selectedProject.nextUpdateExpectedAt ? formatDateOnly(selectedProject.nextUpdateExpectedAt) : "Not scheduled"}</dd>
                    </div>
                    <div>
                      <dt>Project manager</dt>
                      <dd>{selectedProject.projectManagerContact.name || "Not specified"}</dd>
                    </div>
                  </dl>
                </section>
                <section className="portal-summary-panel">
                  <h2>Published reports</h2>
                  <PortalReportList projectId={selectedProject.projectId} reports={reports} onNavigate={onNavigate} />
                </section>
              </>
            ) : null}
            {route.view === "report" && selectedReport ? (
              <article className="portal-report-detail">
                <div className="portal-report-title">
                  <div>
                    <p>{formatDateOnly(selectedReport.reportingPeriodStart)} to {formatDateOnly(selectedReport.reportingPeriodEnd)}</p>
                    <h2>{selectedReport.title}</h2>
                    {selectedReport.sourceReportStatus && selectedReport.sourceReportStatus !== "approved" ? <p className="form-error" role="status">{selectedReport.sourceReportStatus === "voided" ? "This approved report was later voided. The historical snapshot remains available." : "This report has been superseded by a newer approved report."}</p> : null}
                  </div>
                  <button className="action-button" type="button" onClick={() => void downloadReport(selectedProject.projectId, selectedReport.portalReportId)}>
                    <Download size={16} aria-hidden="true" />
                    Download PDF
                  </button>
                </div>
                <PortalReportSections report={selectedReport} />
              </article>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
