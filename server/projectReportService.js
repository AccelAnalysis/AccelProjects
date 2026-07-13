import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import { getFirestore } from "firebase-admin/firestore";
import { API_ORGANIZATION_ID, getAdminApp } from "./apiAuth.js";
import { getMicrosoftGraphAccessToken } from "./microsoftGraphAuthService.js";
import { getMicrosoftProjectConfig, GraphServiceError, sendProjectEmailViaGraph, validateRecipients } from "./microsoftGraphService.js";

const directAttachmentLimitBytes = 2_500_000;

function firestore() {
  return getFirestore(getAdminApp());
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function projectPath(projectId) {
  return `organizations/${API_ORGANIZATION_ID}/projects/${projectId}`;
}

function activityRef(database, projectId) {
  const id = createId("activity");
  return {
    id,
    ref: database.doc(`${projectPath(projectId)}/activityEvents/${id}`)
  };
}

function reportRef(database, projectId, reportId) {
  return database.doc(`${projectPath(projectId)}/reports/${reportId}`);
}

function normalizeText(value, maxLength = 8000) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeStringList(value, maxItems = 20, maxLength = 240) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeItemSelection(value, maxItems = 100) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      id: normalizeText(item?.id, 160),
      title: normalizeText(item?.title, 240),
      status: normalizeText(item?.status, 80),
      dueDate: normalizeText(item?.dueDate, 40),
      owner: normalizeText(item?.owner, 160)
    }))
    .filter((item) => item.id && item.title)
    .slice(0, maxItems);
}

export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableStringify(value)).digest("hex");
}

export function sanitizeFilenameSegment(value) {
  return normalizeText(value, 80)
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "report";
}

export function normalizeReportDraftInput(input = {}) {
  const title = normalizeText(input.title, 180);
  const reportingPeriodStart = normalizeText(input.reportingPeriodStart, 40);
  const reportingPeriodEnd = normalizeText(input.reportingPeriodEnd, 40);

  if (!title) {
    throw new GraphServiceError("Report title is required.", { status: 400, code: "missing_report_title", category: "validation" });
  }

  if (!reportingPeriodStart || !reportingPeriodEnd) {
    throw new GraphServiceError("Report period start and end are required.", { status: 400, code: "missing_report_period", category: "validation" });
  }

  if (Number.isNaN(Date.parse(reportingPeriodStart)) || Number.isNaN(Date.parse(reportingPeriodEnd)) || reportingPeriodEnd < reportingPeriodStart) {
    throw new GraphServiceError("Report period end must be on or after the start.", { status: 400, code: "invalid_report_period", category: "validation" });
  }

  return {
    title,
    reportingPeriodStart,
    reportingPeriodEnd,
    executiveSummary: normalizeText(input.executiveSummary, 6000),
    progressSummary: normalizeText(input.progressSummary, 6000),
    nextSteps: normalizeText(input.nextSteps, 6000),
    clientActions: normalizeStringList(input.clientActions),
    highlights: normalizeStringList(input.highlights),
    risks: normalizeItemSelection(input.risks, 25),
    milestones: normalizeItemSelection(input.milestones, 25),
    completedTasks: normalizeItemSelection(input.completedTasks, 50),
    upcomingTasks: normalizeItemSelection(input.upcomingTasks, 50),
    includeBudget: Boolean(input.includeBudget),
    includeInternalNotes: false
  };
}

export function buildSnapshotContent({ report, project, client, actor, approvedAt }) {
  return {
    reportId: report.id,
    title: report.title,
    reportingPeriodStart: report.reportingPeriodStart,
    reportingPeriodEnd: report.reportingPeriodEnd,
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      health: project.health,
      startDate: project.startDate,
      targetDate: project.targetDate,
      revision: project.revision ?? 1
    },
    client: {
      id: client?.id || null,
      name: client?.name || "Client",
      contactName: client?.contactName || "",
      email: client?.email || ""
    },
    sections: {
      executiveSummary: report.executiveSummary,
      progressSummary: report.progressSummary,
      nextSteps: report.nextSteps,
      clientActions: report.clientActions || [],
      highlights: report.highlights || [],
      risks: report.risks || [],
      milestones: report.milestones || [],
      completedTasks: report.completedTasks || [],
      upcomingTasks: report.upcomingTasks || []
    },
    approvedBy: actor.uid,
    approvedAt
  };
}

