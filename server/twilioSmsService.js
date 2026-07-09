import { createSmsLogRecord } from "./storage.js";
import { validateTwilioSmsConfig } from "./twilioSmsConfig.js";

function validateSmsInput({ to, message }) {
  const missingFields = [];

  if (!String(to ?? "").trim()) {
    missingFields.push("to");
  }

  if (!String(message ?? "").trim()) {
    missingFields.push("message");
  }

  return missingFields;
}

function isValidE164PhoneNumber(phoneNumber) {
  return /^\+[1-9]\d{7,14}$/.test(String(phoneNumber).trim());
}

async function saveTwilioSmsLog({ to, message, orderId, status, errorMessage = "", providerMessageId = "" }) {
  return createSmsLogRecord({
    orderId: orderId ?? "twilio_sms",
    recipientPhone: to ?? "",
    messagePreview: message ? message.slice(0, 140) : "",
    provider: "twilio",
    status,
    errorMessage,
    providerMessageId
  });
}

async function readTwilioError(response) {
  try {
    const data = await response.json();
    return data.message ?? data.error_message ?? "Twilio SMS request failed";
  } catch {
    return "Twilio SMS request failed";
  }
}

export async function sendTwilioSms({ to, message, orderId, smsConsent }) {
  const missingFields = validateSmsInput({ to, message });

  if (missingFields.length > 0) {
    const errorMessage = `Missing required fields: ${missingFields.join(", ")}`;
    const smsLog = await saveTwilioSmsLog({
      to,
      message,
      orderId,
      status: "failed",
      errorMessage
    });

    return {
      success: false,
      provider: "twilio",
      status: "failed",
      error: errorMessage,
      smsLog
    };
  }

  if (!isValidE164PhoneNumber(to)) {
    const errorMessage = "Recipient phone number must be a valid E.164 phone number";
    const smsLog = await saveTwilioSmsLog({
      to,
      message,
      orderId,
      status: "failed",
      errorMessage
    });

    return {
      success: false,
      provider: "twilio",
      status: "failed",
      error: errorMessage,
      smsLog
    };
  }

  if (!smsConsent) {
    const errorMessage = "SMS consent is false";
    const smsLog = await saveTwilioSmsLog({
      to,
      message,
      orderId,
      status: "skipped",
      errorMessage
    });

    return {
      success: true,
      provider: "twilio",
      status: "skipped",
      message: "Twilio SMS skipped because SMS consent is false",
      smsLog
    };
  }

  try {
    const config = validateTwilioSmsConfig();

    if (!config.configured) {
      throw new Error(`Missing Twilio environment variables: ${config.missing.join(", ")}`);
    }

    const body = new URLSearchParams({
      To: to.trim(),
      From: process.env.TWILIO_FROM_PHONE,
      Body: message
    });
    const credentials = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });

    if (!response.ok) {
      const errorMessage = await readTwilioError(response);
      const smsLog = await saveTwilioSmsLog({
        to,
        message,
        orderId,
        status: "failed",
        errorMessage
      });

      return {
        success: false,
        provider: "twilio",
        status: "failed",
        error: errorMessage,
        smsLog
      };
    }

    const data = await response.json();
    const providerMessageId = data.sid ?? "";
    const smsLog = await saveTwilioSmsLog({
      to,
      message,
      orderId,
      status: "sent",
      providerMessageId
    });

    return {
      success: true,
      provider: "twilio",
      status: "sent",
      providerMessageId,
      message: "Twilio accepted the SMS send request",
      smsLog
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Twilio SMS send failed";
    const smsLog = await saveTwilioSmsLog({
      to,
      message,
      orderId,
      status: "failed",
      errorMessage
    });

    return {
      success: false,
      provider: "twilio",
      status: "failed",
      error: errorMessage,
      smsLog
    };
  }
}
