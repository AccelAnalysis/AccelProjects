import express from "express";
import "dotenv/config";
import Stripe from "stripe";
import { createFirebaseAuthMiddleware, requireRoles } from "./apiAuth.js";
import { orderReceivedTemplate } from "./emailTemplates.js";
import { getMicrosoftProjectConfig } from "./microsoftGraphService.js";
import { sendMicrosoftEmail } from "./microsoftGraphEmailService.js";
import { getMicrosoftGraphAccessToken } from "./microsoftGraphAuthService.js";
import { validateMicrosoftEmailConfig } from "./microsoftEmailConfig.js";
import { sendEmail } from "./mockEmailService.js";
import { sendSms } from "./mockSmsService.js";
import { requireProjectAccess } from "./projectAuthorization.js";
import { applyLifecycle, LifecycleError, previewLifecycle } from "./lifecycleService.js";
import {
  cancelCalendarEvent,
  createCalendarDraft,
  createCalendarEvent,
  createCommunicationDraft,
  listProjectCommunicationWorkspace,
  sendCommunication,
  updateCalendarEvent
} from "./projectCommunicationService.js";
import {
  approveReport,
  createReportDraft,
  emailReportSnapshot,
  generateReportPdfArtifact,
  listProjectReports,
  submitReportForReview,
  updateReportDraft
} from "./projectReportService.js";
import {
  getPortalMe,
  getPortalProject,
  getPortalReport,
  getPortalReportPdf,
  grantPortalProjectAccess,
  listPortalProjects,
  listPortalReports,
  listPortalUsers,
  previewPortalProjectPublication,
  publishPortalProject,
  publishReportSnapshot,
  requirePortalProjectAccess,
  requirePortalUser,
  revokePortalProjectAccess,
  setPortalUserStatus,
  upsertPortalUser,
  withdrawPortalProject,
  withdrawReportPublication
} from "./clientPortalService.js";
import { orderReceivedSmsTemplate } from "./smsTemplates.js";
import { validateTwilioSmsConfig } from "./twilioSmsConfig.js";
import { sendTwilioSms } from "./twilioSmsService.js";
import {
  createEmailLogRecord,
  createPaymentLogRecord,
  createSmsLogRecord,
  logsPath,
  makeId,
  emailLogsPath,
  ordersPath,
  paymentLogsPath,
  readJson,
  smsLogsPath,
  writeJson
} from "./storage.js";

const allowedStatuses = ["draft", "pending_payment", "paid", "failed"];
const allowedEmailStatuses = ["draft", "sent", "failed", "skipped"];
const allowedSmsStatuses = ["draft", "sent", "failed", "skipped"];
const allowedPaymentStatuses = ["unpaid", "pending", "paid", "failed", "canceled"];

const app = express();
const port = process.env.API_PORT || 5174;
const requireFirebaseAuth = createFirebaseAuthMiddleware();
const requireAdmin = requireRoles(["admin"]);
const requireProjectRead = requireProjectAccess("read");
const requireProjectCommunication = requireProjectAccess("communication");
const requireProjectCalendar = requireProjectAccess("calendar");
const requireClientPortalUser = requirePortalUser();
const requireClientPortalProject = requirePortalProjectAccess();

function getStripeClient() {
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function validateStripeConfig() {
  const required = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "APP_BASE_URL"];
  const missing = required.filter((key) => !process.env[key]);

  return {
    configured: missing.length === 0,
    missing,
    mode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ? "test" : "unknown"
  };
}

function normalizeOrder(order) {
  return {
    paymentProvider: null,
    paymentStatus: "unpaid",
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    paidAt: null,
    ...order
  };
}

async function readOrders() {
  const orders = await readJson(ordersPath);
  return orders.map(normalizeOrder);
}

async function updateOrderById(orderId, updater) {
  const orders = await readOrders();
  const orderIndex = orders.findIndex((order) => order.id === orderId);

  if (orderIndex === -1) {
    return null;
  }

  const updatedOrder = {
    ...updater(orders[orderIndex]),
    updatedAt: new Date().toISOString()
  };

  orders[orderIndex] = updatedOrder;
  await writeJson(ordersPath, orders);
  return updatedOrder;
}