function writePdfSection(doc, title, body) {
  doc.moveDown(0.7).fontSize(13).fillColor("#111827").text(title, { continued: false });
  doc.moveDown(0.25).fontSize(10).fillColor("#374151");
  if (Array.isArray(body)) {
    if (body.length === 0) {
      doc.text("No items included.");
      return;
    }
    body.forEach((item) => {
      if (typeof item === "string") {
        doc.text(`- ${item}`);
      } else {
        const detail = [item.status, item.dueDate, item.owner].filter(Boolean).join(" · ");
        doc.text(`- ${item.title}${detail ? ` (${detail})` : ""}`);
      }
    });
    return;
  }
  doc.text(body || "No update provided.");
}

export async function renderReportPdfBuffer(snapshot) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "LETTER", info: { Title: snapshot.title, Author: "AccelProjects" } });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).fillColor("#0f172a").text(snapshot.title);
    doc.moveDown(0.25).fontSize(10).fillColor("#64748b").text(`${snapshot.project.name} · ${snapshot.client.name}`);
    doc.text(`${snapshot.reportingPeriodStart} to ${snapshot.reportingPeriodEnd}`);
    doc.text(`Approved ${snapshot.approvedAt}`);
    doc.moveDown(0.5).strokeColor("#cbd5e1").moveTo(48, doc.y).lineTo(564, doc.y).stroke();

    writePdfSection(doc, "Executive Summary", snapshot.sections.executiveSummary);
    writePdfSection(doc, "Progress Summary", snapshot.sections.progressSummary);
    writePdfSection(doc, "Highlights", snapshot.sections.highlights);
    writePdfSection(doc, "Completed Work", snapshot.sections.completedTasks);
    writePdfSection(doc, "Upcoming Work", snapshot.sections.upcomingTasks);
    writePdfSection(doc, "Milestones", snapshot.sections.milestones);
    writePdfSection(doc, "Risks and Watch Items", snapshot.sections.risks);
    writePdfSection(doc, "Client Actions", snapshot.sections.clientActions);
    writePdfSection(doc, "Next Steps", snapshot.sections.nextSteps);

    doc.end();
  });
}

async function loadProjectAndClient(database, projectId) {
  const projectSnapshot = await database.doc(projectPath(projectId)).get();

  if (!projectSnapshot.exists) {
    throw new GraphServiceError("Project not found.", { status: 404, code: "project_not_found", category: "not_found" });
  }

  const project = { id: projectSnapshot.id, ...projectSnapshot.data() };
  const clientSnapshot = project.clientId
    ? await database.doc(`organizations/${API_ORGANIZATION_ID}/clients/${project.clientId}`).get()
    : null;

  return {
    project,
    client: clientSnapshot?.exists ? { id: clientSnapshot.id, ...clientSnapshot.data() } : null
  };
}

