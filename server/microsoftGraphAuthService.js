import { validateMicrosoftEmailConfig } from "./microsoftEmailConfig.js";

export async function getMicrosoftGraphAccessToken(env = process.env) {
  const config = validateMicrosoftEmailConfig(env);

  if (!config.configured) {
    throw new Error("Microsoft Graph email configuration is incomplete");
  }

  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(env.MICROSOFT_TENANT_ID)}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    client_secret: env.MICROSOFT_CLIENT_SECRET,
    scope: env.MICROSOFT_GRAPH_SCOPE,
    grant_type: "client_credentials"
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error("Unable to get Microsoft Graph access token");
  }

  return data.access_token;
}
