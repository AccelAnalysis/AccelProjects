export const microsoftEmailEnvVars = [
  "MICROSOFT_TENANT_ID",
  "MICROSOFT_CLIENT_ID",
  "MICROSOFT_CLIENT_SECRET",
  "MICROSOFT_SENDER_EMAIL",
  "MICROSOFT_GRAPH_SCOPE"
];

export function validateMicrosoftEmailConfig(env = process.env) {
  const missing = microsoftEmailEnvVars.filter((key) => !env[key]);

  return {
    success: missing.length === 0,
    configured: missing.length === 0,
    missing
  };
}