export async function listProjectReports(projectId, { database = firestore() } = {}) {
  const snapshot = await database.collection(`${projectPath(projectId)}/reports`).orderBy("updatedAt", "desc").get();
  return { reports: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
}

export async function createReportDraft(projectId, actor, input, { database = firestore() } = {}) {
  const value = normalizeReportDraftInput(input);
  const timestamp = nowIso();
  const id = createId("report");
  const report = {
    id,
    organizationId: API_ORGANIZATION_ID,
    projectId,
    ...value,
    status: "draft",
    latestApprovedSnapshotId: null,
    createdBy: actor.uid,
    createdAt: timestamp,
    updatedBy: actor.uid,
    updatedAt: timestamp,
    submittedAt: null,
    submittedBy: null,
    approvedAt: null,
    approvedBy: null
  };

  await reportRef(database, projectId, id).set(report);
  return report;
}

export async function updateReportDraft(projectId, reportId, actor, input, { database = firestore() } = {}) {
  const ref = reportRef(database, projectId, reportId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new GraphServiceError("Report not found.", { status: 404, code: "report_not_found", category: "not_found" });
  }

  const existing = { id: snapshot.id, ...snapshot.data() };
  if (existing.status === "approved") {
    throw new GraphServiceError("Approved reports are immutable. Create a new report draft for changes.", { status: 409, code: "report_approved_immutable", category: "conflict" });
  }

  const value = normalizeReportDraftInput({ ...existing, ...input });
  const patch = {
    ...value,
    status: "draft",
    submittedAt: null,
    submittedBy: null,
    updatedBy: actor.uid,
    updatedAt: nowIso()
  };

  await ref.update(patch);
  return { ...existing, ...patch };
}

export async function submitReportForReview(projectId, reportId, actor, { database = firestore() } = {}) {
  const ref = reportRef(database, projectId, reportId);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new GraphServiceError("Report not found.", { status: 404, code: "report_not_found", category: "not_found" });
  }

  const report = { id: snapshot.id, ...snapshot.data() };
  if (report.status === "approved") {
    throw new GraphServiceError("Approved reports cannot be resubmitted.", { status: 409, code: "report_approved_immutable", category: "conflict" });
  }

  const timestamp = nowIso();
  const patch = {
    status: "ready_for_review",
    submittedAt: timestamp,
    submittedBy: actor.uid,
    updatedBy: actor.uid,
    updatedAt: timestamp
  };
  await ref.update(patch);
  return { ...report, ...patch };
}

export async function withdrawReportFromReview(projectId, reportId, actor, { database = firestore() } = {}) {
  const ref = reportRef(database, projectId, reportId); const snapshot = await ref.get();
  if (!snapshot.exists) throw new GraphServiceError("Report not found.", { status: 404, code: "report_not_found", category: "not_found" });
  const report = { id: snapshot.id, ...snapshot.data() };
  if (report.status !== "ready_for_review") throw new GraphServiceError("Only submitted reports can be withdrawn.", { status: 409, code: "report_not_submitted", category: "conflict" });
  const timestamp = nowIso(); const patch = { status: "draft", submittedAt: null, submittedBy: null, updatedAt: timestamp, updatedBy: actor.uid };
  await database.runTransaction(async (transaction) => { transaction.update(ref, patch); const activity = activityRef(database, projectId); transaction.set(activity.ref, { id: activity.id, projectId, actorId: actor.uid, type: "client_report_withdrawn", message: "Client report withdrawn from review.", metadata: { reportId }, createdAt: timestamp }); });
  return { ...report, ...patch };
}

export async function voidApprovedReport(projectId, reportId, actor, reason, { database = firestore() } = {}) {
  if (typeof reason !== "string" || !reason.trim()) throw new GraphServiceError("Void reason is required.", { status: 400, code: "void_reason_required", category: "validation" });
  const ref = reportRef(database, projectId, reportId); let result;
  await database.runTransaction(async (transaction) => { const snapshot = await transaction.get(ref); if (!snapshot.exists) throw new GraphServiceError("Report not found.", { status: 404, code: "report_not_found", category: "not_found" }); const report = { id: snapshot.id, ...snapshot.data() }; if (report.status === "voided") { result = report; return; } if (report.status !== "approved") throw new GraphServiceError("Only approved reports can be voided.", { status: 409, code: "report_not_approved", category: "conflict" }); const publicationRef = database.doc(`${projectPath(projectId)}/reportPublications/${report.latestApprovedSnapshotId}`); const publication = await transaction.get(publicationRef); const timestamp = nowIso(); const patch = { status: "voided", voidedAt: timestamp, voidedBy: actor.uid, voidReason: reason.trim().slice(0, 500), updatedAt: timestamp, updatedBy: actor.uid }; transaction.update(ref, patch); if (publication.exists) transaction.update(publicationRef, { sourceReportStatus: "voided", sourceReportVoidedAt: timestamp, updatedAt: timestamp }); const activity = activityRef(database, projectId); transaction.set(activity.ref, { id: activity.id, projectId, actorId: actor.uid, type: "client_report_voided", message: "Approved client report voided; immutable snapshot and artifacts retained.", metadata: { reportId, snapshotId: report.latestApprovedSnapshotId }, createdAt: timestamp }); result = { ...report, ...patch }; });
  return result;
}

