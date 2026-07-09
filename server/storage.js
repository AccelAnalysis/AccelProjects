import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const dataDir = path.join(__dirname, "data");
export const ordersPath = path.join(dataDir, "orders.json");
export const logsPath = path.join(dataDir, "logs.json");
export const emailLogsPath = path.join(dataDir, "email-logs.json");
export const smsLogsPath = path.join(dataDir, "sms-logs.json");
export const paymentLogsPath = path.join(dataDir, "payment-logs.json");

export async function ensureDataFile(filePath) {
  await mkdir(dataDir, { recursive: true });

  try {
    await readFile(filePath, "utf8");
  } catch {
    await writeFile(filePath, "[]\n");
  }
}

export async function readJson(filePath) {
  await ensureDataFile(filePath);
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw || "[]");
}

export async function writeJson(filePath, data) {
  await ensureDataFile(filePath);
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

export function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function createEmailLogRecord(input) {
  const emailLog = {
    id: makeId("email_log"),
    orderId: input.orderId,
    recipientEmail: input.recipientEmail,
    subject: input.subject,
    bodyPreview: input.bodyPreview,
    provider: input.provider,
    status: input.status,
    errorMessage: input.errorMessage ?? "",
    createdAt: new Date().toISOString()
  };
  const emailLogs = await readJson(emailLogsPath);

  await writeJson(emailLogsPath, [emailLog, ...emailLogs]);
  return emailLog;
}

export async function createSmsLogRecord(input) {
  const smsLog = {
    id: makeId("sms_log"),
    orderId: input.orderId,
    recipientPhone: input.recipientPhone,
    messagePreview: input.messagePreview,
    provider: input.provider,
    status: input.status,
    errorMessage: input.errorMessage ?? "",
    providerMessageId: input.providerMessageId ?? "",
    createdAt: new Date().toISOString()
  };
  const smsLogs = await readJson(smsLogsPath);

  await writeJson(smsLogsPath, [smsLog, ...smsLogs]);
  return smsLog;
}

export async function createPaymentLogRecord(input) {
  const paymentLog = {
    id: makeId("payment_log"),
    orderId: input.orderId,
    provider: input.provider,
    type: input.type,
    status: input.status,
    amount: Number(input.amount ?? 0),
    currency: input.currency ?? "usd",
    stripeCheckoutSessionId: input.stripeCheckoutSessionId ?? null,
    stripePaymentIntentId: input.stripePaymentIntentId ?? null,
    stripeEventId: input.stripeEventId ?? null,
    message: input.message ?? "",
    errorMessage: input.errorMessage ?? "",
    metadata: input.metadata ?? {},
    createdAt: new Date().toISOString()
  };
  const paymentLogs = await readJson(paymentLogsPath);

  await writeJson(paymentLogsPath, [paymentLog, ...paymentLogs]);
  return paymentLog;
}
