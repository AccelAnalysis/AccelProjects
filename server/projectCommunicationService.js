import crypto from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { API_ORGANIZATION_ID, getAdminApp } from "./apiAuth.js";
import { getMicrosoftGraphAccessToken } from "./microsoftGraphAuthService.js";
import {
  cancelCalendarEventViaGraph,
  createCalendarEventViaGraph,
  getMicrosoftProjectConfig,
  GraphServiceError,
  sendProjectEmailViaGraph,
  updateCalendarEventViaGraph,
  validateRecipients
} from "./microsoftGraphService.js";

function firestore() {
  return getFirestore(getAdminApp());
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function projectPath(projectId) {
  return `organizations/${API_ORGANIZATION_ID}/projects/${projectId}`;
}

function requestHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function activityRef(database, projectId) {
  const id = createId("activity");
  return {
    id,
    ref: database.doc(`${projectPath(projectId)}/activityEvents/${id}`)
  };
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
    message: error instanceof Error ? error.message.slice(0, 240) : "Project communication request failed"
  };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function validateCommunicationInput(input) {
  const subject = normalizeText(input.subject);
  const bodyText = normalizeText(input.bodyText);
  const toRecipients = validateRecipients(input.toRecipients || [], "To recipients");
  const ccRecipients = validateRecipients(input.ccRecipients || [], "CC recipients");
  const bccRecipients = validateRecipients(input.bccRecipients || [], "BCC recipients");

  if (!subject) {
    throw new GraphServiceError("Subject is required.", { status: 400, code: "missing_subject", category: "validation" });
  }

  if (!bodyText) {
    throw new GraphServiceError("Message body is required.", { status: 400, code: "missing_body", category: "validation" });
  }

  if (toRecipients.length === 0) {
    throw new GraphServiceError("At least one To recipient is required.", { status: 400, code: "missing_to_recipient", category: "validation" });
  }

  if (Array.isArray(input.attachmentRefs) && input.attachmentRefs.length > 0) {
    throw new GraphServiceError("Report attachments are reserved for Run 3 and cannot be sent yet.", { status: 400, code: "attachments_not_supported", category: "validation" });
  }

  return {
    subject,
    bodyText,
    toRecipients,
    ccRecipients,
    bccRecipients,
    audience: ["client", "internal", "mixed"].includes(input.audience) ? input.audience : "client",
    visibility: input.visibility === "client_visible" ? "client_visible" : "internal",
    sourceType: input.sourceType === "report_snapshot" ? "report_snapshot" : "manual_project_update",
    sourceId: input.sourceId || null
  };
}

function validateCalendarInput(input, defaultTimeZone) {
  const title = normalizeText(input.title);
  const startDateTime = normalizeText(input.startDateTime);
  const endDateTime = normalizeText(input.endDateTime);

  if (!title) {
    throw new GraphServiceError("Event title is required.", { status: 400, code: "missing_title", category: "validation" });
  }

  if (!startDateTime || !endDateTime) {
    throw new GraphServiceError("Start and end date/time are required.", { status: 400, code: "missing_event_time", category: "validation" });
  }

  if (Number.isNaN(Date.parse(startDateTime)) || Number.isNaN(Date.parse(endDateTime)) || Date.parse(endDateTime) <= Date.parse(startDateTime)) {
    throw new GraphServiceError("Event end must be after the start.", { status: 400, code: "invalid_event_time", category: "validation" });
  }

  return {
    title,
    descriptionText: normalizeText(input.descriptionText),
    visibility: input.visibility === "client_visible" ? "client_visible" : "internal",
    startDateTime,
    endDateTime,
    timeZone: normalizeText(input.timeZone) || defaultTimeZone,
    isAllDay: Boolean(input.isAllDay),
    location: normalizeText(input.location),
    attendees: validateRecipients(input.attendees || [], "attendees"),
    reminderMinutesBeforeStart: Number.isFinite(Number(input.reminderMinutesBeforeStart)) ? Number(input.reminderMinutesBeforeStart) : 15,
    relatedEntityType: ["project", "task", "milestone", "report", "other"].includes(input.relatedEntityType) ? input.relatedEntityType : "project",
    relatedEntityId: input.relatedEntityId || null
  };
}

export async function listProjectCommunicationWorkspace(projectId, { database = firestore() } = {}) {
  const base = database.doc(projectPath(projectId));
  const [communicationSnapshot, calendarSnapshot] = await Promise.all([
    base.collection("communications").orderBy("updatedAt", "desc").get(),
    base.collection("calendarEvents").orderBy("updatedAt", "desc").get()
  ]);

  return {
    communications: communicationSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    calendarEvents: calendarSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  };
}

export async function createCommunicationDraft(projectId, actor, input, { database = firestore(), env = process.env } = {}) {
  const config = getMicrosoftProjectConfig(env);
  const value = validateCommunicationInput(input);
  const id = createId("comm");
  const timestamp = nowIso();
  const communication = {
    id,
    organizationId: API_ORGANIZATION_ID,
    projectId,
    channel: "email",
    direction: "outbound",
    ...value,
    status: "draft",
    senderMailbox: config.senderMailbox,
    provider: "microsoft_graph",
    attachmentRefs: [],
    idempotencyKey: input.idempotencyKey || createId("idem"),
    createdBy: actor.uid,
    createdAt: timestamp,
    updatedBy: actor.uid,
    updatedAt: timestamp,
    sendRequestedAt: null,
    acceptedAt: null,
    failedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null
  };

  await database.doc(`${projectPath(projectId)}/communications/${id}`).set(communication);
  return communication;
}

export async function sendCommunication(projectId, communicationId, actor, { database = firestore(), env = process.env, getAccessToken = getMicrosoftGraphAccessToken, fetchImpl = fetch, retryUnknown = false } = {}) {
  const communicationRef = database.doc(`${projectPath(projectId)}/communications/${communicationId}`);
  const timestamp = nowIso();
  let communication;
  let attempt;

  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(communicationRef);

    if (!snapshot.exists) {
      throw new GraphServiceError("Communication not found.", { status: 404, code: "communication_not_found", category: "not_found" });
    }

    communication = { id: snapshot.id, ...snapshot.data() };

    if (communication.projectId !== projectId) {
      throw new GraphServiceError("Communication does not belong to this project.", { status: 404, code: "communication_not_found", category: "not_found" });
    }

    if (communication.status === "accepted" || communication.status === "sending") {
      throw new GraphServiceError("This communication has already been sent or is currently sending.", { status: 409, code: "communication_already_sent", category: "conflict" });
    }

    if (communication.status === "unknown" && !retryUnknown) {
      throw new GraphServiceError("Prior send status is unknown. Confirm duplicate-delivery risk before retrying.", { status: 409, code: "retry_unknown_requires_confirmation", category: "conflict" });
    }

    const attemptNumber = Number(communication.attemptCount || 0) + 1;
    attempt = {
      id: createId("attempt"),
      organizationId: API_ORGANIZATION_ID,
      projectId,
      communicationId,
      attemptNumber,
      actorId: actor.uid,
      startedAt: timestamp,
      finishedAt: null,
      status: "sending",
      provider: "microsoft_graph",
      providerHttpStatus: null,
      errorCategory: null,
      errorCode: null,
      errorMessage: null,
      requestHash: requestHash({ communicationId, subject: communication.subject, to: communication.toRecipients, cc: communication.ccRecipients }),
      createdAt: timestamp
    };

    transaction.update(communicationRef, {
      status: "sending",
      sendRequestedAt: timestamp,
      updatedBy: actor.uid,
      updatedAt: timestamp,
      attemptCount: attemptNumber
    });
    transaction.set(communicationRef.collection("deliveryAttempts").doc(attempt.id), attempt);
  });

  try {
    const result = await sendProjectEmailViaGraph({ communication, env, getAccessToken, fetchImpl });
    const acceptedAt = nowIso();
    const updated = {
      ...communication,
      status: result.status,
      senderMailbox: result.senderMailbox,
      sendRequestedAt: timestamp,
      acceptedAt: result.status === "accepted" ? acceptedAt : null,
      failedAt: null,
      updatedBy: actor.uid,
      updatedAt: acceptedAt,
      lastErrorCode: null,
      lastErrorMessage: null
    };

    await database.runTransaction(async (transaction) => {
      transaction.update(communicationRef, updated);
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
        type: "project_email_accepted",
        message: "Project email accepted by Microsoft 365 for delivery.",
        metadata: {
          communicationId,
          channel: "email",
          recipientCount: communication.toRecipients.length + communication.ccRecipients.length,
          subject: communication.subject,
          status: result.status
        },
        createdAt: acceptedAt
      });
    });

    return { communication: updated, attempt: { ...attempt, status: result.status, finishedAt: acceptedAt, providerHttpStatus: result.providerHttpStatus } };
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
      const activity = activityRef(database, projectId);
      transaction.set(activity.ref, {
        id: activity.id,
        projectId,
        actorId: actor.uid,
        type: status === "unknown" ? "project_email_unknown" : "project_email_failed",
        message: status === "unknown" ? "Project email send status is unknown." : "Project email failed.",
        metadata: {
          communicationId,
          channel: "email",
          recipientCount: communication.toRecipients.length + communication.ccRecipients.length,
          subject: communication.subject,
          status
        },
        createdAt: finishedAt
      });
    });

    if (safe.status && safe.status >= 400 && safe.status < 500) {
      throw error;
    }

    return {
      communication: {
        ...communication,
        status,
        failedAt: status === "failed" ? finishedAt : null,
        lastErrorCode: safe.code,
        lastErrorMessage: safe.message
      },
      attempt: { ...attempt, status, finishedAt, providerHttpStatus: safe.status, errorCategory: safe.category, errorCode: safe.code, errorMessage: safe.message }
    };
  }
}

