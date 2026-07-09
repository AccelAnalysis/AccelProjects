import { getMicrosoftGraphAccessToken } from "./microsoftGraphAuthService.js";
import { createEmailLogRecord } from "./storage.js";

function validateEmailInput({ to, subject, body }) {
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

  return missingFields;
}

function isValidEmailAddress(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function makeBodyPreview(body) {
  return body.slice(0, 140);
}

async function saveMicrosoftEmailLog({ to, subject, body, orderId, status, errorMessage = "" }) {
  return createEmailLogRecord({
    orderId: orderId ?? "microsoft_graph_email",
    recipientEmail: to ?? "",
    subject: subject ?? "",
    bodyPreview: body ? makeBodyPreview(body) : "",
    provider: "microsoft_graph",
    status,
    errorMessage
  });
}

async function readGraphError(response) {
  try {
    const data = await response.json();
    return data?.error?.message ?? data?.error_description ?? "Microsoft Graph sendMail request failed";
  } catch {
    return "Microsoft Graph sendMail request failed";
  }
}

export async function sendMicrosoftEmail({ to, subject, body, orderId }) {
  const missingFields = validateEmailInput({ to, subject, body });

  if (missingFields.length > 0) {
    const errorMessage = `Missing required fields: ${missingFields.join(", ")}`;
    const emailLog = await saveMicrosoftEmailLog({
      to,
      subject,
      body,
      orderId,
      status: "failed",
      errorMessage
    });

    return {
      success: false,
      provider: "microsoft_graph",
      error: errorMessage,
      emailLog
    };
  }

  if (!isValidEmailAddress(to)) {
    const errorMessage = "Invalid recipient email address";
    const emailLog = await saveMicrosoftEmailLog({
      to,
      subject,
      body,
      orderId,
      status: "failed",
      errorMessage
    });

    return {
      success: false,
      provider: "microsoft_graph",
      error: errorMessage,
      emailLog
    };
  }

  try {
    const accessToken = await getMicrosoftGraphAccessToken();
    const senderEmail = process.env.MICROSOFT_SENDER_EMAIL;
    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: {
          subject,
          body: {
            contentType: "Text",
            content: body
          },
          toRecipients: [
            {
              emailAddress: {
                address: to
              }
            }
          ]
        },
        saveToSentItems: true
      })
    });

    if (!response.ok) {
      const errorMessage = await readGraphError(response);
      const emailLog = await saveMicrosoftEmailLog({
        to,
        subject,
        body,
        orderId,
        status: "failed",
        errorMessage
      });

      return {
        success: false,
        provider: "microsoft_graph",
        error: errorMessage,
        emailLog
      };
    }

    const emailLog = await saveMicrosoftEmailLog({
      to,
      subject,
      body,
      orderId,
      status: "sent"
    });

    return {
      success: true,
      provider: "microsoft_graph",
      message: "Microsoft Graph accepted the email send request",
      emailLog
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Microsoft Graph email send failed";
    const emailLog = await saveMicrosoftEmailLog({
      to,
      subject,
      body,
      orderId,
      status: "failed",
      errorMessage
    });

    return {
      success: false,
      provider: "microsoft_graph",
      error: errorMessage,
      emailLog
    };
  }
}
