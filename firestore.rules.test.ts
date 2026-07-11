import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

const projectId = "rules-project";
const otherProjectId = "other-project";
const orgId = "org_accel_projects";
let testEnv: RulesTestEnvironment;

function dbFor(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

function unauthenticatedDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function orgPath(...parts: string[]) {
  return ["organizations", orgId, ...parts];
}

function userProfile(id: string, role: string) {
  return {
    id,
    organizationId: orgId,
    role,
    name: id,
    email: `${id}@example.com`,
    avatarInitials: id.slice(0, 2).toUpperCase(),
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
    notificationPreferences: {
      taskAssignments: true,
      dueDates: true,
      risks: true,
      projectMessages: false,
      emailDelivery: false
    }
  };
}

async function seedBaseData() {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, ...orgPath()), { id: orgId, name: "AccelProjects", slug: "accel-projects", createdAt: "2026-07-01T00:00:00.000Z" });
    await Promise.all([
      setDoc(doc(db, ...orgPath("users", "admin")), userProfile("admin", "admin")),
      setDoc(doc(db, ...orgPath("users", "owner_pm")), userProfile("owner_pm", "project_manager")),
      setDoc(doc(db, ...orgPath("users", "lead_pm")), userProfile("lead_pm", "project_manager")),
      setDoc(doc(db, ...orgPath("users", "other_pm")), userProfile("other_pm", "project_manager")),
      setDoc(doc(db, ...orgPath("users", "contributor")), userProfile("contributor", "contributor")),
      setDoc(doc(db, ...orgPath("users", "client")), userProfile("client", "client")),
      setDoc(doc(db, ...orgPath("users", "viewer")), userProfile("viewer", "viewer"))
    ]);
    await Promise.all([
      setDoc(doc(db, ...orgPath("projects", projectId)), { id: projectId, organizationId: orgId, ownerId: "owner_pm", revision: 1, updatedAt: "2026-07-10T00:00:00.000Z", lastStructuralChangeAt: "2026-07-10T00:00:00.000Z" }),
      setDoc(doc(db, ...orgPath("projects", otherProjectId)), { id: otherProjectId, organizationId: orgId, ownerId: "other_pm", revision: 1, updatedAt: "2026-07-10T00:00:00.000Z", lastStructuralChangeAt: "2026-07-10T00:00:00.000Z" }),
      setDoc(doc(db, ...orgPath("projects", projectId, "members", "lead_pm")), { id: "member_lead", projectId, userId: "lead_pm", role: "lead" }),
      setDoc(doc(db, ...orgPath("projects", projectId, "members", "contributor")), { id: "member_contributor", projectId, userId: "contributor", role: "contributor" }),
      setDoc(doc(db, ...orgPath("projects", projectId, "members", "viewer")), { id: "member_viewer", projectId, userId: "viewer", role: "observer" }),
      setDoc(doc(db, ...orgPath("projects", projectId, "members", "client")), { id: "member_client", projectId, userId: "client", role: "observer" }),
      setDoc(doc(db, ...orgPath("projects", projectId, "tasks", "task_assigned")), { id: "task_assigned", projectId, assigneeId: "contributor", status: "todo", priority: "medium", updatedAt: "2026-07-10T00:00:00.000Z" })
    ]);
  });
}

function userRef(uid: string, targetUid = uid) {
  return doc(dbFor(uid), ...orgPath("users", targetUid));
}