async function processStripeWebhookEvent(event) {
  const existingLogs = await readJson(paymentLogsPath);

  if (existingLogs.some((log) => log.stripeEventId === event.id)) {
    await createPaymentLogRecord({
      orderId: "stripe_webhook",
      provider: "stripe",
      type: event.type,
      status: "skipped",
      amount: 0,
      currency: "usd",
      stripeEventId: event.id,
      message: "Duplicate Stripe webhook event skipped",
      metadata: { eventType: event.type }
    });
    return;
  }

  await createPaymentLogRecord({
    orderId: "stripe_webhook",
    provider: "stripe",
    type: event.type,
    status: "received",
    amount: 0,
    currency: "usd",
    stripeEventId: event.id,
    message: "Stripe webhook event received",
    metadata: { eventType: event.type }
  });

  if (!["checkout.session.completed", "checkout.session.expired", "checkout.session.async_payment_failed"].includes(event.type)) {
    return;
  }

  const session = event.data.object;
  const orderId = session.metadata?.orderId ?? session.client_reference_id;

  if (!orderId) {
    await createPaymentLogRecord({
      orderId: "stripe_webhook",
      provider: "stripe",
      type: event.type,
      status: "failed",
      amount: Number(session.amount_total ?? 0) / 100,
      currency: session.currency ?? "usd",
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      stripeEventId: event.id,
      errorMessage: "Stripe webhook missing orderId",
      metadata: { sessionId: session.id }
    });
    return;
  }

  const paymentStatus = event.type === "checkout.session.completed" ? "paid" : event.type === "checkout.session.expired" ? "canceled" : "failed";
  const orderStatus = paymentStatus === "paid" ? "paid" : paymentStatus === "failed" ? "failed" : "pending_payment";
  const updatedOrder = await updateOrderById(orderId, (order) => ({
    ...order,
    status: orderStatus,
    paymentStatus,
    paymentProvider: "stripe",
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
    paidAt: paymentStatus === "paid" ? new Date().toISOString() : order.paidAt
  }));

  if (!updatedOrder) {
    await createPaymentLogRecord({
      orderId,
      provider: "stripe",
      type: event.type,
      status: "failed",
      amount: Number(session.amount_total ?? 0) / 100,
      currency: session.currency ?? "usd",
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      stripeEventId: event.id,
      errorMessage: "Stripe webhook referenced missing order",
      metadata: { sessionId: session.id }
    });
    return;
  }

  await createPaymentLogRecord({
    orderId,
    provider: "stripe",
    type: event.type,
    status: paymentStatus,
    amount: updatedOrder.amount,
    currency: session.currency ?? "usd",
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: updatedOrder.stripePaymentIntentId,
    stripeEventId: event.id,
    message: `Stripe checkout ${paymentStatus} and order updated`,
    metadata: { sessionId: session.id }
  });
}

app.post("/api/stripe-webhook", express.raw({ type: "application/json" }), async (request, response) => {
  const signature = request.headers["stripe-signature"];

  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("Missing Stripe webhook secret");
    }

    const event = getStripeClient().webhooks.constructEvent(request.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    await processStripeWebhookEvent(event);
    response.json({ received: true });
  } catch (error) {
    await createPaymentLogRecord({
      orderId: "stripe_webhook",
      provider: "stripe",
      type: "webhook_error",
      status: "failed",
      amount: 0,
      currency: "usd",
      errorMessage: error instanceof Error ? error.message : "Stripe webhook verification failed"
    });

    response.status(400).json({
      success: false,
      error: "Stripe webhook verification failed"
    });
  }
});

app.use(express.json());

function requireFields(body, fields) {
  return fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === "");
}

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    message: "Mini Billing Messenger API is running"
  });
});

app.get("/api/email/microsoft-config-check", requireFirebaseAuth, requireAdmin, (_request, response) => {
  const result = validateMicrosoftEmailConfig();

  response.json({
    configured: result.configured,
    senderEmail: process.env.MICROSOFT_SENDER_EMAIL || "",
    authMode: "app_only_client_credentials",
    missing: result.missing
  });
});

app.get("/api/email/microsoft-token-check", requireFirebaseAuth, requireAdmin, async (_request, response) => {
  try {
    await getMicrosoftGraphAccessToken();

    response.json({
      success: true,
      message: "Microsoft Graph access token received"
    });
  } catch {
    response.json({
      success: false,
      error: "Unable to get Microsoft Graph access token"
    });
  }
});

app.get("/api/integrations/microsoft/capabilities", requireFirebaseAuth, requireAdmin, async (_request, response) => {
  const config = getMicrosoftProjectConfig();
  let tokenAvailable = false;

  try {
    await getMicrosoftGraphAccessToken();
    tokenAvailable = true;
  } catch {
    tokenAvailable = false;
  }

  response.json({
    emailConfigured: config.configured,
    calendarConfigured: config.calendarConfigured,
    tokenAvailable,
    mailSendPermissionExpected: true,
    calendarsReadWritePermissionExpected: true,
    senderMailbox: config.senderMailbox,
    calendarOwnerMailbox: config.calendarOwnerEmail,
    missing: config.missing,
    authMode: "app_only_client_credentials"
  });
});

app.get("/api/sms/twilio-config-check", requireFirebaseAuth, requireAdmin, (_request, response) => {
  response.json(validateTwilioSmsConfig());
});

