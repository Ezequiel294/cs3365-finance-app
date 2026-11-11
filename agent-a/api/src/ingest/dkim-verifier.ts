import { dkimVerify } from 'mailauth';

export interface DkimResult {
  signingDomain?: string;
  status?: { result?: string };
}

export type DkimVerifyFn = (raw: Buffer) => Promise<{ results?: DkimResult[] }>;

/**
 * Passes when at least one valid DKIM signature's `d=` equals the template's
 * domain or is a subdomain of it. Other signatures on the same email are ignored.
 */
export class DkimVerifier {
  constructor(private readonly verifyFn: DkimVerifyFn = (raw) => dkimVerify(raw) as unknown as Promise<{ results?: DkimResult[] }>) {}

  async verify(mime: Uint8Array, dkimDomain: string): Promise<boolean> {
    const domain = dkimDomain.toLowerCase();
    let results: DkimResult[] = [];
    try {
      results = (await this.verifyFn(Buffer.from(mime))).results ?? [];
    } catch (err) {
      console.warn(JSON.stringify({ msg: 'DKIM verification error', error: (err as Error).name }));
      return false;
    }
    return results.some((r) => {
      const d = (r.signingDomain ?? '').toLowerCase();
      return r.status?.result === 'pass' && (d === domain || d.endsWith(`.${domain}`));
    });
  }
}
