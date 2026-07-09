import { createEmailLogRecord, makeId } from "./storage.js";

export async function sendEmail({ to, subject, body, orderId }) {
  const missingFields = [];

  if (!to) {
    missingFields.push("to");
  }

  if (!subject) {
    missingFields.push("subject");
  }

  if (!body) {
    missingFields.push("body");
  }

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
  }

  const emailLog = await createEmailLogRecord({
    orderId: orderId ?? "mock_email_test",
    recipientEmail: to,
    subject,
    bodyPreview: body.slice(0, 140),
    provider: "mock",
    status: "sent",
    errorMessage: ""
  });

  return {
    success: true,
    provider: "mock",
    messageId: makeId("mock_message"),
    emailLog,
    message: "Mock email send completed successfully"
  };
}