app.get("/api/payments/stripe-config-check", requireFirebaseAuth, requireAdmin, (_request, response) => {
  response.json(validateStripeConfig());
});

app.use("/api", requireFirebaseAuth);

function lifecycleInput(request) {
  return { ...request.body, projectId: request.params.projectId, entityType: request.params.entityType, entityId: request.params.entityId, actor: { id: request.auth.uid, role: request.auth.profile.role } };
}

function lifecycleFailure(response, error) {
  const status = error instanceof LifecycleError ? error.status : 500;
  return response.status(status).json({ success: false, error: error instanceof LifecycleError ? error.code : "lifecycle_operation_failed" });
}

app.post("/api/projects/:projectId/lifecycle/:entityType/:entityId/impact", requireProjectCommunication, async (request, response) => {
  try { return response.json(await previewLifecycle(lifecycleInput(request))); } catch (error) { return lifecycleFailure(response, error); }
});

app.post("/api/projects/:projectId/lifecycle/:entityType/:entityId/actions", requireProjectCommunication, async (request, response) => {
  try { return response.json(await applyLifecycle(lifecycleInput(request))); } catch (error) { return lifecycleFailure(response, error); }
});

app.use("/api/portal", (_request, response, next) => {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Pragma", "no-cache");
  next();
});

app.get("/api/portal/me", requireClientPortalUser, async (request, response) => {
  try {
    response.json(await getPortalMe(request.auth));
  } catch (error) {
    response.status(error.status || 403).json({ success: false, error: error.message || "Client portal access denied", code: error.code || "portal_denied" });
  }
});

app.get("/api/portal/projects", requireClientPortalUser, async (request, response) => {
  try {
    response.json(await listPortalProjects(request.auth));
  } catch (error) {
    response.status(error.status || 403).json({ success: false, error: error.message || "Client portal access denied", code: error.code || "portal_denied" });
  }
});

app.get("/api/portal/projects/:projectId", requireClientPortalProject, async (request, response) => {
  try {
    response.json(await getPortalProject(request.auth, request.params.projectId));
  } catch (error) {
    response.status(error.status || 404).json({ success: false, error: "Portal resource not found", code: error.code || "portal_not_found" });
  }
});

app.get("/api/portal/projects/:projectId/reports", requireClientPortalProject, async (request, response) => {
  try {
    response.json(await listPortalReports(request.auth, request.params.projectId));
  } catch (error) {
    response.status(error.status || 404).json({ success: false, error: "Portal resource not found", code: error.code || "portal_not_found" });
  }
});

app.get("/api/portal/projects/:projectId/reports/:snapshotId", requireClientPortalProject, async (request, response) => {
  try {
    response.json(await getPortalReport(request.auth, request.params.projectId, request.params.snapshotId));
  } catch (error) {
    response.status(error.status || 404).json({ success: false, error: "Portal resource not found", code: error.code || "portal_not_found" });
  }
});

app.get("/api/portal/projects/:projectId/reports/:snapshotId/pdf", requireClientPortalProject, async (request, response) => {
  try {
    const result = await getPortalReportPdf(request.auth, request.params.projectId, request.params.snapshotId);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Pragma", "no-cache");
    response.status(200).send(result.buffer);
  } catch (error) {
    response.status(error.status || 404).json({ success: false, error: "Portal resource not found", code: error.code || "portal_not_found" });
  }
});

app.get("/api/portal-admin/users", requireAdmin, async (request, response) => {
  try {
    response.json(await listPortalUsers(request.auth));
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Portal users could not be loaded", code: error.code || "portal_admin_failed" });
  }
});

app.put("/api/portal-admin/users/:userId", requireAdmin, async (request, response) => {
  try {
    response.json({ portalUser: await upsertPortalUser(request.auth, request.params.userId, request.body) });
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Portal user could not be saved", code: error.code || "portal_user_save_failed" });
  }
});

app.post("/api/portal-admin/users/:userId/status", requireAdmin, async (request, response) => {
  try {
    response.json({ portalUser: await setPortalUserStatus(request.auth, request.params.userId, request.body.status) });
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Portal user status could not be updated", code: error.code || "portal_user_status_failed" });
  }
});

app.put("/api/portal-admin/users/:userId/project-access/:projectId", requireAdmin, async (request, response) => {
  try {
    response.json({ access: await grantPortalProjectAccess(request.auth, request.params.userId, request.params.projectId, request.body) });
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Portal project access could not be granted", code: error.code || "portal_access_failed" });
  }
});

app.post("/api/portal-admin/users/:userId/project-access/:projectId/revoke", requireAdmin, async (request, response) => {
  try {
    response.json({ success: true, access: await revokePortalProjectAccess(request.auth, request.params.userId, request.params.projectId) });
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Portal project access could not be revoked", code: error.code || "portal_access_revoke_failed" });
  }
});

