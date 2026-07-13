import { describe, expect, it } from "vitest";
import { loadProjectAccess } from "./projectAuthorization.js";

function fakeSnapshot(exists, data) {
  return {
    exists,
    id: data?.id,
    data: () => data
  };
}

function fakeDb({ project, memberships = {} }) {
  return {
    doc: () => ({
      get: async () => project ? fakeSnapshot(true, project) : fakeSnapshot(false),
      collection: () => ({
        doc: (uid) => ({
          get: async () => memberships[uid] ? fakeSnapshot(true, memberships[uid]) : fakeSnapshot(false)
        })
      })
    })
  };
}

describe("project API authorization", () => {
  const project = { id: "project_1", ownerId: "owner_pm" };
  const memberships = {
    lead_pm: { id: "lead_pm", userId: "lead_pm", role: "lead", accessState: "active" },
    contributor: { id: "contributor", userId: "contributor", role: "contributor", accessState: "active" },
    viewer: { id: "viewer", userId: "viewer", role: "observer", accessState: "active" },
    client: { id: "client", userId: "client", role: "observer", accessState: "active" },
    removed_pm: { id: "removed_pm", userId: "removed_pm", role: "lead", accessState: "removed", lifecycle: { state: "removed" } }
  };

  it("allows admin, owner manager, and lead manager to manage communications and calendar events", async () => {
    await expect(loadProjectAccess({ uid: "admin", role: "admin" }, "project_1", { database: fakeDb({ project, memberships }) }))
      .resolves.toMatchObject({ canRead: true, canManageCommunication: true, canManageCalendar: true });
    await expect(loadProjectAccess({ uid: "owner_pm", role: "project_manager" }, "project_1", { database: fakeDb({ project, memberships }) }))
      .resolves.toMatchObject({ canRead: true, canManageCommunication: true, canManageCalendar: true });
    await expect(loadProjectAccess({ uid: "lead_pm", role: "project_manager" }, "project_1", { database: fakeDb({ project, memberships }) }))
      .resolves.toMatchObject({ canRead: true, canManageCommunication: true, canManageCalendar: true });
  });

  it("allows contributors and viewers to read but not send or manage calendar records", async () => {
    await expect(loadProjectAccess({ uid: "contributor", role: "contributor" }, "project_1", { database: fakeDb({ project, memberships }) }))
      .resolves.toMatchObject({ canRead: true, canManageCommunication: false, canManageCalendar: false });
    await expect(loadProjectAccess({ uid: "viewer", role: "viewer" }, "project_1", { database: fakeDb({ project, memberships }) }))
      .resolves.toMatchObject({ canRead: true, canManageCommunication: false, canManageCalendar: false });
  });

  it("denies unrelated project managers and client-role users", async () => {
    await expect(loadProjectAccess({ uid: "other_pm", role: "project_manager" }, "project_1", { database: fakeDb({ project, memberships }) }))
      .resolves.toMatchObject({ canRead: false, canManageCommunication: false, canManageCalendar: false });
    await expect(loadProjectAccess({ uid: "client", role: "client" }, "project_1", { database: fakeDb({ project, memberships }) }))
      .resolves.toMatchObject({ canRead: false, canManageCommunication: false, canManageCalendar: false });
    await expect(loadProjectAccess({ uid: "removed_pm", role: "project_manager" }, "project_1", { database: fakeDb({ project, memberships }) }))
      .resolves.toMatchObject({ canRead: false, canManageCommunication: false, canManageCalendar: false });
  });

  it("returns not found without leaking unavailable project details", async () => {
    await expect(loadProjectAccess({ uid: "admin", role: "admin" }, "missing", { database: fakeDb({ project: null }) }))
      .resolves.toMatchObject({ found: false, canRead: false });
  });
});
