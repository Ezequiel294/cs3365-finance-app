import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

/**
 * Reads configuration from SSM Parameter Store, decrypting SecureStrings.
 * Uses `GetParameters` with explicit names (the Lambda role is granted
 * `ssm:GetParameter(s)` only). Values are never logged.
 */
export class ParameterStore {
  constructor(private readonly ssm: SSMClient) {}

  /** Reads `<prefix>/<name>` for each name. Missing parameters are absent from the map. */
  async getParameters(prefix: string, names: string[]): Promise<Map<string, string>> {
    const fullNames = names.map((n) => `${prefix.replace(/\/$/, '')}/${n}`);
    const out = await this.ssm.send(new GetParametersCommand({ Names: fullNames, WithDecryption: true }));
    const result = new Map<string, string>();
    for (const p of out.Parameters ?? []) {
      if (!p.Name || p.Value === undefined) continue;
      result.set(p.Name.slice(p.Name.lastIndexOf('/') + 1), p.Value);
    }
    return result;
  }

  /** Reads one parameter by full name; undefined when it does not exist. */
  async getOptional(name: string): Promise<string | undefined> {
    const out = await this.ssm.send(new GetParametersCommand({ Names: [name], WithDecryption: true }));
    return out.Parameters?.[0]?.Value;
  }
}
