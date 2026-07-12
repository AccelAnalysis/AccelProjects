import { getFirestore } from "firebase-admin/firestore";
import crypto from "node:crypto";
import { API_ORGANIZATION_ID, getAdminApp } from "./apiAuth.js";
import { loadProjectAccess } from "./projectAuthorization.js";
import { renderReportPdfBuffer, sanitizeFilenameSegment } from "./projectReportService.js";

const portalLoginWriteIntervalMs = 15 * 60 * 1000;

export class PortalServiceError extends Error {
  constructor(message, { status = 400, code = "portal_error" } = {}) {
    super(message);
    this.name = "PortalServiceError";
    this.status = status;
    this.code = code;
  }
}

function firestore() {
  return getFirestore(getAdminApp());
}

function nowIso() {
  return new Date().toISOString();
}

function orgPath(...parts) {
  return `organizations/${API_ORGANIZATION_ID}${parts.length ? `/${parts.join("/")}` : ""}`;
}

function normalizeText(value, maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function isExpired(access, now = nowIso()) {
  return Boolean(access.expiresAt && access.expiresAt <= now);
}

function safeNotFound() {
  throw new PortalServiceError("Portal resource not found.", { status: 404, code: "portal_not_found" });
}

function safeDenied(message = "Client portal access is not available for this account.") {
  throw new PortalServiceError(message, { status: 403, code: "portal_denied" });
}

async function getDocData(ref) {
  const snapshot = await ref.get();
  return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
}

function activityRef(database, projectId) {
  const id = `activity_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
  return {
    id,
    ref: database.doc(orgPath("projects", projectId, "activityEvents", id))
  };
}

async function auditProjectEvent(database, projectId, actorId, type, message, metadata = {}) {
  const timestamp = nowIso();
  const activity = activityRef(database, projectId);
  await activity.ref.set({
    id: activity.id,
    projectId,
    actorId,
    type,
    message,
    metadata,
    createdAt: timestamp
  });
}

async function loadClient(database, clientId) {
  if (!clientId) return null;
  return getDocData(database.doc(orgPath("clients", clientId)));
}

export async function loadPortalAccess(actor, projectId, { database = firestore(), now = nowIso() } = {}) {
  if (!actor?.uid || actor?.profile?.role !== "client") {
    safeDenied();
  }

  const portalUser = await getDocData(database.doc(orgPath("portalUsers", actor.uid)));
  if (!portalUser || portalUser.userId !== actor.uid || portalUser.organizationId !== API_ORGANIZATION_ID) {
    safeDenied("Client portal access is not configured for this account.");
  }

  if (portalUser.status !== "active") {
    safeDenied(`Client portal access is ${portalUser.status}.`);
  }

  const client = await loadClient(database, portalUser.clientId);
  if (!client) {
    safeDenied("Client portal access is not configured for this account.");
  }

  const result = { portalUser, client, projectAccess: null, project: null };

  if (!projectId) {
    return result;
  }

  const access = await getDocData(database.doc(orgPath("portalUsers", actor.uid, "projectAccess", projectId)));
  if (
    !access
    || access.id !== projectId
    || access.userId !== actor.uid
    || access.projectId !== projectId
    || access.clientId !== portalUser.clientId
    || access.status !== "active"
    || access.accessLevel !== "read_only"
    || isExpired(access, now)
  ) {
    safeNotFound();
  }

  const project = await getDocData(database.doc(orgPath("projects", projectId)));
  if (!project || project.clientId !== portalUser.clientId) {
    safeNotFound();
  }

  return { ...result, projectAccess: access, project };
}

export function requirePortalUser({ loadAccess = loadPortalAccess } = {}) {
  return async function requirePortalUserMiddleware(request, response, next) {
    try {
      request.portalAccess = await loadAccess(request.auth);
      return next();
    } catch (error) {
      return response.status(error.status || 403).json({ success: false, error: error.message || "Client portal access denied", code: error.code || "portal_denied" });
    }
  };
}

export function requirePortalProjectAccess({ loadAccess = loadPortalAccess } = {}) {
  return async function requirePortalProjectAccessMiddleware(request, response, next) {
    try {
      request.portalAccess = await loadAccess(request.auth, request.params.projectId);
      return next();
    } catch (error) {
      return response.status(error.status || 404).json({ success: false, error: error.message || "Portal resource not found", code: error.code || "portal_not_found" });
    }
  };
}

export async function getPortalMe(actor, { database = firestore() } = {}) {
  const access = await loadPortalAccess(actor, undefined, { database });
  const projectAccessSnapshot = await database.collection(orgPath("portalUsers", actor.uid, "projectAccess")).where("status", "==", "active").get();
  const timestamp = nowIso();
  const lastLogin = access.portalUser.lastPortalLoginAt;

  if (!lastLogin || Date.parse(timestamp) - Date.parse(lastLogin) > portalLoginWriteIntervalMs) {
    await database.doc(orgPath("portalUsers", actor.uid)).update({ lastPortalLoginAt: timestamp, updatedAt: timestamp, updatedBy: actor.uid });
  }

  return {
    displayName: access.portalUser.displayName || actor.profile.name || actor.email,
    clientName: access.client.name,
    portalStatus: access.portalUser.status,
    accessibleProjectCount: projectAccessSnapshot.docs.length
  };
}

function projectSummaryDto(portalProject) {
  return {
    projectId: portalProject.projectId,
    projectName: portalProject.projectName,
    clientFacingSummary: portalProject.clientFacingSummary,
    health: portalProject.health,
    progressPercent: Number(portalProject.progressPercent || 0),
    targetDate: portalProject.targetDate || "",
    currentPhaseLabel: portalProject.currentPhaseLabel || "",
    statusNarrative: portalProject.statusNarrative || "",
    nextUpdateExpectedAt: portalProject.nextUpdateExpectedAt || "",
    projectManagerContact: {
      name: portalProject.projectManagerName || "",
      email: portalProject.projectManagerEmail || "",
      phone: portalProject.projectManagerPhone || ""
    },
    latestPublishedReportSnapshotId: portalProject.latestPublishedReportSnapshotId || null,
    publishedAt: portalProject.publishedAt || portalProject.updatedAt || ""
  };
}

async function loadPublishedPortalProject(database, projectId, clientId) {
  const portalProject = await getDocData(database.doc(orgPath("portalProjects", projectId)));
  if (!portalProject || portalProject.clientId !== clientId || portalProject.publicationStatus !== "published" || portalProject.visibility !== "client_visible") {
    safeNotFound();
  }
  return portalProject;
}

export async function listPortalProjects(actor, { database = firestore() } = {}) {
  const access = await loadPortalAccess(actor, undefined, { database });
  const accessSnapshot = await database.collection(orgPath("portalUsers", actor.uid, "projectAccess")).where("status", "==", "active").get();
  const projects = [];

  for (const accessDoc of accessSnapshot.docs) {
    const projectAccess = { id: accessDoc.id, ...accessDoc.data() };
    if (projectAccess.userId !== actor.uid || projectAccess.clientId !== access.portalUser.clientId || isExpired(projectAccess)) {
      continue;
    }
    try {
      const portalProject = await loadPublishedPortalProject(database, projectAccess.projectId, access.portalUser.clientId);
      projects.push(projectSummaryDto(portalProject));
    } catch {
      // Inaccessible or unpublished projects are intentionally omitted.
    }
  }

  return { projects };
}

async function loadReportPublication(database, projectId, snapshotId, clientId) {
  const publication = await getDocData(database.doc(orgPath("projects", projectId, "reportPublications", snapshotId)));
  if (!publication || publication.status !== "published" || publication.clientId !== clientId || publication.snapshotId !== snapshotId) {
    safeNotFound();
  }
  return publication;
}

async function loadSnapshotForPublication(database, projectId, publication) {
  const snapshot = await getDocData(database.doc(orgPath("projects", projectId, "reports", publication.reportId, "snapshots", publication.snapshotId)));
  if (!snapshot || snapshot.projectId !== projectId || snapshot.reportId !== publication.reportId || !snapshot.approvedAt || !snapshot.contentHash) {
    safeNotFound();
  }
  return snapshot;
}

export function toPortalReportDto(snapshot, publication, portalProject) {
  return {
    portalReportId: publication.snapshotId,
    title: snapshot.title,
    projectName: portalProject.projectName,
    clientName: portalProject.clientName || "",
    reportingPeriodStart: snapshot.reportingPeriodStart,
    reportingPeriodEnd: snapshot.reportingPeriodEnd,
    approvedAt: snapshot.approvedAt,
    publishedAt: publication.publishedAt,
    pdfAvailable: true
  };
}

function mapReportItem(item) {
  return {
    title: item.title,
    status: item.status || "",
    dueDate: item.dueDate || "",
    owner: ""
  };
}

export function toPortalSnapshotDto(snapshot, publication, portalProject) {
  return {
    portalReportId: publication.snapshotId,
    title: snapshot.title,
    projectName: portalProject.projectName,
    clientName: portalProject.clientName || "",
    reportingPeriodStart: snapshot.reportingPeriodStart,
    reportingPeriodEnd: snapshot.reportingPeriodEnd,
    approvedAt: snapshot.approvedAt,
    publishedAt: publication.publishedAt,
    sections: {
      executiveSummary: snapshot.sections?.executiveSummary || "",
      progressSummary: snapshot.sections?.progressSummary || "",
      highlights: (snapshot.sections?.highlights || []).map((item) => String(item)),
      completedTasks: (snapshot.sections?.completedTasks || []).map(mapReportItem),
      upcomingTasks: (snapshot.sections?.upcomingTasks || []).map(mapReportItem),
      milestones: (snapshot.sections?.milestones || []).map(mapReportItem),
      risks: (snapshot.sections?.risks || []).map(mapReportItem),
      clientActions: (snapshot.sections?.clientActions || []).map((item) => String(item)),
      nextSteps: snapshot.sections?.nextSteps || ""
    },
    projectManagerContact: {
      name: portalProject.projectManagerName || "",
      email: portalProject.projectManagerEmail || "",
      phone: portalProject.projectManagerPhone || ""
    }
  };
}

export function assertClientSafeSnapshot(snapshot, project, clientId) {
  if (!snapshot || snapshot.projectId !== project.id || snapshot.clientId && snapshot.clientId !== clientId) {
    safeNotFound();
  }

  if (snapshot.visibility && snapshot.visibility !== "client_visible") {
    safeNotFound();
  }

  if (!snapshot.title || !snapshot.reportingPeriodStart || !snapshot.reportingPeriodEnd || !snapshot.sections || !snapshot.approvedAt) {
    throw new PortalServiceError("Approved report snapshot is not eligible for portal publication.", { status: 409, code: "snapshot_not_portal_eligible" });
  }
}

export async function getPortalProject(actor, projectId, { database = firestore() } = {}) {
  const access = await loadPortalAccess(actor, projectId, { database });
  const portalProject = await loadPublishedPortalProject(database, projectId, access.portalUser.clientId);
  const publicationSnapshot = await database.collection(orgPath("projects", projectId, "reportPublications")).where("status", "==", "published").get();
  const reports = publicationSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((publication) => publication.clientId === access.portalUser.clientId);

  return {
    project: {
      ...projectSummaryDto(portalProject),
      availableReportCount: reports.length,
      latestPublishedReport: reports.sort((left, right) => String(right.publishedAt).localeCompare(String(left.publishedAt)))[0] || null
    }
  };
}

export async function listPortalReports(actor, projectId, { database = firestore() } = {}) {
  const access = await loadPortalAccess(actor, projectId, { database });
  const portalProject = await loadPublishedPortalProject(database, projectId, access.portalUser.clientId);
  const snapshot = await database.collection(orgPath("projects", projectId, "reportPublications")).where("status", "==", "published").get();
  const reports = [];

  for (const doc of snapshot.docs) {
    const publication = { id: doc.id, ...doc.data() };
    if (publication.clientId !== access.portalUser.clientId) continue;
    const reportSnapshot = await loadSnapshotForPublication(database, projectId, publication);
    assertClientSafeSnapshot(reportSnapshot, access.project, access.portalUser.clientId);
    reports.push(toPortalReportDto(reportSnapshot, publication, portalProject));
  }

  return { reports };
}

export async function getPortalReport(actor, projectId, snapshotId, { database = firestore() } = {}) {
  const access = await loadPortalAccess(actor, projectId, { database });
  const portalProject = await loadPublishedPortalProject(database, projectId, access.portalUser.clientId);
  const publication = await loadReportPublication(database, projectId, snapshotId, access.portalUser.clientId);
  const snapshot = await loadSnapshotForPublication(database, projectId, publication);
  assertClientSafeSnapshot(snapshot, access.project, access.portalUser.clientId);
  return { report: toPortalSnapshotDto(snapshot, publication, portalProject) };
}

export async function getPortalReportPdf(actor, projectId, snapshotId, { database = firestore() } = {}) {
  const access = await loadPortalAccess(actor, projectId, { database });
  const portalProject = await loadPublishedPortalProject(database, projectId, access.portalUser.clientId);
  const publication = await loadReportPublication(database, projectId, snapshotId, access.portalUser.clientId);
  const snapshot = await loadSnapshotForPublication(database, projectId, publication);
  assertClientSafeSnapshot(snapshot, access.project, access.portalUser.clientId);
  const buffer = await renderReportPdfBuffer(snapshot);

  return {
    buffer,
    filename: `${sanitizeFilenameSegment(portalProject.projectName)}-${sanitizeFilenameSegment(snapshot.title)}.pdf`
  };
}

function canAdministerPortal(actor) {
  return actor?.profile?.role === "admin";
}

async function requirePublishAccess(actor, projectId, database) {
  if (actor?.profile?.role === "admin") return true;
  const access = await loadProjectAccess({ uid: actor.uid, role: actor.profile.role }, projectId, { database });
  if (!access.canManageCommunication) {
    safeDenied("Insufficient authorization for portal publication.");
  }
  return true;
}

export async function listPortalUsers(actor, { database = firestore() } = {}) {
  if (!canAdministerPortal(actor)) safeDenied("Only administrators can manage portal users.");
  const snapshot = await database.collection(orgPath("portalUsers")).get();
  return { portalUsers: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
}

export async function upsertPortalUser(actor, userId, input, { database = firestore() } = {}) {
  if (!canAdministerPortal(actor)) safeDenied("Only administrators can manage portal users.");
  const [profile, client] = await Promise.all([
    getDocData(database.doc(orgPath("users", userId))),
    loadClient(database, input.clientId)
  ]);
  if (!profile || profile.role !== "client" || !client) {
    throw new PortalServiceError("Portal user must reference an existing client-role user and client.", { status: 400, code: "invalid_portal_user" });
  }

  const timestamp = nowIso();
  const value = {
    id: userId,
    organizationId: API_ORGANIZATION_ID,
    userId,
    clientId: client.id,
    email: profile.email || input.email || "",
    displayName: input.displayName || profile.name || profile.email || userId,
    status: ["active", "suspended", "revoked"].includes(input.status) ? input.status : "active",
    createdBy: input.createdBy || actor.uid,
    createdAt: input.createdAt || timestamp,
    updatedBy: actor.uid,
    updatedAt: timestamp,
    lastPortalLoginAt: input.lastPortalLoginAt || null,
    revokedBy: input.status === "revoked" ? actor.uid : null,
    revokedAt: input.status === "revoked" ? timestamp : null
  };
  await database.doc(orgPath("portalUsers", userId)).set(value, { merge: true });
  return value;
}

export async function setPortalUserStatus(actor, userId, status, { database = firestore() } = {}) {
  if (!canAdministerPortal(actor)) safeDenied("Only administrators can manage portal users.");
  if (!["active", "suspended", "revoked"].includes(status)) {
    throw new PortalServiceError("Invalid portal user status.", { status: 400, code: "invalid_portal_status" });
  }
  const timestamp = nowIso();
  const patch = {
    status,
    updatedBy: actor.uid,
    updatedAt: timestamp,
    revokedBy: status === "revoked" ? actor.uid : null,
    revokedAt: status === "revoked" ? timestamp : null
  };
  await database.doc(orgPath("portalUsers", userId)).update(patch);
  return { id: userId, ...patch };
}

export async function grantPortalProjectAccess(actor, userId, projectId, input = {}, { database = firestore() } = {}) {
  if (!canAdministerPortal(actor)) safeDenied("Only administrators can manage portal project access.");
  const [portalUser, project] = await Promise.all([
    getDocData(database.doc(orgPath("portalUsers", userId))),
    getDocData(database.doc(orgPath("projects", projectId)))
  ]);
  if (!portalUser || !project || portalUser.clientId !== project.clientId) {
    throw new PortalServiceError("Project access must match the portal user's client.", { status: 400, code: "invalid_project_access" });
  }
  const timestamp = nowIso();
  const value = {
    id: projectId,
    organizationId: API_ORGANIZATION_ID,
    userId,
    clientId: portalUser.clientId,
    projectId,
    accessLevel: "read_only",
    status: input.status === "revoked" ? "revoked" : "active",
    grantedBy: input.grantedBy || actor.uid,
    grantedAt: input.grantedAt || timestamp,
    updatedBy: actor.uid,
    updatedAt: timestamp,
    revokedBy: input.status === "revoked" ? actor.uid : null,
    revokedAt: input.status === "revoked" ? timestamp : null,
    expiresAt: input.expiresAt || null
  };
  await database.doc(orgPath("portalUsers", userId, "projectAccess", projectId)).set(value);
  await auditProjectEvent(database, projectId, actor.uid, "portal_project_access_granted", "Client portal project access granted.", { userId, clientId: portalUser.clientId, projectId });
  return value;
}

export async function revokePortalProjectAccess(actor, userId, projectId, { database = firestore() } = {}) {
  if (!canAdministerPortal(actor)) safeDenied("Only administrators can manage portal project access.");
  const timestamp = nowIso();
  await database.doc(orgPath("portalUsers", userId, "projectAccess", projectId)).update({ status: "revoked", updatedBy: actor.uid, updatedAt: timestamp, revokedBy: actor.uid, revokedAt: timestamp });
  await auditProjectEvent(database, projectId, actor.uid, "portal_project_access_revoked", "Client portal project access revoked.", { userId, projectId });
  return { id: projectId, status: "revoked", updatedAt: timestamp };
}

export async function previewPortalProjectPublication(actor, projectId, { database = firestore() } = {}) {
  await requirePublishAccess(actor, projectId, database);
  const [project, phases, tasks, owner] = await Promise.all([
    getDocData(database.doc(orgPath("projects", projectId))),
    database.collection(orgPath("projects", projectId, "phases")).get(),
    database.collection(orgPath("projects", projectId, "tasks")).get(),
    null
  ]);
  if (!project) safeNotFound();
  const taskValues = tasks.docs.map((doc) => doc.data());
  const completeCount = taskValues.filter((task) => task.status === "done").length;
  const progressPercent = taskValues.length ? Math.round((completeCount / taskValues.length) * 100) : 0;
  const phaseValues = phases.docs.map((doc) => doc.data()).sort((left, right) => String(left.startDate).localeCompare(String(right.startDate)));
  const ownerProfile = await getDocData(database.doc(orgPath("users", project.ownerId)));

  return {
    id: projectId,
    organizationId: API_ORGANIZATION_ID,
    projectId,
    clientId: project.clientId,
    publicationStatus: "published",
    projectName: project.name,
    clientFacingSummary: project.summary || "",
    health: project.health || "on_track",
    progressPercent,
    targetDate: project.targetDate || "",
    currentPhaseLabel: phaseValues.find((phase) => phase.status === "active")?.name || phaseValues[0]?.name || "",
    statusNarrative: "",
    nextUpdateExpectedAt: "",
    projectManagerName: ownerProfile?.name || "",
    projectManagerEmail: ownerProfile?.email || "",
    projectManagerPhone: ownerProfile?.phone || "",
    latestPublishedReportSnapshotId: null,
    visibility: "client_visible"
  };
}

export async function publishPortalProject(actor, projectId, input, { database = firestore() } = {}) {
  await requirePublishAccess(actor, projectId, database);
  const project = await getDocData(database.doc(orgPath("projects", projectId)));
  if (!project) safeNotFound();
  const preview = await previewPortalProjectPublication(actor, projectId, { database });
  const timestamp = nowIso();
  const value = {
    ...preview,
    ...input,
    id: projectId,
    organizationId: API_ORGANIZATION_ID,
    projectId,
    clientId: project.clientId,
    publicationStatus: input.publicationStatus === "withdrawn" ? "withdrawn" : "published",
    visibility: "client_visible",
    publishedBy: input.publishedBy || actor.uid,
    publishedAt: input.publishedAt || timestamp,
    updatedBy: actor.uid,
    updatedAt: timestamp,
    withdrawnBy: input.publicationStatus === "withdrawn" ? actor.uid : null,
    withdrawnAt: input.publicationStatus === "withdrawn" ? timestamp : null
  };
  await database.doc(orgPath("portalProjects", projectId)).set(value, { merge: true });
  await auditProjectEvent(database, projectId, actor.uid, value.publicationStatus === "published" ? "portal_project_published" : "portal_project_withdrawn", value.publicationStatus === "published" ? "Client portal project summary published." : "Client portal project summary withdrawn.", { projectId, clientId: project.clientId });
  return value;
}

export async function withdrawPortalProject(actor, projectId, { database = firestore() } = {}) {
  return publishPortalProject(actor, projectId, { publicationStatus: "withdrawn" }, { database });
}

export async function publishReportSnapshot(actor, projectId, snapshotId, { database = firestore() } = {}) {
  await requirePublishAccess(actor, projectId, database);
  const project = await getDocData(database.doc(orgPath("projects", projectId)));
  if (!project) safeNotFound();
  const reports = await database.collection(orgPath("projects", projectId, "reports")).get();
  let report = null;
  let snapshot = null;

  for (const reportDoc of reports.docs) {
    const candidate = await getDocData(database.doc(orgPath("projects", projectId, "reports", reportDoc.id, "snapshots", snapshotId)));
    if (candidate) {
      report = { id: reportDoc.id, ...reportDoc.data() };
      snapshot = candidate;
      break;
    }
  }

  if (!report || !snapshot || report.status !== "approved") safeNotFound();
  assertClientSafeSnapshot(snapshot, project, project.clientId);
  const timestamp = nowIso();
  const value = {
    id: snapshotId,
    organizationId: API_ORGANIZATION_ID,
    projectId,
    clientId: project.clientId,
    reportId: report.id,
    snapshotId,
    status: "published",
    publishedBy: actor.uid,
    publishedAt: timestamp,
    updatedAt: timestamp,
    withdrawnBy: null,
    withdrawnAt: null
  };
  await database.doc(orgPath("projects", projectId, "reportPublications", snapshotId)).set(value, { merge: true });
  await database.doc(orgPath("portalProjects", projectId)).set({ latestPublishedReportSnapshotId: snapshotId, updatedBy: actor.uid, updatedAt: timestamp }, { merge: true });
  await auditProjectEvent(database, projectId, actor.uid, "client_report_published_to_portal", "Approved client report published to portal.", { projectId, reportId: report.id, snapshotId });
  return value;
}

export async function withdrawReportPublication(actor, projectId, snapshotId, { database = firestore() } = {}) {
  await requirePublishAccess(actor, projectId, database);
  const timestamp = nowIso();
  await database.doc(orgPath("projects", projectId, "reportPublications", snapshotId)).update({ status: "withdrawn", updatedAt: timestamp, withdrawnBy: actor.uid, withdrawnAt: timestamp });
  await auditProjectEvent(database, projectId, actor.uid, "client_report_publication_withdrawn", "Published client report withdrawn from portal.", { projectId, snapshotId });
  return { id: snapshotId, status: "withdrawn", updatedAt: timestamp };
}