export async function createCalendarDraft(projectId, actor, input, { database = firestore(), env = process.env } = {}) {
  const config = getMicrosoftProjectConfig(env);
  const value = validateCalendarInput(input, config.defaultTimeZone);
  const id = createId("cal");
  const timestamp = nowIso();
  const calendarEvent = {
    id,
    organizationId: API_ORGANIZATION_ID,
    projectId,
    ...value,
    status: "draft",
    calendarOwnerEmail: config.calendarOwnerEmail,
    transactionId: input.transactionId || createId("txn"),
    graphEventId: null,
    graphICalUId: null,
    graphWebLink: null,
    graphChangeKey: null,
    createdBy: actor.uid,
    createdAt: timestamp,
    updatedBy: actor.uid,
    updatedAt: timestamp,
    lastSyncedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null
  };

  await database.doc(`${projectPath(projectId)}/calendarEvents/${id}`).set(calendarEvent);
  return calendarEvent;
}

async function loadCalendarEvent(projectId, calendarEventId, database) {
  const ref = database.doc(`${projectPath(projectId)}/calendarEvents/${calendarEventId}`);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new GraphServiceError("Calendar event not found.", { status: 404, code: "calendar_event_not_found", category: "not_found" });
  }

  return { ref, calendarEvent: { id: snapshot.id, ...snapshot.data() } };
}