export async function createSupersedingReportDraft(projectId, reportId, actor, { database = firestore() } = {}) {
  const sourceRef = reportRef(database, projectId, reportId); const sourceSnapshot = await sourceRef.get();
  if (!sourceSnapshot.exists) throw new GraphServiceError("Report not found.", { status: 404, code: "report_not_found", category: "not_found" });
  const source = { id: sourceSnapshot.id, ...sourceSnapshot.data() };
  if (!source.latestApprovedSnapshotId || !["approved", "voided", "superseded"].includes(source.status)) throw new GraphServiceError("A superseding draft requires an approved source report.", { status: 409, code: "report_not_approved", category: "conflict" });
  const draft = await createReportDraft(projectId, actor, { ...source, title: `${source.title} — Replacement` }, { database });
  const patch = { supersedesReportId: source.id, supersedesSnapshotId: source.latestApprovedSnapshotId };
  await reportRef(database, projectId, draft.id).update(patch);
  return { ...draft, ...patch };
}

export async function approveReport(projectId, reportId, actor, { database = firestore() } = {}) {
  const ref = reportRef(database, projectId, reportId);
  const { project, client } = await loadProjectAndClient(database, projectId);
  let approvedReport;
  let approvedSnapshot;

  await database.runTransaction(async (transaction) => {
    const reportSnapshot = await transaction.get(ref);

    if (!reportSnapshot.exists) {
      throw new GraphServiceError("Report not found.", { status: 404, code: "report_not_found", category: "not_found" });
    }

    const report = { id: reportSnapshot.id, ...reportSnapshot.data() };
    if (report.latestApprovedSnapshotId && report.status === "approved") {
      const existingSnapshot = await transaction.get(ref.collection("snapshots").doc(report.latestApprovedSnapshotId));
      approvedReport = report;
      approvedSnapshot = { id: existingSnapshot.id, ...existingSnapshot.data() };
      return;
    }

    if (report.status !== "ready_for_review") {
      throw new GraphServiceError("Report must be submitted for review before approval.", { status: 409, code: "report_not_ready", category: "conflict" });
    }

    const approvedAt = nowIso();
    const snapshotId = createId("snapshot");
    const content = buildSnapshotContent({ report, project, client, actor, approvedAt });
    approvedSnapshot = {
      id: snapshotId,
      organizationId: API_ORGANIZATION_ID,
      projectId,
      reportId,
      clientId: project.clientId,
      visibility: "client_visible",
      templateVersion: "client-progress-report.v1",
      renderSchemaVersion: "2026-07",
      title: content.title,
      reportingPeriodStart: content.reportingPeriodStart,
      reportingPeriodEnd: content.reportingPeriodEnd,
      project: content.project,
      client: content.client,
      sections: content.sections,
      contentHash: sha256Hex(content),
      projectRevisionAtApproval: project.revision ?? 1,
      sourceReportUpdatedAt: report.updatedAt,
      approvedBy: actor.uid,
      approvedAt,
      createdAt: approvedAt
    };
    const patch = {
      status: "approved",
      latestApprovedSnapshotId: snapshotId,
      approvedAt,
      approvedBy: actor.uid,
      updatedBy: actor.uid,
      updatedAt: approvedAt
    };
    approvedReport = { ...report, ...patch };

    if (report.supersedesReportId) {
      const supersededRef = reportRef(database, projectId, report.supersedesReportId);
      const supersededSnapshot = await transaction.get(supersededRef);
      if (!supersededSnapshot.exists) throw new GraphServiceError("Superseded report was not found.", { status: 409, code: "superseded_report_missing", category: "conflict" });
      const publicationRef = database.doc(`${projectPath(projectId)}/reportPublications/${report.supersedesSnapshotId}`);
      const publication = await transaction.get(publicationRef);
      transaction.update(supersededRef, { status: "superseded", supersededByReportId: reportId, supersededBySnapshotId: snapshotId, updatedAt: approvedAt, updatedBy: actor.uid });
      if (publication.exists) transaction.update(publicationRef, { sourceReportStatus: "superseded", supersededByReportId: reportId, supersededBySnapshotId: snapshotId, updatedAt: approvedAt });
    }
    transaction.set(ref.collection("snapshots").doc(snapshotId), approvedSnapshot);
    transaction.update(ref, patch);
    const activity = activityRef(database, projectId);
    transaction.set(activity.ref, {
      id: activity.id,
      projectId,
      actorId: actor.uid,
      type: "client_report_approved",
      message: "Client progress report approved and immutable snapshot created.",
      metadata: { reportId, snapshotId, contentHash: approvedSnapshot.contentHash },
      createdAt: approvedAt
    });
  });

  return { report: approvedReport, snapshot: approvedSnapshot };
}