app.get("/api/projects/:projectId/portal-publication/preview", requireProjectCommunication, async (request, response) => {
  try {
    response.json({ preview: await previewPortalProjectPublication(request.auth, request.params.projectId) });
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Portal publication preview failed", code: error.code || "portal_publication_preview_failed" });
  }
});

app.post("/api/projects/:projectId/portal-publication", requireProjectCommunication, async (request, response) => {
  try {
    response.json({ publication: await publishPortalProject(request.auth, request.params.projectId, request.body) });
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Portal project publication failed", code: error.code || "portal_publication_failed" });
  }
});

app.post("/api/projects/:projectId/portal-publication/withdraw", requireProjectCommunication, async (request, response) => {
  try {
    response.json({ publication: await withdrawPortalProject(request.auth, request.params.projectId) });
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Portal project withdrawal failed", code: error.code || "portal_publication_withdraw_failed" });
  }
});

app.post("/api/projects/:projectId/report-publications/:snapshotId", requireProjectCommunication, async (request, response) => {
  try {
    response.json({ publication: await publishReportSnapshot(request.auth, request.params.projectId, request.params.snapshotId) });
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Report publication failed", code: error.code || "report_publication_failed" });
  }
});

app.post("/api/projects/:projectId/report-publications/:snapshotId/withdraw", requireProjectCommunication, async (request, response) => {
  try {
    response.json({ publication: await withdrawReportPublication(request.auth, request.params.projectId, request.params.snapshotId) });
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Report withdrawal failed", code: error.code || "report_publication_withdraw_failed" });
  }
});

app.get("/api/projects/:projectId/communications-workspace", requireProjectRead, async (request, response) => {
  const workspace = await listProjectCommunicationWorkspace(request.params.projectId);
  response.json(workspace);
});

app.get("/api/projects/:projectId/reports", requireProjectRead, async (request, response) => {
  try {
    response.json(await listProjectReports(request.params.projectId));
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Reports could not be loaded" });
  }
});

app.post("/api/projects/:projectId/reports", requireProjectCommunication, async (request, response) => {
  try {
    const report = await createReportDraft(request.params.projectId, request.auth, request.body);
    response.status(201).json(report);
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Report draft could not be created", code: error.code || "report_create_failed" });
  }
});

app.patch("/api/projects/:projectId/reports/:reportId", requireProjectCommunication, async (request, response) => {
  try {
    const report = await updateReportDraft(request.params.projectId, request.params.reportId, request.auth, request.body);
    response.status(200).json(report);
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Report draft could not be updated", code: error.code || "report_update_failed" });
  }
});

app.post("/api/projects/:projectId/reports/:reportId/submit", requireProjectCommunication, async (request, response) => {
  try {
    const report = await submitReportForReview(request.params.projectId, request.params.reportId, request.auth);
    response.status(200).json(report);
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Report could not be submitted", code: error.code || "report_submit_failed" });
  }
});

app.post("/api/projects/:projectId/reports/:reportId/approve", requireProjectCommunication, async (request, response) => {
  try {
    const result = await approveReport(request.params.projectId, request.params.reportId, request.auth);
    response.status(200).json(result);
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Report could not be approved", code: error.code || "report_approve_failed" });
  }
});