export async function createCalendarEvent(projectId, calendarEventId, actor, { database = firestore(), env = process.env, getAccessToken = getMicrosoftGraphAccessToken, fetchImpl = fetch } = {}) {
  const { ref, calendarEvent } = await loadCalendarEvent(projectId, calendarEventId, database);

  if (calendarEvent.status === "scheduled") {
    throw new GraphServiceError("Calendar event is already scheduled.", { status: 409, code: "calendar_already_scheduled", category: "conflict" });
  }

  await ref.update({ status: "creating", updatedBy: actor.uid, updatedAt: nowIso() });

  try {
    const result = await createCalendarEventViaGraph({ calendarEvent, env, getAccessToken, fetchImpl });
    const timestamp = nowIso();
    const update = {
      status: "scheduled",
      calendarOwnerEmail: result.calendarOwnerEmail,
      graphEventId: result.graphEventId,
      graphICalUId: result.graphICalUId,
      graphWebLink: result.graphWebLink,
      graphChangeKey: result.graphChangeKey,
      lastSyncedAt: timestamp,
      updatedBy: actor.uid,
      updatedAt: timestamp,
      lastErrorCode: null,
      lastErrorMessage: null
    };

    await ref.update(update);
    const activity = activityRef(database, projectId);
    await activity.ref.set({
      id: activity.id,
      projectId,
      actorId: actor.uid,
      type: "calendar_event_scheduled",
      message: "Outlook calendar event scheduled.",
      metadata: { calendarEventId, title: calendarEvent.title, status: "scheduled", attendeeCount: calendarEvent.attendees.length },
      createdAt: timestamp
    });
    return { ...calendarEvent, ...update };
  } catch (error) {
    const safe = safeError(error);
    const timestamp = nowIso();
    await ref.update({ status: "failed", updatedBy: actor.uid, updatedAt: timestamp, lastErrorCode: safe.code, lastErrorMessage: safe.message });
    throw error;
  }
}