async function loadApprovedSnapshot(projectId, reportId, snapshotId, database) {
  const snapshotDoc = await reportRef(database, projectId, reportId).collection("snapshots").doc(snapshotId).get();

  if (!snapshotDoc.exists) {
    throw new GraphServiceError("Report snapshot not found.", { status: 404, code: "report_snapshot_not_found", category: "not_found" });
  }

  const snapshot = { id: snapshotDoc.id, ...snapshotDoc.data() };
  if (!snapshot.approvedAt || !snapshot.contentHash) {
    throw new GraphServiceError("Only approved report snapshots can be exported or emailed.", { status: 409, code: "report_snapshot_not_approved", category: "conflict" });
  }

  return snapshot;
}

export async function generateReportPdfArtifact(projectId, reportId, snapshotId, actor, purpose = "download", { database = firestore() } = {}) {
  const snapshot = await loadApprovedSnapshot(projectId, reportId, snapshotId, database);
  const buffer = await renderReportPdfBuffer(snapshot);
  const timestamp = nowIso();
  const artifactId = createId("artifact");
  const filename = `${sanitizeFilenameSegment(snapshot.project.name)}-${sanitizeFilenameSegment(snapshot.title)}.pdf`;
  const artifact = {
    id: artifactId,
    organizationId: API_ORGANIZATION_ID,
    projectId,
    reportId,
    snapshotId,
    purpose,
    filename,
    contentType: "application/pdf",
    sizeBytes: buffer.byteLength,
    sha256: sha256Hex(buffer),
    createdBy: actor.uid,
    createdAt: timestamp
  };

  await reportRef(database, projectId, reportId).collection("artifacts").doc(artifactId).set(artifact);
  return { snapshot, artifact, buffer };
}

function requestHash(value) {
  return sha256Hex(value);
}

function safeError(error) {
  if (error instanceof GraphServiceError) {
    return {
      status: error.status || null,
      category: error.category,
      code: error.code,
      message: error.message.slice(0, 240)
    };
  }

  return {
    status: null,
    category: "server_error",
    code: "server_error",
    message: error instanceof Error ? error.message.slice(0, 240) : "Report email request failed"
  };
}