function projectRef(uid: string, id = projectId) {
  return doc(dbFor(uid), ...orgPath("projects", id));
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

describe("Firestore operational readiness rules", () => {
  it("denies unauthenticated access", async () => {
    await assertFails(getDoc(doc(unauthenticatedDb(), ...orgPath("users", "admin"))));
    await assertFails(getDoc(doc(unauthenticatedDb(), ...orgPath("projects", projectId))));
  });

  it("lets users read and update only their own self-service profile fields", async () => {
    await assertSucceeds(getDoc(userRef("contributor")));
    await assertSucceeds(updateDoc(userRef("contributor"), {
      name: "Contributor Updated",
      avatarInitials: "CU",
      notificationPreferences: {
        taskAssignments: false,
        dueDates: true,
        risks: true,
        projectMessages: true,
        emailDelivery: false
      },
      updatedAt: "2026-07-10T02:00:00.000Z"
    }));
  });

  it("prevents users from changing their own role or organization ID", async () => {
    await assertFails(updateDoc(userRef("contributor"), { role: "admin", updatedAt: "2026-07-10T02:00:00.000Z" }));
    await assertFails(updateDoc(userRef("contributor"), { organizationId: "other_org", updatedAt: "2026-07-10T02:00:00.000Z" }));
  });

  it("prevents users from editing another user or assigning roles", async () => {
    await assertFails(updateDoc(userRef("contributor", "viewer"), { name: "Edited", updatedAt: "2026-07-10T02:00:00.000Z" }));
    await assertFails(updateDoc(userRef("other_pm", "viewer"), { role: "admin", updatedAt: "2026-07-10T02:00:00.000Z" }));
  });

  it("allows administrators to perform authorized role updates and delete other users only", async () => {
    await assertSucceeds(updateDoc(userRef("admin", "viewer"), { role: "contributor", updatedAt: "2026-07-10T02:00:00.000Z" }));
    await assertSucceeds(deleteDoc(userRef("admin", "viewer")));
    await assertFails(deleteDoc(userRef("admin", "admin")));
  });

  it("denies unauthorized organization updates and allows supported admin updates", async () => {
    await assertFails(updateDoc(doc(dbFor("owner_pm"), ...orgPath()), { name: "Renamed", updatedAt: "2026-07-10T02:00:00.000Z" }));
    await assertSucceeds(updateDoc(doc(dbFor("admin"), ...orgPath()), { name: "AccelProjects Internal", updatedAt: "2026-07-10T02:00:00.000Z" }));
    await assertFails(updateDoc(doc(dbFor("admin"), ...orgPath()), { slug: "changed", updatedAt: "2026-07-10T02:00:00.000Z" }));
  });

  it("preserves owner, lead, and contributor project access while denying unrelated users", async () => {
    await assertSucceeds(getDoc(projectRef("admin")));
    await assertSucceeds(getDoc(projectRef("owner_pm")));
    await assertSucceeds(getDoc(projectRef("lead_pm")));
    await assertSucceeds(getDoc(projectRef("contributor")));
    await assertSucceeds(getDoc(projectRef("viewer")));
    await assertFails(getDoc(projectRef("viewer", otherProjectId)));
    await assertFails(getDoc(projectRef("client")));
  });

  it("supports membership-scoped project loading queries", async () => {
    const memberQuery = query(collectionGroup(dbFor("contributor"), "members"), where("userId", "==", "contributor"));
    const otherMemberQuery = query(collectionGroup(dbFor("contributor"), "members"), where("userId", "==", "viewer"));
    const ownerQuery = query(collection(dbFor("owner_pm"), ...orgPath("projects")), where("ownerId", "==", "owner_pm"));

    await assertSucceeds(getDocs(memberQuery));
    await assertFails(getDocs(otherMemberQuery));
    await assertSucceeds(getDocs(ownerQuery));
  });

  it("preserves contributor task-update restrictions", async () => {
    await assertSucceeds(updateDoc(doc(dbFor("contributor"), ...orgPath("projects", projectId, "tasks", "task_assigned")), { status: "in_progress", priority: "high", updatedAt: "2026-07-10T01:00:00.000Z" }));
    await assertFails(updateDoc(doc(dbFor("contributor"), ...orgPath("projects", projectId, "tasks", "task_assigned")), { assigneeId: "viewer", updatedAt: "2026-07-10T01:00:00.000Z" }));
    await assertFails(updateDoc(projectRef("viewer"), { revision: 99, updatedAt: "x", lastStructuralChangeAt: "x" }));
  });

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

  it("keeps versions, snapshots, and update manifests immutable", async () => {
    await assertSucceeds(setDoc(versionRef("owner_pm"), { id: "version_1", projectId, revision: 2, previousRevision: 1, changeType: "project_file_updated", actorId: "owner_pm", summary: "Updated", metadata: {}, createdAt: "2026-07-10T01:00:00.000Z" }));
    await assertFails(updateDoc(versionRef("owner_pm"), { summary: "rewritten" }));
    await assertSucceeds(setDoc(snapshotRef("owner_pm"), { id: "snapshot_1", projectId, snapshotType: "manual_export", createdBy: "owner_pm", baseRevision: 1, packageId: "pkg", sourceHash: "h", packageJson: "{}" }));
    await assertFails(updateDoc(snapshotRef("owner_pm"), { packageJson: "rewritten" }));
    await assertSucceeds(setDoc(manifestRef("owner_pm"), { id: "a".repeat(64), projectId, actorId: "owner_pm", uploadedFileHash: "a".repeat(64) }));
    await assertFails(updateDoc(manifestRef("owner_pm"), { resultRevision: 3 }));
  });
});