app.get("/api/projects/:projectId/reports/:reportId/snapshots/:snapshotId/pdf", requireProjectRead, async (request, response) => {
  try {
    const result = await generateReportPdfArtifact(request.params.projectId, request.params.reportId, request.params.snapshotId, request.auth, "download");
    response.setHeader("Content-Type", result.artifact.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${result.artifact.filename}"`);
    response.setHeader("X-AccelProjects-Artifact-Id", result.artifact.id);
    response.setHeader("X-AccelProjects-Content-SHA256", result.artifact.sha256);
    response.status(200).send(result.buffer);
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Report PDF could not be generated", code: error.code || "report_pdf_failed" });
  }
});

app.post("/api/projects/:projectId/reports/:reportId/snapshots/:snapshotId/email", requireProjectCommunication, async (request, response) => {
  try {
    const result = await emailReportSnapshot(request.params.projectId, request.params.reportId, request.params.snapshotId, request.auth, request.body);
    response.status(200).json(result);
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Report email could not be sent", code: error.code || "report_email_failed" });
  }
});

app.post("/api/projects/:projectId/communications", requireProjectCommunication, async (request, response) => {
  try {
    const communication = await createCommunicationDraft(request.params.projectId, request.auth, request.body);
    response.status(201).json(communication);
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Communication draft could not be created" });
  }
});

app.post("/api/projects/:projectId/communications/:communicationId/send", requireProjectCommunication, async (request, response) => {
  try {
    const result = await sendCommunication(request.params.projectId, request.params.communicationId, request.auth, {
      retryUnknown: Boolean(request.body?.retryUnknownConfirmed)
    });
    response.status(200).json(result);
  } catch (error) {
    response.status(error.status || 400).json({
      success: false,
      error: error.message || "Project email could not be sent",
      code: error.code || "send_failed"
    });
  }
});

app.post("/api/projects/:projectId/calendar-events", requireProjectCalendar, async (request, response) => {
  try {
    const calendarEvent = await createCalendarDraft(request.params.projectId, request.auth, request.body);
    response.status(201).json(calendarEvent);
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Calendar draft could not be created" });
  }
});

app.post("/api/projects/:projectId/calendar-events/:calendarEventId/create", requireProjectCalendar, async (request, response) => {
  try {
    const calendarEvent = await createCalendarEvent(request.params.projectId, request.params.calendarEventId, request.auth);
    response.status(200).json(calendarEvent);
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Calendar event could not be scheduled", code: error.code || "calendar_create_failed" });
  }
});

app.patch("/api/projects/:projectId/calendar-events/:calendarEventId", requireProjectCalendar, async (request, response) => {
  try {
    const calendarEvent = await updateCalendarEvent(request.params.projectId, request.params.calendarEventId, request.auth, request.body);
    response.status(200).json(calendarEvent);
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Calendar event could not be updated", code: error.code || "calendar_update_failed" });
  }
});

app.post("/api/projects/:projectId/calendar-events/:calendarEventId/cancel", requireProjectCalendar, async (request, response) => {
  try {
    const calendarEvent = await cancelCalendarEvent(request.params.projectId, request.params.calendarEventId, request.auth);
    response.status(200).json(calendarEvent);
  } catch (error) {
    response.status(error.status || 400).json({ success: false, error: error.message || "Calendar event could not be canceled", code: error.code || "calendar_cancel_failed" });
  }
});

app.post("/api/orders", async (request, response) => {
  const missingFields = requireFields(request.body, ["customerName", "email", "phone", "service", "amount"]);

  if (missingFields.length > 0) {
    return response.status(400).json({
      success: false,
      error: `Missing required fields: ${missingFields.join(", ")}`
    });
  }

  const amount = Number(request.body.amount);

  if (!Number.isFinite(amount) || amount < 0) {
    return response.status(400).json({
      success: false,
      error: "Amount must be a valid number"
    });
  }

  const now = new Date().toISOString();
  const order = {
    id: makeId("order"),
    customerName: request.body.customerName,
    email: request.body.email,
    phone: request.body.phone,
    service: request.body.service,
    amount,
    smsConsent: Boolean(request.body.smsConsent),
    status: "draft",
    paymentProvider: null,
    paymentStatus: "unpaid",
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    paidAt: null,
    createdAt: now,
    updatedAt: now
  };
  const orders = await readOrders();

  await writeJson(ordersPath, [order, ...orders]);
  response.status(201).json(order);
});

app.get("/api/orders", async (_request, response) => {
  const orders = await readOrders();
  response.json(orders);
});

app.get("/api/orders/:id", async (request, response) => {
  const orders = await readOrders();
  const order = orders.find((currentOrder) => currentOrder.id === request.params.id);

  if (!order) {
    return response.status(404).json({
      success: false,
      error: "Order not found"
    });
  }

  response.json(order);
});

app.patch("/api/orders/:id/status", async (request, response) => {
  const { status } = request.body;

  if (!allowedStatuses.includes(status)) {
    return response.status(400).json({
      success: false,
      error: "Invalid order status"
    });
  }

  const orders = await readOrders();
  const orderIndex = orders.findIndex((order) => order.id === request.params.id);

  if (orderIndex === -1) {
    return response.status(404).json({
      success: false,
      error: "Order not found"
    });
  }

  const updatedOrder = {
    ...orders[orderIndex],
    status,
    updatedAt: new Date().toISOString()
  };

  orders[orderIndex] = updatedOrder;
  await writeJson(ordersPath, orders);
  response.json(updatedOrder);
});

app.post("/api/log-event", async (request, response) => {
  const missingFields = requireFields(request.body, ["type", "message", "orderId"]);

  if (missingFields.length > 0) {
    return response.status(400).json({
      success: false,
      error: `Missing required fields: ${missingFields.join(", ")}`
    });
  }

  const log = {
    id: makeId("log"),
    type: request.body.type,
    message: request.body.message,
    orderId: request.body.orderId,
    metadata: request.body.metadata ?? {},
    createdAt: new Date().toISOString()
  };
  const logs = await readJson(logsPath);

  await writeJson(logsPath, [log, ...logs]);
  response.status(201).json(log);
});

app.get("/api/logs", async (_request, response) => {
  const logs = await readJson(logsPath);
  response.json(logs);
});

app.post("/api/email-logs", async (request, response) => {
  const missingFields = requireFields(request.body, [
    "orderId",
    "recipientEmail",
    "subject",
    "bodyPreview",
    "provider",
    "status"
  ]);

  if (missingFields.length > 0) {
    return response.status(400).json({
      success: false,
      error: `Missing required fields: ${missingFields.join(", ")}`
    });
  }

  if (!allowedEmailStatuses.includes(request.body.status)) {
    return response.status(400).json({
      success: false,
      error: "Invalid email status"
    });
  }

  const emailLog = await createEmailLogRecord({
    orderId: request.body.orderId,
    recipientEmail: request.body.recipientEmail,
    subject: request.body.subject,
    bodyPreview: request.body.bodyPreview,
    provider: request.body.provider,
    status: request.body.status,
    errorMessage: request.body.errorMessage ?? ""
  });

  response.status(201).json(emailLog);
});

app.get("/api/email-logs", async (_request, response) => {
  const emailLogs = await readJson(emailLogsPath);
  response.json(emailLogs);
});

app.get("/api/orders/:id/email-logs", async (request, response) => {
  const emailLogs = await readJson(emailLogsPath);
  response.json(emailLogs.filter((emailLog) => emailLog.orderId === request.params.id));
});

app.post("/api/sms-logs", async (request, response) => {
  const missingFields = requireFields(request.body, [
    "orderId",
    "recipientPhone",
    "messagePreview",
    "provider",
    "status"
  ]);

  if (missingFields.length > 0) {
    return response.status(400).json({
      success: false,
      error: `Missing required fields: ${missingFields.join(", ")}`
    });
  }

  if (!allowedSmsStatuses.includes(request.body.status)) {
    return response.status(400).json({
      success: false,
      error: "Invalid SMS status"
    });
  }

  const smsLog = await createSmsLogRecord({
    orderId: request.body.orderId,
    recipientPhone: request.body.recipientPhone,
    messagePreview: request.body.messagePreview,
    provider: request.body.provider,
    status: request.body.status,
    errorMessage: request.body.errorMessage ?? "",
    providerMessageId: request.body.providerMessageId ?? ""
  });

  response.status(201).json(smsLog);
});

app.get("/api/sms-logs", async (_request, response) => {
  const smsLogs = await readJson(smsLogsPath);
  response.json(smsLogs);
});

app.get("/api/orders/:id/sms-logs", async (request, response) => {
  const smsLogs = await readJson(smsLogsPath);
  response.json(smsLogs.filter((smsLog) => smsLog.orderId === request.params.id));
});

app.post("/api/payment-logs", async (request, response) => {
  const missingFields = requireFields(request.body, ["orderId", "provider", "type", "status", "amount", "currency"]);

  if (missingFields.length > 0) {
    return response.status(400).json({
      success: false,
      error: `Missing required fields: ${missingFields.join(", ")}`
    });
  }

  const paymentLog = await createPaymentLogRecord({
    orderId: request.body.orderId,
    provider: request.body.provider,
    type: request.body.type,
    status: request.body.status,
    amount: request.body.amount,
    currency: request.body.currency,
    stripeCheckoutSessionId: request.body.stripeCheckoutSessionId ?? null,
    stripePaymentIntentId: request.body.stripePaymentIntentId ?? null,
    stripeEventId: request.body.stripeEventId ?? null,
    message: request.body.message ?? "",
    errorMessage: request.body.errorMessage ?? "",
    metadata: request.body.metadata ?? {}
  });

  response.status(201).json(paymentLog);
});

app.get("/api/payment-logs", async (_request, response) => {
  const paymentLogs = await readJson(paymentLogsPath);
  response.json(paymentLogs);
});

app.get("/api/orders/:id/payment-logs", async (request, response) => {
  const paymentLogs = await readJson(paymentLogsPath);
  response.json(paymentLogs.filter((paymentLog) => paymentLog.orderId === request.params.id));
});

async function setMockPaymentStatus(request, response, paymentStatus) {
  if (!allowedPaymentStatuses.includes(paymentStatus)) {
    return response.status(400).json({ success: false, error: "Invalid payment status" });
  }

  const statusMap = {
    pending: "pending_payment",
    paid: "paid",
    failed: "failed"
  };
  const order = await updateOrderById(request.params.id, (currentOrder) => ({
    ...currentOrder,
    status: statusMap[paymentStatus] ?? currentOrder.status,
    paymentStatus,
    paymentProvider: "mock",
    paidAt: paymentStatus === "paid" ? new Date().toISOString() : currentOrder.paidAt
  }));

  if (!order) {
    return response.status(404).json({ success: false, error: "Order not found" });
  }

  const paymentLog = await createPaymentLogRecord({
    orderId: order.id,
    provider: "mock",
    type: `mock_payment_${paymentStatus}`,
    status: paymentStatus,
    amount: order.amount,
    currency: "usd",
    message: `Mock payment marked ${paymentStatus}`
  });

  response.json({ success: true, order, paymentLog });
}

app.post("/api/orders/:id/mock-payment-pending", (request, response) => setMockPaymentStatus(request, response, "pending"));
app.post("/api/orders/:id/mock-payment-paid", (request, response) => setMockPaymentStatus(request, response, "paid"));
app.post("/api/orders/:id/mock-payment-failed", (request, response) => setMockPaymentStatus(request, response, "failed"));

app.post("/api/create-checkout-session", async (request, response) => {
  const missingFields = requireFields(request.body, ["orderId"]);

  if (missingFields.length > 0) {
    return response.status(400).json({ success: false, error: `Missing required fields: ${missingFields.join(", ")}` });
  }

  const orders = await readOrders();
  const order = orders.find((currentOrder) => currentOrder.id === request.body.orderId);

  if (!order) {
    return response.status(404).json({ success: false, error: "Order not found" });
  }

  if (!Number.isFinite(Number(order.amount)) || Number(order.amount) <= 0) {
    await createPaymentLogRecord({
      orderId: order.id,
      provider: "stripe",
      type: "checkout_session_create",
      status: "failed",
      amount: Number(order.amount ?? 0),
      currency: "usd",
      errorMessage: "Invalid amount"
    });
    return response.status(400).json({ success: false, error: "Invalid amount" });
  }

  if (order.paymentStatus === "paid") {
    return response.status(400).json({ success: false, error: "Order is already paid" });
  }

  const config = validateStripeConfig();

  if (!config.configured) {
    await createPaymentLogRecord({
      orderId: order.id,
      provider: "stripe",
      type: "checkout_session_create",
      status: "failed",
      amount: order.amount,
      currency: "usd",
      errorMessage: `Missing Stripe environment variables: ${config.missing.join(", ")}`
    });
    return response.status(400).json({ success: false, error: `Missing Stripe environment variables: ${config.missing.join(", ")}` });
  }

  try {
    const session = await getStripeClient().checkout.sessions.create({
      mode: "payment",
      client_reference_id: order.id,
      metadata: { orderId: order.id },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(Number(order.amount) * 100),
            product_data: { name: order.service }
          }
        }
      ],
      success_url: `${process.env.APP_BASE_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.APP_BASE_URL}/payment-cancel?orderId=${order.id}`
    });

    const updatedOrder = await updateOrderById(order.id, (currentOrder) => ({
      ...currentOrder,
      status: "pending_payment",
      paymentStatus: "pending",
      paymentProvider: "stripe",
      stripeCheckoutSessionId: session.id
    }));

    const paymentLog = await createPaymentLogRecord({
      orderId: order.id,
      provider: "stripe",
      type: "checkout_session_create",
      status: "pending",
      amount: order.amount,
      currency: "usd",
      stripeCheckoutSessionId: session.id,
      message: "Stripe Checkout Session created"
    });

    response.status(201).json({
      success: true,
      checkoutUrl: session.url,
      stripeCheckoutSessionId: session.id,
      order: updatedOrder,
      paymentLog
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Stripe Checkout Session creation failed";
    const paymentLog = await createPaymentLogRecord({
      orderId: order.id,
      provider: "stripe",
      type: "checkout_session_create",
      status: "failed",
      amount: order.amount,
      currency: "usd",
      errorMessage
    });

    response.status(400).json({ success: false, error: errorMessage, paymentLog });
  }
});

