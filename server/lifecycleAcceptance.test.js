import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth as getClientAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { app } from "./index.js";
import { API_ORGANIZATION_ID, getAdminApp } from "./apiAuth.js";
import { acceptancePassword, acceptanceProjectId, acceptanceUsers, seedLifecycleAcceptanceFixtures } from "./lifecycleAcceptanceFixtures.js";
import { cancelLargeLifecycleJob, createLargeLifecycleJob, runLargeLifecycleJob } from "./largeLifecycleService.js";

let clientApp; let adminToken; let ownerToken; let database;
const emulatorEnabled = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST);

beforeAll(async () => {
  if (!emulatorEnabled) return;
  process.env.FIREBASE_STORAGE_BUCKET ||= "accelprojects-acceptance.appspot.com";
  database = getFirestore(getAdminApp());
  const adminAuth = getAuth(getAdminApp());
  for (const [uid] of acceptanceUsers) { await adminAuth.deleteUser(uid).catch(() => undefined); await adminAuth.createUser({ uid, email: `${uid}@example.test`, password: acceptancePassword, emailVerified: true }); }
  clientApp = initializeApp({ apiKey: "demo-key", projectId: "accelprojects", authDomain: "localhost" }, `acceptance-${Date.now()}`);
  const auth = getClientAuth(clientApp); connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  ownerToken = await (await signInWithEmailAndPassword(auth, "accept_owner@example.test", acceptancePassword)).user.getIdToken();
  await auth.signOut();
  adminToken = await (await signInWithEmailAndPassword(auth, "accept_admin@example.test", acceptancePassword)).user.getIdToken();
});

beforeEach(async () => { if (emulatorEnabled) await seedLifecycleAcceptanceFixtures({ database }); });

afterAll(async () => { if (clientApp) await deleteApp(clientApp); });