export async function emailReportSnapshot(projectId, reportId, snapshotId, actor, input, {
  database = firestore(),
  env = process.env,
  getAccessToken = getMicrosoftGraphAccessToken,
  fetchImpl = fetch
} = {}) {
  const config = getMicrosoftProjectConfig(env);
  const { snapshot, artifact, buffer } = await generateReportPdfArtifact(projectId, reportId, snapshotId, actor, "email_attachment", { database });

  if (buffer.byteLength > directAttachmentLimitBytes) {
    throw new GraphServiceError("Report PDF is too large for direct Microsoft Graph attachment delivery.", {
      status: 413,
      code: "pdf_attachment_too_large",
      category: "validation"
    });
  }

  const timestamp = nowIso();
  const communicationId = createId("comm");
  const communicationRef = database.doc(`${projectPath(projectId)}/communications/${communicationId}`);
  const communication = {
    id: communicationId,
    organizationId: API_ORGANIZATION_ID,
    projectId,
    channel: "email",
    direction: "outbound",
    audience: "client",
    visibility: "client_visible",
    status: "sending",
    subject: normalizeText(input.subject, 180) || `${snapshot.project.name} progress report`,
    bodyText: normalizeText(input.bodyText, 8000) || "Attached is the approved project progress report.",
    toRecipients: validateRecipients(input.toRecipients || [], "To recipients"),
    ccRecipients: validateRecipients(input.ccRecipients || [], "CC recipients"),
    bccRecipients: validateRecipients(input.bccRecipients || [], "BCC recipients"),
    senderMailbox: config.senderMailbox,
    provider: "microsoft_graph",
    sourceType: "report_snapshot",
    sourceId: snapshotId,
    attachmentRefs: [{
      artifactId: artifact.id,
      snapshotId,
      filename: artifact.filename,
      contentType: artifact.contentType,
      sizeBytes: artifact.sizeBytes,
      sha256: artifact.sha256
    }],
    idempotencyKey: input.idempotencyKey || createId("idem"),
    createdBy: actor.uid,
    createdAt: timestamp,
    updatedBy: actor.uid,
    updatedAt: timestamp,
    sendRequestedAt: timestamp,
    acceptedAt: null,
    failedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    attemptCount: 1
  };

  if (communication.toRecipients.length === 0) {
    throw new GraphServiceError("At least one To recipient is required.", { status: 400, code: "missing_to_recipient", category: "validation" });
  }

  const attempt = {
    id: createId("attempt"),
    organizationId: API_ORGANIZATION_ID,
    projectId,
    communicationId,
    attemptNumber: 1,
    actorId: actor.uid,
    startedAt: timestamp,
    finishedAt: null,
    status: "sending",
    provider: "microsoft_graph",
    providerHttpStatus: null,
    errorCategory: null,
    errorCode: null,
    errorMessage: null,
    requestHash: requestHash({ communicationId, snapshotId, attachmentHash: artifact.sha256, to: communication.toRecipients }),
    createdAt: timestamp
  };

  await database.runTransaction(async (transaction) => {
    transaction.set(communicationRef, communication);
    transaction.set(communicationRef.collection("deliveryAttempts").doc(attempt.id), attempt);
  });

  try {
    const result = await sendProjectEmailViaGraph({
      communication,
      env,
      getAccessToken,
      fetchImpl,
      allowAttachments: true,
      maxDirectAttachmentBytes: directAttachmentLimitBytes,
      attachments: [{
        name: artifact.filename,
        contentType: artifact.contentType,
        contentBytes: buffer
      }]
    });
    const acceptedAt = nowIso();
    const update = {
      status: result.status,
      senderMailbox: result.senderMailbox,
      acceptedAt: result.status === "accepted" ? acceptedAt : null,
      updatedBy: actor.uid,
      updatedAt: acceptedAt,
      lastErrorCode: null,
      lastErrorMessage: null
    };

    await database.runTransaction(async (transaction) => {
      transaction.update(communicationRef, update);
      transaction.update(communicationRef.collection("deliveryAttempts").doc(attempt.id), {
        finishedAt: acceptedAt,
        status: result.status,
        providerHttpStatus: result.providerHttpStatus
      });
      const activity = activityRef(database, projectId);
      transaction.set(activity.ref, {
        id: activity.id,
        projectId,
        actorId: actor.uid,
        type: "client_report_email_accepted",
        message: "Approved client report PDF accepted by Microsoft 365 for delivery.",
        metadata: { reportId, snapshotId, communicationId, artifactId: artifact.id, status: result.status },
        createdAt: acceptedAt
      });
    });

    return { communication: { ...communication, ...update }, attempt: { ...attempt, status: result.status, finishedAt: acceptedAt, providerHttpStatus: result.providerHttpStatus }, artifact };
  } catch (error) {
    const safe = safeError(error);
    const finishedAt = nowIso();
    const status = safe.category === "unknown" ? "unknown" : "failed";
    await database.runTransaction(async (transaction) => {
      transaction.update(communicationRef, {
        status,
        failedAt: status === "failed" ? finishedAt : null,
        updatedBy: actor.uid,
        updatedAt: finishedAt,
        lastErrorCode: safe.code,
        lastErrorMessage: safe.message
      });
      transaction.update(communicationRef.collection("deliveryAttempts").doc(attempt.id), {
        finishedAt,
        status,
        providerHttpStatus: safe.status,
        errorCategory: safe.category,
        errorCode: safe.code,
        errorMessage: safe.message
      });
    });
    throw error;
  }
}
