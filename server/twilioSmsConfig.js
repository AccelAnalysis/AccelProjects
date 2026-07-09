export const twilioSmsEnvVars = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_FROM_PHONE"
];

export function validateTwilioSmsConfig(env = process.env) {
  const missing = twilioSmsEnvVars.filter((key) => !env[key]);

  return {
    success: missing.length === 0,
    configured: missing.length === 0,
    missing
  };
}
