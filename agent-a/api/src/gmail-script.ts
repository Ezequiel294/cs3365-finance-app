import script from '../../gmail-script/Code.gs';

/** The Gmail Apps Script with this API's base URL filled in. The token is never part of it. */
export function renderGmailScript(apiBase: string): string {
  return script.replace('__API_BASE__', apiBase.replace(/\/$/, ''));
}