app.get("/api/orders/:id/sms-preview/order-received", async (request, response) => {
  const orders = await readOrders();
  const order = orders.find((currentOrder) => currentOrder.id === request.params.id);

  if (!order) {
    return response.status(404).json({
      success: false,
      error: "Order not found"
    });
  }

  response.json({
    orderId: order.id,
    template: "order_received_sms",
    message: orderReceivedSmsTemplate(order)
  });
});

app.get("/api/orders/:id/email-preview/order-received", async (request, response) => {
  const orders = await readOrders();
  const order = orders.find((currentOrder) => currentOrder.id === request.params.id);

  if (!order) {
    return response.status(404).json({
      success: false,
      error: "Order not found"
    });
  }

  response.json({
    orderId: order.id,
    template: "order_received",
    ...orderReceivedTemplate(order)
  });
});

app.post("/api/orders/:id/send-order-received-email/mock", async (request, response) => {
  const orders = await readOrders();
  const order = orders.find((currentOrder) => currentOrder.id === request.params.id);

  if (!order) {
    return response.status(404).json({
      success: false,
      error: "Order not found"
    });
  }

  const email = orderReceivedTemplate(order);
  const result = await sendEmail({
    to: order.email,
    subject: email.subject,
    body: email.body,
    orderId: order.id
  });

  response.status(201).json(result);
});

