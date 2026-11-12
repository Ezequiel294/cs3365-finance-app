import { dkimVerify } from 'mailauth';

export interface DkimSignatureResult {
  signingDomain?: string;
  status?: { result?: string };
}

export type DkimVerifyFn = (mime: Buffer) => Promise<{ results?: DkimSignatureResult[] }>;

/**
 * Passes when at least one valid signature's d= equals the template's domain or is a
 * subdomain of it. Other signatures on the same email (e.g. amazonses.com) are ignored.
 */
export class DkimVerifier {
  constructor(private readonly verifyFn: DkimVerifyFn = (mime) => dkimVerify(mime) as never) {}

  async verify(mime: string | Buffer, dkimDomain: string): Promise<boolean> {
    const buf = typeof mime === 'string' ? Buffer.from(mime, 'utf8') : mime;
    let results: DkimSignatureResult[] = [];
    try {
      results = (await this.verifyFn(buf)).results ?? [];
    } catch (e) {
      console.warn(JSON.stringify({ msg: 'dkim verify failed', error: (e as Error).name }));
      return false;
    }
    const domain = dkimDomain.toLowerCase();
    return results.some((r) => {
      const d = (r.signingDomain ?? '').toLowerCase();
      return r.status?.result === 'pass' && (d === domain || d.endsWith(`.${domain}`));
    });
  }
}
