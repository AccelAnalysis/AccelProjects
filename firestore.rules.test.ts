import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const projectId = "rules-project";
const otherProjectId = "other-project";
const orgId = "org_accel_projects";
let testEnv: RulesTestEnvironment;

function dbFor(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

function orgPath(...parts: string[]) {
  return ["organizations", orgId, ...parts];
}

async function seedBaseData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, ...orgPath()), { id: orgId, name: "AccelProjects" });
    await Promise.all([
      setDoc(doc(db, ...orgPath("users", "admin")), { id: "admin", organizationId: orgId, role: "admin", name: "Admin", email: "admin@example.com", avatarInitials: "A" }),
      setDoc(doc(db, ...orgPath("users", "owner_pm")), { id: "owner_pm", organizationId: orgId, role: "project_manager", name: "Owner", email: "owner@example.com", avatarInitials: "O" }),
      setDoc(doc(db, ...orgPath("users", "lead_pm")), { id: "lead_pm", organizationId: orgId, role: "project_manager", name: "Lead", email: "lead@example.com", avatarInitials: "L" }),
      setDoc(doc(db, ...orgPath("users", "other_pm")), { id: "other_pm", organizationId: orgId, role: "project_manager", name: "Other", email: "other@example.com", avatarInitials: "P" }),
      setDoc(doc(db, ...orgPath("users", "contributor")), { id: "contributor", organizationId: orgId, role: "contributor", name: "Contributor", email: "contributor@example.com", avatarInitials: "C" }),
      setDoc(doc(db, ...orgPath("users", "client")), { id: "client", organizationId: orgId, role: "client", name: "Client", email: "client@example.com", avatarInitials: "C" }),
      setDoc(doc(db, ...orgPath("users", "viewer")), { id: "viewer", organizationId: orgId, role: "viewer", name: "Viewer", email: "viewer@example.com", avatarInitials: "V" })
    ]);
    await Promise.all([
      setDoc(doc(db, ...orgPath("projects", projectId)), { id: projectId, organizationId: orgId, ownerId: "owner_pm", revision: 1, updatedAt: "2026-07-10T00:00:00.000Z", lastStructuralChangeAt: "2026-07-10T00:00:00.000Z" }),
      setDoc(doc(db, ...orgPath("projects", otherProjectId)), { id: otherProjectId, organizationId: orgId, ownerId: "other_pm", revision: 1, updatedAt: "2026-07-10T00:00:00.000Z", lastStructuralChangeAt: "2026-07-10T00:00:00.000Z" }),
      setDoc(doc(db, ...orgPath("projects", projectId, "members", "lead_pm")), { id: "lead_pm", projectId, userId: "lead_pm", role: "lead" }),
      setDoc(doc(db, ...orgPath("projects", projectId, "members", "contributor")), { id: "contributor", projectId, userId: "contributor", role: "contributor" }),
      setDoc(doc(db, ...orgPath("projects", projectId, "tasks", "task_assigned")), { id: "task_assigned", projectId, assigneeId: "contributor", status: "todo", priority: "medium", updatedAt: "2026-07-10T00:00:00.000Z" })
    ]);
  });
}

function projectRef(uid: string) {
  return doc(dbFor(uid), ...orgPath("projects", projectId));
}

function versionRef(uid: string, id = "version_1") {
  return doc(dbFor(uid), ...orgPath("projects", projectId, "versions", id));
}

function snapshotRef(uid: string, id = "snapshot_1") {
  return doc(dbFor(uid), ...orgPath("projects", projectId, "exportSnapshots", id));
}

function manifestRef(uid: string, id = "a".repeat(64)) {
  return doc(dbFor(uid), ...orgPath("projects", projectId, "updateManifests", id));
}

