import { describe, expect, it, vi } from "vitest";
import {
  assertAllowedMailbox,
  createCalendarEventViaGraph,
  GraphServiceError,
  graphJsonRequest,
  sendProjectEmailViaGraph,
  updateCalendarEventViaGraph,
  validateRecipients
} from "./microsoftGraphService.js";

const env = {
  MICROSOFT_TENANT_ID: "tenant",
  MICROSOFT_CLIENT_ID: "client",
  MICROSOFT_CLIENT_SECRET: "secret",
  MICROSOFT_GRAPH_SCOPE: "https://graph.microsoft.com/.default",
  MICROSOFT_SENDER_EMAIL: "sender@example.com",
  MICROSOFT_CALENDAR_OWNER_EMAIL: "calendar@example.com",
  MICROSOFT_ALLOWED_MAILBOXES: "sender@example.com,calendar@example.com",
  MICROSOFT_DEFAULT_TIME_ZONE: "Eastern Standard Time"
};

function response(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body
  };
}

function communication(overrides = {}) {
  return {
    id: "comm_1",
    subject: "Project update",
    bodyText: "Update body",
    toRecipients: [{ email: "client@example.com" }],
    ccRecipients: [{ email: "lead@example.com" }],
    bccRecipients: [{ email: "audit@example.com" }],
    attachmentRefs: [],
    ...overrides
  };
}

function calendarEvent(overrides = {}) {
  return {
    id: "cal_1",
    title: "Project review",
    descriptionText: "Discuss status",
    startDateTime: "2026-07-12T15:00:00",
    endDateTime: "2026-07-12T16:00:00",
    timeZone: "Eastern Standard Time",
    isAllDay: false,
    location: "Teams",
    attendees: [{ email: "client@example.com" }],
    reminderMinutesBeforeStart: 15,
    transactionId: "txn_1",
    calendarOwnerEmail: "calendar@example.com",
    graphEventId: "graph_1"
  };
}

describe("Microsoft Graph project service", () => {
  it("enforces mailbox allowlists and recipient validation", () => {
    expect(assertAllowedMailbox("sender@example.com", env)).toBe("sender@example.com");
    expect(() => assertAllowedMailbox("other@example.com", env)).toThrow(GraphServiceError);
    expect(validateRecipients([{ email: "a@example.com" }])).toEqual([{ email: "a@example.com", name: "" }]);
    expect(() => validateRecipients([{ email: "bad" }])).toThrow(GraphServiceError);
  });

  it("maps sendMail 202 to accepted, not delivered, and supports To CC and BCC", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(202));

    const result = await sendProjectEmailViaGraph({
      communication: communication(),
      env,
      getAccessToken: async () => "token",
      fetchImpl
    });

    expect(result.status).toBe("accepted");
    expect(JSON.stringify(fetchImpl.mock.calls[0][1].body)).toContain("bccRecipients");
    expect(JSON.stringify(result)).not.toContain("delivered");
  });

  it("classifies Graph permission, throttling, server, and timeout failures safely", async () => {
    await expect(graphJsonRequest("/me", { accessToken: "token", fetchImpl: async () => response(403, { error: { code: "Forbidden", message: "denied" } }) }))
      .rejects.toMatchObject({ status: 403, category: "permission", code: "Forbidden" });
    await expect(graphJsonRequest("/me", { accessToken: "token", fetchImpl: async () => response(429, { error: { code: "TooManyRequests", message: "slow down" } }) }))
      .rejects.toMatchObject({ status: 429, category: "throttled" });
    await expect(graphJsonRequest("/me", { accessToken: "token", fetchImpl: async () => response(500, { error: { code: "ServerError", message: "temporary" } }) }))
      .rejects.toMatchObject({ status: 500, category: "temporary" });
    await expect(graphJsonRequest("/me", {
      accessToken: "token",
      timeoutMs: 1,
      fetchImpl: (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))
    })).rejects.toMatchObject({ category: "unknown", code: "graph_timeout" });
  });

  it("rejects Run 2 attachment attempts before calling Graph", async () => {
    const fetchImpl = vi.fn();

    await expect(sendProjectEmailViaGraph({
      communication: communication({ attachmentRefs: [{ id: "future_pdf" }] }),
      env,
      getAccessToken: async () => "token",
      fetchImpl
    })).rejects.toMatchObject({ code: "attachments_not_supported" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("creates and updates calendar events with stable transaction fields", async () => {
    const createFetch = vi.fn().mockResolvedValue(response(201, { id: "graph_1", iCalUId: "ical", webLink: "https://outlook.example/event", changeKey: "ck1" }));
    const created = await createCalendarEventViaGraph({
      calendarEvent: calendarEvent(),
      env,
      getAccessToken: async () => "token",
      fetchImpl: createFetch
    });

    expect(created.status).toBe("scheduled");
    expect(created.graphEventId).toBe("graph_1");
    expect(JSON.stringify(createFetch.mock.calls[0][1].body)).toContain("txn_1");

    const updateFetch = vi.fn().mockResolvedValue(response(200, { id: "graph_1", changeKey: "ck2" }));
    const updated = await updateCalendarEventViaGraph({
      calendarEvent: calendarEvent({ title: "Updated title" }),
      env,
      getAccessToken: async () => "token",
      fetchImpl: updateFetch
    });

    expect(updated.graphEventId).toBe("graph_1");
    expect(updateFetch.mock.calls[0][0]).toContain("/events/graph_1");
  });
});
