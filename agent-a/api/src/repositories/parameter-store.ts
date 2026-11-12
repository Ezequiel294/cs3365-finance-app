import { GetParameterCommand, GetParametersCommand, type SSMClient } from '@aws-sdk/client-ssm';

/** SSM Parameter Store reads. Values are never logged. */
export class ParameterStore {
  constructor(private readonly ssm: SSMClient) {}

  /** Reads `<prefix><name>` for each name, decrypting SecureStrings. Keys of the map are the names. */
  async getParameters(prefix: string, names: string[]): Promise<Map<string, string>> {
    const base = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const out = await this.ssm.send(
      new GetParametersCommand({ Names: names.map((n) => `${base}${n}`), WithDecryption: true }),
    );
    const map = new Map<string, string>();
    for (const p of out.Parameters ?? []) {
      if (p.Name && p.Value !== undefined) map.set(p.Name.slice(base.length), p.Value);
    }
    return map;
  }

  /** One parameter, or undefined when it does not exist. */
  async getOptional(name: string): Promise<string | undefined> {
    try {
      const out = await this.ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
      return out.Parameter?.Value ?? undefined;
    } catch (e) {
      if ((e as { name?: string }).name === 'ParameterNotFound') return undefined;
      throw e;
    }
  }
}
