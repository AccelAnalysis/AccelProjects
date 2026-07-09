import { createSmsLogRecord, makeId } from "./storage.js";

export async function sendSms({ to, message, orderId, smsConsent }) {
  const missingFields = [];

  if (!to) {
    missingFields.push("to");
  }

  if (!message) {
    missingFields.push("message");
  }

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
  }

  const status = smsConsent ? "sent" : "skipped";
  const smsLog = await createSmsLogRecord({
    orderId: orderId ?? "mock_sms_test",
    recipientPhone: to,
    messagePreview: message.slice(0, 140),
    provider: "mock",
    status,
    errorMessage: "",
    providerMessageId: smsConsent ? makeId("mock_sms") : ""
  });

  return {
    success: true,
    provider: "mock",
    status,
    providerMessageId: smsLog.providerMessageId,
    smsLog,
    message: smsConsent ? "Mock SMS send completed successfully" : "Mock SMS skipped because SMS consent is false"
  };
}
