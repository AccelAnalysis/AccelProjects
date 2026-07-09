import express from "express";
import "dotenv/config";
import Stripe from "stripe";
import { orderReceivedTemplate } from "./emailTemplates.js";
import { sendMicrosoftEmail } from "./microsoftGraphEmailService.js";
import { getMicrosoftGraphAccessToken } from "./microsoftGraphAuthService.js";
import { validateMicrosoftEmailConfig } from "./microsoftEmailConfig.js";
import { sendEmail } from "./mockEmailService.js";
import { sendSms } from "./mockSmsService.js";
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

app.get("/api/email/microsoft-config-check", (_request, response) => {
  const result = validateMicrosoftEmailConfig();

  response.json({
    configured: result.configured,
    senderEmail: process.env.MICROSOFT_SENDER_EMAIL || "",
    authMode: "app_only_client_credentials",
    missing: result.missing
  });
});

app.get("/api/email/microsoft-token-check", async (_request, response) => {
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

app.get("/api/sms/twilio-config-check", (_request, response) => {
  response.json(validateTwilioSmsConfig());
});

app.get("/api/payments/stripe-config-check", (_request, response) => {
  response.json(validateStripeConfig());
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

app.post("/api/test-email/mock", async (request, response) => {
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

app.post("/api/test-email/microsoft", async (request, response) => {
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

app.post("/api/test-email/microsoft-failure", async (_request, response) => {
  const result = await sendMicrosoftEmail({
    to: "not-an-email",
    subject: "Mini Billing Messenger Microsoft 365 Failure Test",
    body: "This intentionally uses an invalid recipient to verify Microsoft email error handling."
  });

  response.status(400).json(result);
});

app.post("/api/test-sms/mock", async (request, response) => {
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

app.post("/api/test-sms/twilio", async (request, response) => {
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

app.listen(port, () => {
  console.log(`Mini Billing Messenger API running at http://localhost:${port}`);
});