app.post("/api/orders/:id/send-order-received-email/microsoft", async (request, response) => {
  const orders = await readOrders();
  const order = orders.find((currentOrder) => currentOrder.id === request.params.id);

  if (!order) {
    return response.status(404).json({
      success: false,
      error: "Order not found"
    });
  }

  const email = orderReceivedTemplate(order);

  if (!order.email) {
    const errorMessage = "Order has no email address";
    const emailLog = await createEmailLogRecord({
      orderId: order.id,
      recipientEmail: "",
      subject: email.subject,
      bodyPreview: email.body.slice(0, 140),
      provider: "microsoft_graph",
      status: "failed",
      errorMessage
    });

    return response.status(400).json({
      success: false,
      error: errorMessage,
      emailLog
    });
  }

  const result = await sendMicrosoftEmail({
    to: order.email,
    subject: email.subject,
    body: email.body,
    orderId: order.id
  });

  response.status(result.success ? 201 : 400).json(result);
});

app.post("/api/orders/:id/send-order-received-sms/mock", async (request, response) => {
  const orders = await readOrders();
  const order = orders.find((currentOrder) => currentOrder.id === request.params.id);

  if (!order) {
    return response.status(404).json({
      success: false,
      error: "Order not found."
    });
  }

  const message = orderReceivedSmsTemplate(order);
  const result = await sendSms({
    to: order.phone,
    message,
    orderId: order.id,
    smsConsent: order.smsConsent
  });

  response.status(201).json(result);
});