export async function updateCalendarEvent(projectId, calendarEventId, actor, input, { database = firestore(), env = process.env, getAccessToken = getMicrosoftGraphAccessToken, fetchImpl = fetch } = {}) {
  const { ref, calendarEvent } = await loadCalendarEvent(projectId, calendarEventId, database);
  const value = validateCalendarInput({ ...calendarEvent, ...input }, calendarEvent.timeZone);
  const nextEvent = { ...calendarEvent, ...value };

  await ref.update({ ...value, status: "updating", updatedBy: actor.uid, updatedAt: nowIso() });
  const result = await updateCalendarEventViaGraph({ calendarEvent: nextEvent, env, getAccessToken, fetchImpl });
  const timestamp = nowIso();
  const update = {
    ...value,
    status: "scheduled",
    graphEventId: result.graphEventId,
    graphICalUId: result.graphICalUId,
    graphWebLink: result.graphWebLink,
    graphChangeKey: result.graphChangeKey,
    lastSyncedAt: timestamp,
    updatedBy: actor.uid,
    updatedAt: timestamp,
    lastErrorCode: null,
    lastErrorMessage: null
  };

  await ref.update(update);
  const activity = activityRef(database, projectId);
  await activity.ref.set({
    id: activity.id,
    projectId,
    actorId: actor.uid,
    type: "calendar_event_updated",
    message: "Outlook calendar event updated.",
    metadata: { calendarEventId, title: update.title, status: "scheduled" },
    createdAt: timestamp
  });
  return { ...calendarEvent, ...update };
}

export async function cancelCalendarEvent(projectId, calendarEventId, actor, { database = firestore(), env = process.env, getAccessToken = getMicrosoftGraphAccessToken, fetchImpl = fetch } = {}) {
  const { ref, calendarEvent } = await loadCalendarEvent(projectId, calendarEventId, database);

  await ref.update({ status: "canceling", updatedBy: actor.uid, updatedAt: nowIso() });
  await cancelCalendarEventViaGraph({ calendarEvent, env, getAccessToken, fetchImpl });

  const timestamp = nowIso();
  const update = { status: "canceled", updatedBy: actor.uid, updatedAt: timestamp, lastSyncedAt: timestamp, lastErrorCode: null, lastErrorMessage: null };
  await ref.update(update);
  const activity = activityRef(database, projectId);
  await activity.ref.set({
    id: activity.id,
    projectId,
    actorId: actor.uid,
    type: "calendar_event_canceled",
    message: "Outlook calendar event canceled.",
    metadata: { calendarEventId, title: calendarEvent.title, status: "canceled" },
    createdAt: timestamp
  });
  return { ...calendarEvent, ...update };
}