async function assertCanCreateFileRevision(uid: string) {
  await assertSucceeds(updateDoc(projectRef(uid), { revision: 2, updatedAt: "2026-07-10T01:00:00.000Z", lastStructuralChangeAt: "2026-07-10T01:00:00.000Z" }));
  await assertSucceeds(setDoc(versionRef(uid, `version_${uid}`), { id: `version_${uid}`, projectId, revision: 2, previousRevision: 1, changeType: "project_file_updated", actorId: uid, summary: "Updated", metadata: {}, createdAt: "2026-07-10T01:00:00.000Z" }));
  await assertSucceeds(setDoc(snapshotRef(uid, `snapshot_${uid}`), { id: `snapshot_${uid}`, projectId, snapshotType: "revision_result", createdBy: uid, baseRevision: 2, packageId: "pkg", sourceHash: "h", packageJson: "{}" }));
  await assertSucceeds(setDoc(manifestRef(uid, `${uid}${"a".repeat(64)}`.slice(0, 64)), { id: `${uid}${"a".repeat(64)}`.slice(0, 64), projectId, actorId: uid, uploadedFileHash: `${uid}${"a".repeat(64)}`.slice(0, 64) }));
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "accelprojects-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8")
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedBaseData();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("Firestore Phase 4 rules", () => {
  it("allows admin, owner project manager, and lead project manager file revisions", async () => {
    await assertCanCreateFileRevision("admin");
    await seedBaseData();
    await assertCanCreateFileRevision("owner_pm");
    await seedBaseData();
    await assertCanCreateFileRevision("lead_pm");
  });

  it("denies unrelated project manager, contributor, client, and viewer file revisions", async () => {
    for (const uid of ["other_pm", "contributor", "client", "viewer"]) {
      await assertFails(setDoc(versionRef(uid, `version_${uid}`), { id: `version_${uid}`, projectId, revision: 2, previousRevision: 1, changeType: "project_file_updated", actorId: uid, summary: "Updated", metadata: {}, createdAt: "2026-07-10T01:00:00.000Z" }));
    }
  });

  it("denies cross-project snapshot references", async () => {
    await assertFails(setDoc(snapshotRef("owner_pm"), { id: "snapshot_1", projectId: otherProjectId, snapshotType: "revision_result", createdBy: "owner_pm", baseRevision: 2, packageId: "pkg", sourceHash: "h", packageJson: "{}" }));
  });

  it("denies immutable history rewrites", async () => {
    await assertSucceeds(setDoc(versionRef("owner_pm"), { id: "version_1", projectId, revision: 2, previousRevision: 1, changeType: "project_file_updated", actorId: "owner_pm", summary: "Updated", metadata: {}, createdAt: "2026-07-10T01:00:00.000Z" }));
    await assertFails(updateDoc(versionRef("owner_pm"), { summary: "rewritten" }));
    await assertSucceeds(setDoc(snapshotRef("owner_pm"), { id: "snapshot_1", projectId, snapshotType: "manual_export", createdBy: "owner_pm", baseRevision: 1, packageId: "pkg", sourceHash: "h", packageJson: "{}" }));
    await assertFails(updateDoc(snapshotRef("owner_pm"), { packageJson: "rewritten" }));
    await assertSucceeds(setDoc(manifestRef("owner_pm"), { id: "a".repeat(64), projectId, actorId: "owner_pm", uploadedFileHash: "a".repeat(64) }));
    await assertFails(updateDoc(manifestRef("owner_pm"), { resultRevision: 3 }));
  });

  it("denies arbitrary revision increments and preserves contributor task updates", async () => {
    await assertFails(updateDoc(projectRef("viewer"), { revision: 99, updatedAt: "x", lastStructuralChangeAt: "x" }));
    await assertSucceeds(updateDoc(doc(dbFor("contributor"), ...orgPath("projects", projectId, "tasks", "task_assigned")), { status: "in_progress", priority: "high", updatedAt: "2026-07-10T01:00:00.000Z" }));
    await assertFails(setDoc(versionRef("contributor", "bad_file_update"), { id: "bad_file_update", projectId, revision: 2, previousRevision: 1, changeType: "project_file_updated", actorId: "contributor", summary: "Updated", metadata: {}, createdAt: "2026-07-10T01:00:00.000Z" }));
  });
});
