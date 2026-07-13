import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, collectionGroup, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

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
      setDoc(doc(db, ...orgPath("projects", projectId, "members", "lead_pm")), { id: "member_lead", projectId, userId: "lead_pm", role: "lead", accessState: "active" }),
      setDoc(doc(db, ...orgPath("projects", projectId, "members", "contributor")), { id: "member_contributor", projectId, userId: "contributor", role: "contributor", accessState: "active" }),
      setDoc(doc(db, ...orgPath("projects", projectId, "members", "viewer")), { id: "member_viewer", projectId, userId: "viewer", role: "observer", accessState: "active" }),
      setDoc(doc(db, ...orgPath("projects", projectId, "members", "client")), { id: "member_client", projectId, userId: "client", role: "observer", accessState: "active" }),
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

function communicationRef(uid: string, id = "comm_1") {
  return doc(dbFor(uid), ...orgPath("projects", projectId, "communications", id));
}

function deliveryAttemptRef(uid: string, communicationId = "comm_1", id = "attempt_1") {
  return doc(dbFor(uid), ...orgPath("projects", projectId, "communications", communicationId, "deliveryAttempts", id));
}

function calendarEventRef(uid: string, id = "cal_1") {
  return doc(dbFor(uid), ...orgPath("projects", projectId, "calendarEvents", id));
}

function reportRef(uid: string, id = "report_1") {
  return doc(dbFor(uid), ...orgPath("projects", projectId, "reports", id));
}

function reportSnapshotRef(uid: string, reportId = "report_1", id = "snapshot_1") {
  return doc(dbFor(uid), ...orgPath("projects", projectId, "reports", reportId, "snapshots", id));
}

function reportArtifactRef(uid: string, reportId = "report_1", id = "artifact_1") {
  return doc(dbFor(uid), ...orgPath("projects", projectId, "reports", reportId, "artifacts", id));
}

function portalUserRef(uid: string, portalUserId = "client") {
  return doc(dbFor(uid), ...orgPath("portalUsers", portalUserId));
}

function portalProjectAccessRef(uid: string, portalUserId = "client", accessProjectId = projectId) {
  return doc(dbFor(uid), ...orgPath("portalUsers", portalUserId, "projectAccess", accessProjectId));
}

function portalProjectRef(uid: string, id = projectId) {
  return doc(dbFor(uid), ...orgPath("portalProjects", id));
}

function reportPublicationRef(uid: string, id = "snapshot_1") {
  return doc(dbFor(uid), ...orgPath("projects", projectId, "reportPublications", id));
}

function communicationDraft(id: string, actorId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    organizationId: orgId,
    projectId,
    channel: "email",
    direction: "outbound",
    audience: "client",
    visibility: "internal",
    status: "draft",
    subject: "Project update",
    bodyText: "Status update",
    toRecipients: [{ email: "client@example.com" }],
    ccRecipients: [],
    bccRecipients: [],
    senderMailbox: "sender@example.com",
    provider: "microsoft_graph",
    sourceType: "manual_project_update",
    sourceId: null,
    attachmentRefs: [],
    idempotencyKey: "idem_1",
    createdBy: actorId,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedBy: actorId,
    updatedAt: "2026-07-10T00:00:00.000Z",
    sendRequestedAt: null,
    acceptedAt: null,
    failedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides
  };
}

