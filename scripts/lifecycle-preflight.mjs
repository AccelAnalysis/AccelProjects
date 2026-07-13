import "dotenv/config";
import { readFile } from "node:fs/promises";
import { getFirestore } from "firebase-admin/firestore";
import { API_ORGANIZATION_ID, getAdminApp } from "../server/apiAuth.js";
import { lifecycleDiagnostics } from "../server/lifecycleAdminService.js";
import { scanStorageIntegrity } from "../server/storageIntegrityService.js";

const database = getFirestore(getAdminApp());
const issues = [];
const details = { dryRun: true, organizationId: API_ORGANIZATION_ID, generatedAt: new Date().toISOString() };

const indexes = JSON.parse(await readFile(new URL("../firestore.indexes.json", import.meta.url), "utf8"));
const membershipIndexConfigured = indexes.indexes?.some((index) => index.collectionGroup === "members"
  && index.fields?.some((field) => field.fieldPath === "userId")
  && index.fields?.some((field) => field.fieldPath === "accessState"));
details.membershipIndexConfigured = membershipIndexConfigured;
if (!membershipIndexConfigured) issues.push({ code: "membership_access_state_index_missing" });

try {
  await database.collectionGroup("members").where("userId", ">=", "").where("accessState", "==", "active").limit(1).get();
  details.membershipIndexQuerySucceeded = true;
} catch (error) {
  details.membershipIndexQuerySucceeded = false;
  issues.push({ code: "membership_access_state_index_not_deployed", message: String(error?.message ?? error).slice(0, 240) });
}

const members = await database.collectionGroup("members").limit(1000).get();
details.membershipsScanned = members.size;
for (const member of members.docs) {
  if (member.ref.path.split("/")[1] !== API_ORGANIZATION_ID) continue;
  if (member.id !== member.data().userId) issues.push({ code: "legacy_membership_id", path: member.ref.path });
  if (!["active", "removed"].includes(member.data().accessState)) issues.push({ code: "membership_access_state_missing", path: member.ref.path });
}

const projects = await database.collection(`organizations/${API_ORGANIZATION_ID}/projects`).limit(500).get();
const lifecycleCollections = ["phases", "tasks", "taskDependencies", "milestones", "risks", "documents", "metrics", "reports", "communications", "calendarEvents", "members"];
const validStates = new Set(["active", "archived", "trashed", "removed", "purged"]);
for (const project of projects.docs) {
  const lifecycle = project.data().lifecycle;
  if (!lifecycle || !validStates.has(lifecycle.state) || lifecycle.schemaVersion !== 1) issues.push({ code: "invalid_lifecycle_metadata", path: project.ref.path });
  for (const collection of lifecycleCollections) {
    const records = await project.ref.collection(collection).limit(500).get();
    for (const record of records.docs) {
      const value = record.data().lifecycle;
      if (value && (!validStates.has(value.state) || value.schemaVersion !== 1)) issues.push({ code: "invalid_lifecycle_metadata", path: record.ref.path });
      if (collection === "tasks" && record.data().phaseId) {
        const phase = await project.ref.collection("phases").doc(record.data().phaseId).get();
        if (!phase.exists) issues.push({ code: "orphaned_task_phase_reference", path: record.ref.path, phaseId: record.data().phaseId });
      }
    }
  }
}

const jobs = await database.collection(`organizations/${API_ORGANIZATION_ID}/lifecycleJobs`).where("state", "==", "failed").limit(500).get();
const purgeJobs = await database.collection(`organizations/${API_ORGANIZATION_ID}/lifecyclePurgeJobs`).where("state", "==", "failed").limit(500).get();
for (const job of [...jobs.docs, ...purgeJobs.docs]) issues.push({ code: "failed_lifecycle_job", path: job.ref.path, stage: job.data().stage ?? null });

details.bucketConfigured = Boolean(process.env.FIREBASE_STORAGE_BUCKET);
if (!details.bucketConfigured) {
  issues.push({ code: "firebase_storage_bucket_missing" });
} else {
  try {
    details.storage = await scanStorageIntegrity({ pageSize: 100, verifyChecksums: false }, { database });
    for (const finding of details.storage.findings.metadataMissingObjects) issues.push({ code: "storage_object_missing", ...finding });
  } catch (error) {
    issues.push({ code: "storage_preflight_failed", message: String(error?.message ?? error).slice(0, 240) });
  }
}

details.lifecycleDiagnostics = await lifecycleDiagnostics({ database }).catch((error) => ({ error: String(error?.message ?? error).slice(0, 240) }));
process.stdout.write(`${JSON.stringify({ ...details, ready: issues.length === 0, issues }, null, 2)}\n`);
