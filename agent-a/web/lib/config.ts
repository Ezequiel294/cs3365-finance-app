import "server-only";

/** Server-side settings, read at request time from the Lambda environment (never shipped to the browser). */
export function serverConfig() {
  const apiUrl = process.env.API_URL;
  const clientId = process.env.COGNITO_CLIENT_ID;
  const region = process.env.COGNITO_REGION ?? "us-east-2";
  if (!apiUrl || !clientId) throw new Error("API_URL and COGNITO_CLIENT_ID must be set");
  return { apiUrl: apiUrl.replace(/\/+$/, ""), clientId, region };
}