(emulatorEnabled ? describe : describe.skip)("record lifecycle emulator acceptance", () => {
  it("runs one authenticated preview and atomic operation for interconnected selected tasks", async () => {
    const input = { action: "trash", expectedProjectRevision: 1, idempotencyKey: "acceptance-bulk-1", reason: { code: "acceptance", note: "Bulk acceptance" }, taskIds: ["task_2", "task_1"] };
    const preview = await request(app).post(`/api/projects/${acceptanceProjectId}/lifecycle/tasks/bulk/impact`).set("Authorization", `Bearer ${ownerToken}`).send(input);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.taskIds).toEqual(["task_1", "task_2"]);
    expect(preview.body.impact.transition).toEqual([{ entityType: "task", count: 2, ids: ["task_1", "task_2"] }]);
    expect(preview.body.impact.removeRelationships[0].ids).toContain("dep_1_2");
    expect(preview.body.impact.retainImmutable.some((item) => item.entityType === "taskComment")).toBe(true);
    const applied = await request(app).post(`/api/projects/${acceptanceProjectId}/lifecycle/tasks/bulk/actions`).set("Authorization", `Bearer ${ownerToken}`).send({ ...input, previewToken: preview.body.previewToken });
    expect(applied.status).toBe(200);
    expect(applied.body).toMatchObject({ duplicate: false, queued: false });
    const project = database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${acceptanceProjectId}`);
    expect((await project.get()).data().revision).toBe(2);
    expect((await project.collection("tasks").doc("task_1").get()).data().lifecycle.state).toBe("trashed");
    expect((await project.collection("taskDependencies").doc("dep_1_2").get()).data().lifecycle.state).toBe("removed");
    const repeated = await request(app).post(`/api/projects/${acceptanceProjectId}/lifecycle/tasks/bulk/actions`).set("Authorization", `Bearer ${ownerToken}`).send({ ...input, previewToken: preview.body.previewToken });
    expect(repeated.body.duplicate).toBe(true);
  });

  it("denies an unauthorized contributor and exposes bounded admin-only Storage diagnostics", async () => {
    const auth = getClientAuth(clientApp); await auth.signOut(); const contributorToken = await (await signInWithEmailAndPassword(auth, "accept_contributor@example.test", acceptancePassword)).user.getIdToken();
    const denied = await request(app).post(`/api/projects/${acceptanceProjectId}/lifecycle/tasks/bulk/impact`).set("Authorization", `Bearer ${contributorToken}`).send({ action: "trash", expectedProjectRevision: 1, idempotencyKey: "denied", reason: { code: "acceptance" }, taskIds: ["task_3"] });
    expect(denied.status).toBe(403);
    const diagnostics = await request(app).get("/api/admin/lifecycle/storage-integrity?pageSize=10").set("Authorization", `Bearer ${adminToken}`);
    expect(diagnostics.status).toBe(200);
    expect(diagnostics.body).toMatchObject({ dryRun: true, destructiveRepairPerformed: false, pageSize: 10 });
  });

  it("rejects stale previews and restore plans with missing phases or invalid dependencies", async () => {
    const base = { action: "trash", expectedProjectRevision: 1, idempotencyKey: "stale", reason: { code: "acceptance" }, taskIds: ["task_3"] };
    const preview = await request(app).post(`/api/projects/${acceptanceProjectId}/lifecycle/tasks/bulk/impact`).set("Authorization", `Bearer ${ownerToken}`).send(base);
    await database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${acceptanceProjectId}`).update({ revision: 2 });
    const stale = await request(app).post(`/api/projects/${acceptanceProjectId}/lifecycle/tasks/bulk/actions`).set("Authorization", `Bearer ${ownerToken}`).send({ ...base, previewToken: preview.body.previewToken });
    expect(stale.status, JSON.stringify(stale.body)).toBe(409);
    await seedLifecycleAcceptanceFixtures({ database });
    const project = database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${acceptanceProjectId}`);
    const trashed = { schemaVersion: 1, state: "trashed", retentionClass: "operational_30d", lastOperationId: "bulk_source", bulkGroupId: "bulk_source" };
    await Promise.all([project.collection("tasks").doc("task_1").update({ lifecycle: trashed, phaseId: "missing_phase" }), project.collection("tasks").doc("task_2").update({ lifecycle: trashed }), project.collection("taskDependencies").doc("dep_1_2").update({ lifecycle: { ...trashed, state: "removed" } }), project.collection("taskDependencies").doc("dep_duplicate").set({ id: "dep_duplicate", projectId: acceptanceProjectId, taskId: "task_2", dependsOnTaskId: "task_1", lifecycle: { schemaVersion: 1, state: "active", retentionClass: "relationship_30d", lastOperationId: "fixture" } })]);
    const restore = await request(app).post(`/api/projects/${acceptanceProjectId}/lifecycle/tasks/bulk/impact`).set("Authorization", `Bearer ${ownerToken}`).send({ action: "restore", expectedProjectRevision: 1, idempotencyKey: "restore-invalid", reason: { code: "acceptance" }, taskIds: ["task_1", "task_2"], sourceOperationId: "bulk_source" });
    expect(restore.status).toBe(200);
    expect(restore.body.impact.blockers.some((item) => item.startsWith("missing_active_phase"))).toBe(true);
    expect(restore.body.impact.blockers.some((item) => item.startsWith("duplicate_dependency"))).toBe(true);
  });

  it("executes a bounded large phase cascade and supports safe pre-write cancellation", async () => {
    const input = { projectId: acceptanceProjectId, entityType: "phase", entityId: "phase_1", action: "trash", strategy: "cascade_trash", expectedProjectRevision: 1, idempotencyKey: "large-phase", actor: { id: "accept_owner", role: "project_manager" } };
    const preview = { impact: { transition: [{ entityType: "task", count: 2, ids: ["task_1", "task_2"] }], reassign: [], removeRelationships: [] } };
    const queued = await createLargeLifecycleJob(input, preview, { database });
    expect(queued.job).toMatchObject({ state: "planned", reversible: true, progress: { completed: 0, total: 3 } });
    expect((await runLargeLifecycleJob(queued.job.id, { database, batchSize: 1 })).state).toBe("running");
    expect((await runLargeLifecycleJob(queued.job.id, { database, batchSize: 1 })).state).toBe("running");
    const completed = await runLargeLifecycleJob(queued.job.id, { database, batchSize: 1 });
    expect(completed).toMatchObject({ state: "completed", stage: "integrity_verified" });
    expect((await database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${acceptanceProjectId}`).get()).data().revision).toBe(2);

    await seedLifecycleAcceptanceFixtures({ database });
    const cancellable = await createLargeLifecycleJob({ ...input, idempotencyKey: "large-phase-cancel" }, preview, { database });
    expect((await cancelLargeLifecycleJob(cancellable.job.id, { database })).state).toBe("canceled");
  });

  it("queues and completes a large lifecycle-only Update via File job", async () => {
    const project = database.doc(`organizations/${API_ORGANIZATION_ID}/projects/${acceptanceProjectId}`);
    const lifecycle = { schemaVersion: 1, state: "active", retentionClass: "ordinary_project", legalHold: false, lastOperationId: "fixture_seed" };
    const batch = database.batch();
    const operations = Array.from({ length: 446 }, (_, index) => {
      const entityId = `file_milestone_${String(index).padStart(3, "0")}`;
      batch.set(project.collection("milestones").doc(entityId), { id: entityId, projectId: acceptanceProjectId, name: entityId, date: "2026-03-01", status: "planned", lifecycle });
      return { entityType: "milestones", entityId, action: "archive", reason: "Acceptance file archive", expectedPriorState: "active" };
    });
    batch.set(project.collection("exportSnapshots").doc("export_file_large"), { id: "export_file_large", projectId: acceptanceProjectId, baseRevision: 1, packageId: "package_file_large", sourceHash: "source_hash_file_large" });
    await batch.commit();

    const queued = await request(app).post(`/api/projects/${acceptanceProjectId}/updates/lifecycle-jobs`).set("Authorization", `Bearer ${ownerToken}`).send({ expectedProjectRevision: 1, sourceSnapshotId: "export_file_large", sourcePackageId: "package_file_large", sourceSnapshotHash: "source_hash_file_large", uploadedFileHash: "uploaded_hash_file_large", resultStateHash: "result_hash_file_large", operations });
    expect(queued.status, JSON.stringify(queued.body)).toBe(202);
    expect(queued.body).toMatchObject({ queued: true, duplicate: false, job: { state: "planned", progress: { completed: 0, total: 446 } } });
    const jobId = queued.body.job.id;
    expect((await runLargeLifecycleJob(jobId, { database, batchSize: 200 })).state).toBe("running");
    expect((await runLargeLifecycleJob(jobId, { database, batchSize: 200 })).state).toBe("running");
    expect(await runLargeLifecycleJob(jobId, { database, batchSize: 200 })).toMatchObject({ state: "completed", stage: "integrity_verified" });
    expect((await project.get()).data().revision).toBe(2);
    expect((await project.collection("milestones").doc("file_milestone_000").get()).data().lifecycle.state).toBe("archived");
    expect((await project.collection("updateManifests").doc("uploaded_hash_file_large").get()).data()).toMatchObject({ baseRevision: 1, resultRevision: 2, lifecycleJobId: jobId });
  });
});
