/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User as FirebaseUser } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadPortalReportPdf,
  getPortalMe,
  getPortalProject,
  getPortalProjects,
  getPortalReport
} from "../data/api";
import { ClientPortalPage } from "./ClientPortalPage";

vi.mock("../data/api", () => ({
  downloadPortalReportPdf: vi.fn(),
  getPortalMe: vi.fn(),
  getPortalProject: vi.fn(),
  getPortalProjects: vi.fn(),
  getPortalReport: vi.fn()
}));

const firebaseUser = {
  uid: "client_user",
  email: "client@example.com",
  displayName: "Client User"
} as FirebaseUser;

const portalMe = {
  userId: "client_user",
  email: "client@example.com",
  displayName: "Client User",
  clientId: "client_1",
  clientName: "Client One",
  portalStatus: "active" as const,
  projectCount: 1
};

const portalProject = {
  projectId: "project_1",
  projectName: "Client Portal Build",
  clientFacingSummary: "Client-safe project summary.",
  health: "on_track" as const,
  progressPercent: 45,
  targetDate: "2026-08-15",
  currentPhaseLabel: "Implementation",
  statusNarrative: "Implementation is progressing.",
  nextUpdateExpectedAt: "2026-07-19",
  projectManagerContact: { name: "PM One", email: "pm@example.com", phone: "" },
  latestPublishedReportSnapshotId: "snapshot_1",
  publishedAt: "2026-07-12T00:00:00.000Z"
};

const portalReportSummary = {
  portalReportId: "snapshot_1",
  title: "Weekly Progress",
  projectName: "Client Portal Build",
  clientName: "Client One",
  reportingPeriodStart: "2026-07-01",
  reportingPeriodEnd: "2026-07-08",
  approvedAt: "2026-07-08T00:00:00.000Z",
  publishedAt: "2026-07-08T01:00:00.000Z",
  pdfAvailable: true
};

const portalReport = {
  ...portalReportSummary,
  sections: {
    executiveSummary: "Executive summary for the client.",
    progressSummary: "Progress summary for the client.",
    nextSteps: "Next steps.",
    clientActions: ["Approve the next milestone"],
    highlights: ["Launch path confirmed"],
    completedTasks: [{ title: "Complete setup", status: "done", dueDate: "2026-07-07", owner: "" }],
    upcomingTasks: [],
    milestones: [],
    risks: []
  },
  projectManagerContact: portalProject.projectManagerContact
};

function mockPortalApi() {
  vi.mocked(getPortalMe).mockResolvedValue(portalMe);
  vi.mocked(getPortalProjects).mockResolvedValue({ projects: [portalProject] });
  vi.mocked(getPortalProject).mockResolvedValue({ project: portalProject, latestReports: [portalReportSummary] });
  vi.mocked(getPortalReport).mockResolvedValue({ report: portalReport });
  vi.mocked(downloadPortalReportPdf).mockResolvedValue({ blob: new Blob(["pdf"], { type: "application/pdf" }), filename: "weekly-progress.pdf" });
}

function renderPortal(pathname = "/portal", onNavigate = vi.fn()) {
  return {
    onNavigate,
    ...render(
      <ClientPortalPage
        firebaseUser={firebaseUser}
        userProfile={null}
        pathname={pathname}
        onNavigate={onNavigate}
        onLogout={vi.fn()}
      />
    )
  };
}

beforeEach(() => {
  mockPortalApi();
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn(() => "blob:portal-report"),
    revokeObjectURL: vi.fn()
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ClientPortalPage", () => {
  it("renders published client projects without internal navigation", async () => {
    renderPortal();

    expect(await screen.findByRole("heading", { name: "Published project updates" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Client Portal Build/ })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
  });

  it("loads a project and opens a published report detail", async () => {
    const user = userEvent.setup();
    const { onNavigate } = renderPortal("/portal/projects/project_1");

    expect(await screen.findByRole("heading", { name: "Client Portal Build" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Weekly Progress/ }));

    expect(onNavigate).toHaveBeenCalledWith("/portal/projects/project_1/reports/snapshot_1");
  });

  it("renders client-safe report details and downloads the portal PDF", async () => {
    const user = userEvent.setup();
    renderPortal("/portal/projects/project_1/reports/snapshot_1");

    expect(await screen.findByRole("heading", { name: "Weekly Progress" })).toBeInTheDocument();
    expect(screen.getByText("Executive summary for the client.")).toBeInTheDocument();
    expect(screen.getByText("Complete setup")).toBeInTheDocument();
    expect(screen.queryByText(/snapshot_internal|contentHash|projectRevisionAtApproval/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Download PDF" }));

    await waitFor(() => expect(downloadPortalReportPdf).toHaveBeenCalledWith("project_1", "snapshot_1"));
  });

  it("shows a clear access error when portal access is not configured", async () => {
    vi.mocked(getPortalMe).mockRejectedValueOnce(new Error("Client portal access is not configured for this account."));

    renderPortal();

    expect(await screen.findByRole("heading", { name: "Client portal unavailable" })).toBeInTheDocument();
    expect(screen.getByText("Client portal access is not configured for this account.")).toBeInTheDocument();
  });
});
