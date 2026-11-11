import 'server-only';

/** Runtime configuration of the Next.js server. No secrets: the Cognito app client is public. */
export const config = {
  get apiUrl(): string {
    return (process.env.API_URL ?? '').replace(/\/$/, '');
  },
  get region(): string {
    return process.env.COGNITO_REGION ?? 'us-east-2';
  },
  get clientId(): string {
    return process.env.COGNITO_CLIENT_ID ?? '';
  },
  get secureCookies(): boolean {
    return process.env.NODE_ENV === 'production';
  },
};