function calendarDraft(id: string, actorId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    organizationId: orgId,
    projectId,
    title: "Project review",
    descriptionText: "Review progress",
    visibility: "internal",
    status: "draft",
    calendarOwnerEmail: "calendar@example.com",
    startDateTime: "2026-07-12T15:00:00",
    endDateTime: "2026-07-12T16:00:00",
    timeZone: "Eastern Standard Time",
    isAllDay: false,
    location: "",
    attendees: [{ email: "client@example.com" }],
    reminderMinutesBeforeStart: 15,
    relatedEntityType: "project",
    relatedEntityId: null,
    transactionId: "txn_1",
    graphEventId: null,
    graphICalUId: null,
    graphWebLink: null,
    graphChangeKey: null,
    createdBy: actorId,
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedBy: actorId,
    updatedAt: "2026-07-10T00:00:00.000Z",
    lastSyncedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides
  };
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

  it("allows authorized role updates but denies browser user deletion", async () => {
    await assertSucceeds(updateDoc(userRef("admin", "viewer"), { role: "contributor", updatedAt: "2026-07-10T02:00:00.000Z" }));
    await assertFails(deleteDoc(userRef("admin", "viewer")));
    await assertFails(deleteDoc(userRef("admin", "admin")));
  });

  it("denies browser hard delete and lifecycle forgery for managed records", async () => {
    const task = doc(dbFor("owner_pm"), ...orgPath("projects", projectId, "tasks", "task_assigned"));
    await assertFails(deleteDoc(projectRef("admin")));
    await assertFails(deleteDoc(task));
    await assertFails(updateDoc(task, { lifecycle: { schemaVersion: 1, state: "trashed", retentionClass: "operational_30d", legalHold: false, lastOperationId: "forged" } }));
    await assertFails(updateDoc(doc(dbFor("owner_pm"), ...orgPath("projects", projectId, "members", "contributor")), { accessState: "removed" }));
    await assertFails(updateDoc(projectRef("admin"), { lifecycle: { schemaVersion: 1, state: "archived", retentionClass: "business_7y", legalHold: false, lastOperationId: "forged" } }));
    await assertFails(setDoc(doc(dbFor("admin"), ...orgPath("recordLifecycleOperations", "forged")), { id: "forged", actorId: "admin" }));
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
    const memberQuery = query(collectionGroup(dbFor("contributor"), "members"), where("userId", "==", "contributor"), where("accessState", "==", "active"));
    const otherMemberQuery = query(collectionGroup(dbFor("contributor"), "members"), where("userId", "==", "viewer"), where("accessState", "==", "active"));
    const ownerQuery = query(collection(dbFor("owner_pm"), ...orgPath("projects")), where("ownerId", "==", "owner_pm"));

    await assertSucceeds(getDocs(memberQuery));
    await assertFails(getDocs(otherMemberQuery));
    await assertSucceeds(getDocs(ownerQuery));
  });

  it("immediately revokes access when a project membership is lifecycle-removed", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), ...orgPath("projects", projectId, "members", "contributor")), { accessState: "removed", lifecycle: { schemaVersion: 1, state: "removed", retentionClass: "relationship_30d", lastOperationId: "op_remove" } });
    });
    await assertFails(getDoc(projectRef("contributor")));
    const removedMemberships = await assertSucceeds(getDocs(query(collectionGroup(dbFor("contributor"), "members"), where("userId", "==", "contributor"), where("accessState", "==", "active"))));
    expect(removedMemberships.docs).toHaveLength(0);
    await assertFails(getDocs(query(collectionGroup(dbFor("contributor"), "members"), where("userId", "==", "contributor"))));
    await assertFails(getDoc(doc(dbFor("contributor"), ...orgPath("projects", projectId, "tasks", "task_assigned"))));
    await assertFails(updateDoc(doc(dbFor("contributor"), ...orgPath("projects", projectId, "tasks", "task_assigned")), { status: "in_progress", priority: "high", updatedAt: "2026-07-10T01:00:00.000Z" }));

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), ...orgPath("projects", projectId, "members", "contributor")), { accessState: "active", lifecycle: { schemaVersion: 1, state: "active", retentionClass: "relationship_30d", lastOperationId: "op_restore" } });
    });
    const restoredMemberships = await assertSucceeds(getDocs(query(collectionGroup(dbFor("contributor"), "members"), where("userId", "==", "contributor"), where("accessState", "==", "active"))));
    expect(restoredMemberships.docs.map((item) => item.ref.path)).toEqual([`organizations/${orgId}/projects/${projectId}/members/contributor`]);
    await assertSucceeds(getDoc(projectRef("contributor")));
  });

  it("fails closed for legacy memberships until accessState is backfilled", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await updateDoc(doc(context.firestore(), ...orgPath("projects", projectId, "members", "viewer")), { accessState: deleteField() });
    });
    await assertFails(getDoc(projectRef("viewer")));
    const memberships = await assertSucceeds(getDocs(query(collectionGroup(dbFor("viewer"), "members"), where("userId", "==", "viewer"), where("accessState", "==", "active"))));
    expect(memberships.empty).toBe(true);
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

  it("protects project communications by role and status field ownership", async () => {
    await assertSucceeds(setDoc(communicationRef("owner_pm"), communicationDraft("comm_1", "owner_pm")));
    await assertSucceeds(getDoc(communicationRef("contributor")));
    await assertSucceeds(getDoc(communicationRef("viewer")));
    await assertFails(getDoc(communicationRef("client")));
    await assertFails(setDoc(communicationRef("contributor", "comm_contributor"), communicationDraft("comm_contributor", "contributor")));
    await assertFails(setDoc(communicationRef("viewer", "comm_viewer"), communicationDraft("comm_viewer", "viewer")));
    await assertFails(setDoc(communicationRef("client", "comm_client"), communicationDraft("comm_client", "client")));
    await assertFails(updateDoc(communicationRef("owner_pm"), { status: "accepted", acceptedAt: "2026-07-10T02:00:00.000Z" }));
    await assertFails(updateDoc(communicationRef("owner_pm"), { senderMailbox: "other@example.com", updatedAt: "2026-07-10T02:00:00.000Z" }));
    await assertSucceeds(updateDoc(communicationRef("owner_pm"), { subject: "Updated subject", updatedBy: "owner_pm", updatedAt: "2026-07-10T02:00:00.000Z" }));
  });

  it("keeps delivery attempts server-written and immutable", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, ...orgPath("projects", projectId, "communications", "comm_accepted")), communicationDraft("comm_accepted", "owner_pm", { status: "accepted" }));
      await setDoc(doc(db, ...orgPath("projects", projectId, "communications", "comm_accepted", "deliveryAttempts", "attempt_1")), {
        id: "attempt_1",
        projectId,
        communicationId: "comm_accepted",
        status: "accepted"
      });
    });

    await assertSucceeds(getDoc(deliveryAttemptRef("owner_pm", "comm_accepted")));
    await assertFails(setDoc(deliveryAttemptRef("owner_pm", "comm_accepted", "attempt_2"), { id: "attempt_2", status: "accepted" }));
    await assertFails(updateDoc(deliveryAttemptRef("owner_pm", "comm_accepted"), { status: "failed" }));
  });

  it("protects calendar events and Graph sync fields", async () => {
    await assertSucceeds(setDoc(calendarEventRef("lead_pm"), calendarDraft("cal_1", "lead_pm")));
    await assertSucceeds(getDoc(calendarEventRef("contributor")));
    await assertFails(getDoc(calendarEventRef("client")));
    await assertFails(setDoc(calendarEventRef("contributor", "cal_contributor"), calendarDraft("cal_contributor", "contributor")));
    await assertFails(updateDoc(calendarEventRef("lead_pm"), { graphEventId: "graph_1", status: "scheduled", lastSyncedAt: "2026-07-10T02:00:00.000Z" }));
    await assertFails(updateDoc(calendarEventRef("lead_pm"), { projectId: otherProjectId, updatedAt: "2026-07-10T02:00:00.000Z" }));
    await assertSucceeds(updateDoc(calendarEventRef("lead_pm"), { title: "Updated review", updatedBy: "lead_pm", updatedAt: "2026-07-10T02:00:00.000Z" }));
  });

  it("lets project readers view report snapshots but keeps browser report writes server-only", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, ...orgPath("projects", projectId, "reports", "report_1")), {
        id: "report_1",
        organizationId: orgId,
        projectId,
        title: "Client report",
        status: "approved",
        latestApprovedSnapshotId: "snapshot_1",
        createdBy: "owner_pm",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedBy: "owner_pm",
        updatedAt: "2026-07-10T00:00:00.000Z"
      });
      await setDoc(doc(db, ...orgPath("projects", projectId, "reports", "report_1", "snapshots", "snapshot_1")), {
        id: "snapshot_1",
        projectId,
        reportId: "report_1",
        contentHash: "abc",
        approvedAt: "2026-07-10T00:00:00.000Z"
      });
      await setDoc(doc(db, ...orgPath("projects", projectId, "reports", "report_1", "artifacts", "artifact_1")), {
        id: "artifact_1",
        projectId,
        reportId: "report_1",
        snapshotId: "snapshot_1",
        sha256: "def"
      });
    });

    await assertSucceeds(getDoc(reportRef("owner_pm")));
    await assertSucceeds(getDoc(reportSnapshotRef("lead_pm")));
    await assertSucceeds(getDoc(reportArtifactRef("contributor")));
    await assertFails(getDoc(reportRef("client")));
    await assertFails(setDoc(reportRef("owner_pm", "report_2"), { id: "report_2", projectId, title: "Forged draft" }));
    await assertFails(updateDoc(reportRef("owner_pm"), { title: "Mutated approved report" }));
    await assertFails(setDoc(reportSnapshotRef("owner_pm", "report_1", "snapshot_2"), { id: "snapshot_2", projectId, reportId: "report_1", contentHash: "forged" }));
    await assertFails(updateDoc(reportSnapshotRef("owner_pm"), { contentHash: "changed" }));
    await assertFails(setDoc(reportArtifactRef("owner_pm", "report_1", "artifact_2"), { id: "artifact_2", projectId, reportId: "report_1", snapshotId: "snapshot_1" }));
  });

  it("keeps client portal persistence paths server-only from browser Firestore clients", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, ...orgPath("portalUsers", "client")), {
        id: "client",
        organizationId: orgId,
        userId: "client",
        clientId: "client_1",
        status: "active"
      });
      await setDoc(doc(db, ...orgPath("portalUsers", "client", "projectAccess", projectId)), {
        id: projectId,
        userId: "client",
        projectId,
        clientId: "client_1",
        accessLevel: "read_only",
        status: "active"
      });
      await setDoc(doc(db, ...orgPath("portalProjects", projectId)), {
        id: projectId,
        organizationId: orgId,
        projectId,
        clientId: "client_1",
        publicationStatus: "published",
        visibility: "client_visible"
      });
      await setDoc(doc(db, ...orgPath("projects", projectId, "reportPublications", "snapshot_1")), {
        id: "snapshot_1",
        organizationId: orgId,
        projectId,
        clientId: "client_1",
        snapshotId: "snapshot_1",
        status: "published"
      });
    });

    for (const uid of ["admin", "owner_pm", "client"]) {
      await assertFails(getDoc(portalUserRef(uid)));
      await assertFails(getDoc(portalProjectAccessRef(uid)));
      await assertFails(getDoc(portalProjectRef(uid)));
      await assertFails(getDoc(reportPublicationRef(uid)));
      await assertFails(setDoc(portalUserRef(uid, `portal_${uid}`), { id: `portal_${uid}`, userId: uid, status: "active" }));
      await assertFails(setDoc(portalProjectRef(uid, `portal_project_${uid}`), { id: `portal_project_${uid}`, projectId, status: "published" }));
      await assertFails(setDoc(reportPublicationRef(uid, `snapshot_${uid}`), { id: `snapshot_${uid}`, projectId, status: "published" }));
    }
  });

  it("keeps unknown project communication paths denied by default", async () => {
    await assertFails(setDoc(doc(dbFor("owner_pm"), ...orgPath("projects", projectId, "communications", "comm_1", "unexpected", "x")), { id: "x" }));
  });
});
