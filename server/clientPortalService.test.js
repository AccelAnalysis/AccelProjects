import { describe, expect, it } from "vitest";
import {
  PortalServiceError,
  assertClientSafeSnapshot,
  loadPortalAccess,
  toPortalSnapshotDto
} from "./clientPortalService.js";

const orgId = "org_accel_projects";

function orgPath(...parts) {
  return `organizations/${orgId}${parts.length ? `/${parts.join("/")}` : ""}`;
}

function fakeDb(records) {
  return {
    doc(path) {
      return {
        async get() {
          const data = records[path];
          return {
            id: path.split("/").at(-1),
            exists: Boolean(data),
            data: () => data
          };
        }
      };
    }
  };
}

function baseRecords(overrides = {}) {
  return {
    [orgPath("clients", "client_1")]: { id: "client_1", name: "Client One" },
    [orgPath("clients", "client_2")]: { id: "client_2", name: "Client Two" },
    [orgPath("portalUsers", "client_user")]: {
      id: "client_user",
      userId: "client_user",
      organizationId: orgId,
      clientId: "client_1",
      status: "active",
      email: "client@example.com"
    },
    [orgPath("portalUsers", "client_user", "projectAccess", "project_1")]: {
      id: "project_1",
      userId: "client_user",
      projectId: "project_1",
      clientId: "client_1",
      status: "active",
      accessLevel: "read_only",
      expiresAt: null
    },
    [orgPath("projects", "project_1")]: {
      id: "project_1",
      clientId: "client_1",
      name: "Portal Project"
    },
    ...overrides
  };
}

const actor = {
  uid: "client_user",
  email: "client@example.com",
  profile: { role: "client", name: "Client User" }
};

describe("client portal service authorization", () => {
  it("loads active read-only project access for the matching client", async () => {
    const access = await loadPortalAccess(actor, "project_1", {
      database: fakeDb(baseRecords()),
      now: "2026-07-12T00:00:00.000Z"
    });

    expect(access.portalUser.clientId).toBe("client_1");
    expect(access.projectAccess.accessLevel).toBe("read_only");
    expect(access.project.id).toBe("project_1");
  });

  it("denies non-client actors and suspended portal users", async () => {
    await expect(loadPortalAccess({ ...actor, profile: { role: "viewer" } }, undefined, { database: fakeDb(baseRecords()) }))
      .rejects.toMatchObject({ status: 403, code: "portal_denied" });

    await expect(loadPortalAccess(actor, undefined, {
      database: fakeDb(baseRecords({
        [orgPath("portalUsers", "client_user")]: {
          id: "client_user",
          userId: "client_user",
          organizationId: orgId,
          clientId: "client_1",
          status: "suspended"
        }
      }))
    })).rejects.toThrow("suspended");
  });

  it("returns not found for missing, cross-client, or expired project grants", async () => {
    await expect(loadPortalAccess(actor, "project_2", {
      database: fakeDb(baseRecords()),
      now: "2026-07-12T00:00:00.000Z"
    })).rejects.toMatchObject({ status: 404, code: "portal_not_found" });

    await expect(loadPortalAccess(actor, "project_1", {
      database: fakeDb(baseRecords({
        [orgPath("portalUsers", "client_user", "projectAccess", "project_1")]: {
          id: "project_1",
          userId: "client_user",
          projectId: "project_1",
          clientId: "client_2",
          status: "active",
          accessLevel: "read_only"
        }
      })),
      now: "2026-07-12T00:00:00.000Z"
    })).rejects.toMatchObject({ status: 404, code: "portal_not_found" });

    await expect(loadPortalAccess(actor, "project_1", {
      database: fakeDb(baseRecords({
        [orgPath("portalUsers", "client_user", "projectAccess", "project_1")]: {
          id: "project_1",
          userId: "client_user",
          projectId: "project_1",
          clientId: "client_1",
          status: "active",
          accessLevel: "read_only",
          expiresAt: "2026-07-01T00:00:00.000Z"
        }
      })),
      now: "2026-07-12T00:00:00.000Z"
    })).rejects.toMatchObject({ status: 404, code: "portal_not_found" });
  });
});

describe("client portal report DTOs", () => {
  it("excludes internal IDs, owners, source hashes, and revision metadata from portal report details", () => {
    const snapshot = {
      id: "snapshot_internal",
      projectId: "project_1",
      clientId: "client_1",
      reportId: "report_internal",
      visibility: "client_visible",
      title: "Weekly Progress",
      reportingPeriodStart: "2026-07-01",
      reportingPeriodEnd: "2026-07-08",
      approvedAt: "2026-07-08T00:00:00.000Z",
      contentHash: "abc123",
      projectRevisionAtApproval: 12,
      sections: {
        executiveSummary: "Summary",
        progressSummary: "Progress",
        nextSteps: "Next",
        clientActions: ["Review"],
        highlights: ["Done"],
        completedTasks: [{ id: "task_internal", title: "Complete setup", status: "done", dueDate: "2026-07-07", owner: "Internal Owner" }],
        upcomingTasks: [],
        milestones: [],
        risks: []
      }
    };
    const dto = toPortalSnapshotDto(
      snapshot,
      { snapshotId: "snapshot_internal", publishedAt: "2026-07-08T01:00:00.000Z" },
      { projectName: "Portal Project", clientName: "Client One" }
    );

    expect(dto.portalReportId).toBe("snapshot_internal");
    expect(JSON.stringify(dto)).not.toContain("task_internal");
    expect(JSON.stringify(dto)).not.toContain("Internal Owner");
    expect(JSON.stringify(dto)).not.toContain("abc123");
    expect(JSON.stringify(dto)).not.toContain("projectRevisionAtApproval");
    expect(dto.sections.completedTasks[0]).toEqual({
      title: "Complete setup",
      status: "done",
      dueDate: "2026-07-07",
      owner: ""
    });
  });

  it("rejects snapshots for the wrong client or non-client visibility", () => {
    expect(() => assertClientSafeSnapshot({ projectId: "project_1", clientId: "client_2", sections: {}, approvedAt: "now" }, { id: "project_1" }, "client_1"))
      .toThrow(PortalServiceError);
    expect(() => assertClientSafeSnapshot({ projectId: "project_1", clientId: "client_1", visibility: "internal", sections: {}, approvedAt: "now" }, { id: "project_1" }, "client_1"))
      .toThrow(PortalServiceError);
  });
});
