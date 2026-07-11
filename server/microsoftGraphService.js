const graphBaseUrl = "https://graph.microsoft.com/v1.0";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class GraphServiceError extends Error {
  constructor(message, { status = null, code = "graph_error", category = "provider_error", retryAfter = null } = {}) {
    super(message);
    this.name = "GraphServiceError";
    this.status = status;
    this.code = code;
    this.category = category;
    this.retryAfter = retryAfter;
  }
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowedMailboxes(env = process.env) {
  const explicit = splitList(env.MICROSOFT_ALLOWED_MAILBOXES);
  const defaults = [env.MICROSOFT_SENDER_EMAIL, env.MICROSOFT_CALENDAR_OWNER_EMAIL].filter(Boolean).map((value) => String(value).toLowerCase());
  return Array.from(new Set([...explicit, ...defaults]));
}

export function getMicrosoftProjectConfig(env = process.env) {
  const senderMailbox = String(env.MICROSOFT_SENDER_EMAIL || "").trim().toLowerCase();
  const calendarOwnerEmail = String(env.MICROSOFT_CALENDAR_OWNER_EMAIL || env.MICROSOFT_SENDER_EMAIL || "").trim().toLowerCase();
  const defaultTimeZone = String(env.MICROSOFT_DEFAULT_TIME_ZONE || "Eastern Standard Time").trim();
  const allowedMailboxes = getAllowedMailboxes(env);
  const missing = ["MICROSOFT_TENANT_ID", "MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_GRAPH_SCOPE", "MICROSOFT_SENDER_EMAIL"]
    .filter((key) => !env[key]);

  return {
    configured: missing.length === 0,
    calendarConfigured: missing.length === 0 && Boolean(calendarOwnerEmail),
    missing,
    senderMailbox,
    calendarOwnerEmail,
    defaultTimeZone,
    allowedMailboxes
  };
}

export function assertAllowedMailbox(mailbox, env = process.env) {
  const normalized = String(mailbox || "").trim().toLowerCase();

  if (!normalized || !emailPattern.test(normalized)) {
    throw new GraphServiceError("Configured mailbox is invalid.", { code: "invalid_mailbox", category: "configuration" });
  }

  if (!getAllowedMailboxes(env).includes(normalized)) {
    throw new GraphServiceError("Mailbox is not allowed for AccelProjects project delivery.", { status: 403, code: "mailbox_not_allowed", category: "authorization" });
  }

  return normalized;
}

export function validateRecipients(recipients, label = "recipients") {
  if (!Array.isArray(recipients)) {
    throw new GraphServiceError(`${label} must be a list.`, { status: 400, code: "invalid_recipients", category: "validation" });
  }

  return recipients.map((recipient) => {
    const email = String(recipient?.email || "").trim().toLowerCase();

    if (!emailPattern.test(email)) {
      throw new GraphServiceError(`Invalid ${label} email address.`, { status: 400, code: "invalid_recipient", category: "validation" });
    }

    return {
      name: String(recipient?.name || "").trim(),
      email
    };
  });
}

function toGraphRecipients(recipients) {
  return recipients.map((recipient) => ({
    emailAddress: {
      address: recipient.email,
      ...(recipient.name ? { name: recipient.name } : {})
    }
  }));
}

const defaultDirectAttachmentLimitBytes = 2_500_000;

function normalizeGraphAttachments(attachments = [], maxDirectAttachmentBytes = defaultDirectAttachmentLimitBytes) {
  if (!Array.isArray(attachments)) {
    throw new GraphServiceError("Attachments must be a list.", { status: 400, code: "invalid_attachments", category: "validation" });
  }

  return attachments.map((attachment) => {
    const name = String(attachment?.name || attachment?.filename || "").trim();
    const contentType = String(attachment?.contentType || attachment?.mimeType || "application/octet-stream").trim();
    const bytes = Buffer.isBuffer(attachment?.contentBytes)
      ? attachment.contentBytes
      : Buffer.from(String(attachment?.contentBytes || ""), "base64");

    if (!name) {
      throw new GraphServiceError("Attachment filename is required.", { status: 400, code: "invalid_attachment_name", category: "validation" });
    }

    if (bytes.byteLength === 0) {
      throw new GraphServiceError("Attachment content is required.", { status: 400, code: "empty_attachment", category: "validation" });
    }

    if (bytes.byteLength > maxDirectAttachmentBytes) {
      throw new GraphServiceError("Report PDF is too large for direct Microsoft Graph email attachment delivery.", {
        status: 413,
        code: "attachment_too_large",
        category: "validation"
      });
    }

    return {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name,
      contentType,
      contentBytes: bytes.toString("base64")
    };
  });
}

async function readSafeGraphError(response) {
  try {
    const data = await response.json();
    return {
      code: String(data?.error?.code || `graph_${response.status}`),
      message: String(data?.error?.message || "Microsoft Graph request failed").slice(0, 240)
    };
  } catch {
    return {
      code: `graph_${response.status}`,
      message: "Microsoft Graph request failed"
    };
  }
}

function classifyStatus(status) {
  if (status === 401 || status === 403) {
    return "permission";
  }

  if (status === 429) {
    return "throttled";
  }

  if (status >= 500) {
    return "temporary";
  }

  return "provider_error";
}

export async function graphJsonRequest(path, { method = "GET", body, accessToken, fetchImpl = fetch, timeoutMs = 15000, correlationId } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(`${graphBaseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(correlationId ? { "client-request-id": correlationId } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      const graphError = await readSafeGraphError(response);
      throw new GraphServiceError(graphError.message, {
        status: response.status,
        code: graphError.code,
        category: classifyStatus(response.status),
        retryAfter: response.headers.get("retry-after")
      });
    }

    if (response.status === 202 || response.status === 204) {
      return { status: response.status, data: null };
    }

    return { status: response.status, data: await response.json() };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new GraphServiceError("Microsoft Graph request timed out; completion is unknown.", {
        code: "graph_timeout",
        category: "unknown"
      });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendProjectEmailViaGraph({
  communication,
  env = process.env,
  getAccessToken,
  fetchImpl = fetch,
  attachments = [],
  allowAttachments = false,
  maxDirectAttachmentBytes = defaultDirectAttachmentLimitBytes
}) {
  const config = getMicrosoftProjectConfig(env);

  if (!config.configured) {
    throw new GraphServiceError("Microsoft Graph email is not configured.", { code: "missing_graph_config", category: "configuration" });
  }

  if (Array.isArray(communication.attachmentRefs) && communication.attachmentRefs.length > 0 && !allowAttachments) {
    throw new GraphServiceError("Report attachments are reserved for Run 3 and cannot be sent yet.", { status: 400, code: "attachments_not_supported", category: "validation" });
  }

  const graphAttachments = allowAttachments ? normalizeGraphAttachments(attachments, maxDirectAttachmentBytes) : [];
  const sender = assertAllowedMailbox(config.senderMailbox, env);
  const toRecipients = validateRecipients(communication.toRecipients, "To recipients");
  const ccRecipients = validateRecipients(communication.ccRecipients || [], "CC recipients");
  const bccRecipients = validateRecipients(communication.bccRecipients || [], "BCC recipients");

  if (toRecipients.length === 0) {
    throw new GraphServiceError("At least one To recipient is required.", { status: 400, code: "missing_to_recipient", category: "validation" });
  }

  const accessToken = await getAccessToken();
  const result = await graphJsonRequest(`/users/${encodeURIComponent(sender)}/sendMail`, {
    method: "POST",
    accessToken,
    fetchImpl,
    correlationId: communication.id,
    body: {
      message: {
        subject: communication.subject,
        body: {
          contentType: "Text",
          content: communication.bodyText
        },
        toRecipients: toGraphRecipients(toRecipients),
        ccRecipients: toGraphRecipients(ccRecipients),
        bccRecipients: toGraphRecipients(bccRecipients),
        ...(graphAttachments.length > 0 ? { attachments: graphAttachments } : {})
      },
      saveToSentItems: true
    }
  });

  return {
    status: result.status === 202 ? "accepted" : "unknown",
    providerHttpStatus: result.status,
    senderMailbox: sender
  };
}

function toGraphEventAttendees(attendees) {
  return attendees.map((attendee) => ({
    emailAddress: {
      address: attendee.email,
      ...(attendee.name ? { name: attendee.name } : {})
    },
    type: "required"
  }));
}

export async function createCalendarEventViaGraph({ calendarEvent, env = process.env, getAccessToken, fetchImpl = fetch }) {
  const config = getMicrosoftProjectConfig(env);

  if (!config.calendarConfigured) {
    throw new GraphServiceError("Outlook calendar is not configured.", { code: "missing_calendar_config", category: "configuration" });
  }

  const calendarOwner = assertAllowedMailbox(config.calendarOwnerEmail, env);
  const attendees = validateRecipients(calendarEvent.attendees || [], "attendees");
  const accessToken = await getAccessToken();
  const result = await graphJsonRequest(`/users/${encodeURIComponent(calendarOwner)}/events`, {
    method: "POST",
    accessToken,
    fetchImpl,
    correlationId: calendarEvent.id,
    body: {
      subject: calendarEvent.title,
      body: { contentType: "Text", content: calendarEvent.descriptionText },
      start: { dateTime: calendarEvent.startDateTime, timeZone: calendarEvent.timeZone },
      end: { dateTime: calendarEvent.endDateTime, timeZone: calendarEvent.timeZone },
      isAllDay: Boolean(calendarEvent.isAllDay),
      location: calendarEvent.location ? { displayName: calendarEvent.location } : undefined,
      attendees: toGraphEventAttendees(attendees),
      reminderMinutesBeforeStart: Number(calendarEvent.reminderMinutesBeforeStart || 0),
      transactionId: calendarEvent.transactionId
    }
  });

  return {
    status: "scheduled",
    providerHttpStatus: result.status,
    calendarOwnerEmail: calendarOwner,
    graphEventId: result.data?.id || null,
    graphICalUId: result.data?.iCalUId || null,
    graphWebLink: result.data?.webLink || null,
    graphChangeKey: result.data?.changeKey || null
  };
}

export async function updateCalendarEventViaGraph({ calendarEvent, env = process.env, getAccessToken, fetchImpl = fetch }) {
  if (!calendarEvent.graphEventId) {
    throw new GraphServiceError("Cannot update an Outlook event before it has a Graph event ID.", { status: 400, code: "missing_graph_event", category: "validation" });
  }

  const calendarOwner = assertAllowedMailbox(calendarEvent.calendarOwnerEmail || getMicrosoftProjectConfig(env).calendarOwnerEmail, env);
  const attendees = validateRecipients(calendarEvent.attendees || [], "attendees");
  const accessToken = await getAccessToken();
  const result = await graphJsonRequest(`/users/${encodeURIComponent(calendarOwner)}/events/${encodeURIComponent(calendarEvent.graphEventId)}`, {
    method: "PATCH",
    accessToken,
    fetchImpl,
    correlationId: calendarEvent.id,
    body: {
      subject: calendarEvent.title,
      body: { contentType: "Text", content: calendarEvent.descriptionText },
      start: { dateTime: calendarEvent.startDateTime, timeZone: calendarEvent.timeZone },
      end: { dateTime: calendarEvent.endDateTime, timeZone: calendarEvent.timeZone },
      isAllDay: Boolean(calendarEvent.isAllDay),
      location: calendarEvent.location ? { displayName: calendarEvent.location } : undefined,
      attendees: toGraphEventAttendees(attendees),
      reminderMinutesBeforeStart: Number(calendarEvent.reminderMinutesBeforeStart || 0)
    }
  });

  return {
    status: "scheduled",
    providerHttpStatus: result.status,
    graphEventId: result.data?.id || calendarEvent.graphEventId,
    graphICalUId: result.data?.iCalUId || calendarEvent.graphICalUId || null,
    graphWebLink: result.data?.webLink || calendarEvent.graphWebLink || null,
    graphChangeKey: result.data?.changeKey || calendarEvent.graphChangeKey || null
  };
}

export async function cancelCalendarEventViaGraph({ calendarEvent, env = process.env, getAccessToken, fetchImpl = fetch }) {
  if (!calendarEvent.graphEventId) {
    throw new GraphServiceError("Cannot cancel an Outlook event before it has a Graph event ID.", { status: 400, code: "missing_graph_event", category: "validation" });
  }

  const calendarOwner = assertAllowedMailbox(calendarEvent.calendarOwnerEmail || getMicrosoftProjectConfig(env).calendarOwnerEmail, env);
  const accessToken = await getAccessToken();
  const result = await graphJsonRequest(`/users/${encodeURIComponent(calendarOwner)}/events/${encodeURIComponent(calendarEvent.graphEventId)}`, {
    method: "DELETE",
    accessToken,
    fetchImpl,
    correlationId: calendarEvent.id
  });

  return {
    status: "canceled",
    providerHttpStatus: result.status
  };
}