app.post("/api/orders/:id/send-order-received-sms/twilio", async (request, response) => {
  const orders = await readOrders();
  const order = orders.find((currentOrder) => currentOrder.id === request.params.id);

  if (!order) {
    return response.status(404).json({
      success: false,
      error: "Order not found."
    });
  }

  if (!String(order.phone ?? "").trim()) {
    return response.status(400).json({
      success: false,
      error: "Order has no phone number."
    });
  }

  const message = orderReceivedSmsTemplate(order);
  const result = await sendTwilioSms({
    to: order.phone,
    message,
    orderId: order.id,
    smsConsent: order.smsConsent
  });

  response.status(result.success ? 201 : 400).json(result);
});

app.post("/api/test-email/mock", requireAdmin, async (request, response) => {
  try {
    const result = await sendEmail({
      to: request.body.to,
      subject: request.body.subject,
      body: request.body.body,
      orderId: request.body.orderId
    });

    response.status(201).json(result);
  } catch (error) {
    response.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Mock email send failed"
    });
  }
});

app.post("/api/test-email/microsoft", requireAdmin, async (request, response) => {
  const missingFields = requireFields(request.body, ["to", "subject", "body"]);

  if (missingFields.length > 0) {
    return response.status(400).json({
      success: false,
      error: `Missing required fields: ${missingFields.join(", ")}`
    });
  }

  const result = await sendMicrosoftEmail({
    to: request.body.to,
    subject: request.body.subject,
    body: request.body.body
  });

  response.status(result.success ? 201 : 400).json(result);
});

app.post("/api/test-email/microsoft-failure", requireAdmin, async (_request, response) => {
  const result = await sendMicrosoftEmail({
    to: "not-an-email",
    subject: "Mini Billing Messenger Microsoft 365 Failure Test",
    body: "This intentionally uses an invalid recipient to verify Microsoft email error handling."
  });

  response.status(400).json(result);
});

app.post("/api/test-sms/mock", requireAdmin, async (request, response) => {
  try {
    const result = await sendSms({
      to: request.body.to,
      message: request.body.message,
      orderId: request.body.orderId,
      smsConsent: Boolean(request.body.smsConsent)
    });

    response.status(201).json(result);
  } catch (error) {
    response.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Mock SMS send failed"
    });
  }
});

app.post("/api/test-sms/twilio", requireAdmin, async (request, response) => {
  if (request.body.smsConsent === undefined || request.body.smsConsent === null) {
    const smsLog = await createSmsLogRecord({
      orderId: "twilio_sms",
      recipientPhone: request.body.to ?? "",
      messagePreview: request.body.message ? request.body.message.slice(0, 140) : "",
      provider: "twilio",
      status: "failed",
      errorMessage: "Missing required fields: smsConsent",
      providerMessageId: ""
    });

    return response.status(400).json({
      success: false,
      provider: "twilio",
      status: "failed",
      error: "Missing required fields: smsConsent",
      smsLog
    });
  }

  const result = await sendTwilioSms({
    to: request.body.to,
    message: request.body.message,
    smsConsent: Boolean(request.body.smsConsent)
  });

  response.status(result.success ? 201 : 400).json(result);
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`Mini Billing Messenger API running at http://localhost:${port}`);
  });
}

export { app };
