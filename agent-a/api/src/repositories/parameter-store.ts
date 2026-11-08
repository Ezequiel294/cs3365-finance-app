import { GetParameterCommand, GetParametersCommand, type SSMClient } from "@aws-sdk/client-ssm";

/** Reads configuration from SSM Parameter Store. Values are returned to the caller and never logged. */
export class ParameterStore {
  constructor(private readonly ssm: SSMClient) {}

  /**
   * Reads `<prefix>/<name>` for each name with one GetParameters call (SecureStrings decrypted).
   * Throws if any parameter is missing.
   */
  async getParameters(prefix: string, names: string[]): Promise<Map<string, string>> {
    const fullNames = names.map((n) => `${prefix}/${n}`);
    const out = await this.ssm.send(new GetParametersCommand({ Names: fullNames, WithDecryption: true }));
    if (out.InvalidParameters && out.InvalidParameters.length > 0) {
      throw new Error(`Missing SSM parameters: ${out.InvalidParameters.join(", ")}`);
    }
    const values = new Map<string, string>();
    for (const p of out.Parameters ?? []) {
      if (p.Name && p.Value !== undefined) values.set(p.Name.slice(prefix.length + 1), p.Value);
    }
    return values;
  }

  /** Reads one parameter; returns undefined when it does not exist. */
  async getOptional(name: string): Promise<string | undefined> {
    try {
      const out = await this.ssm.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
      return out.Parameter?.Value;
    } catch (error) {
      if ((error as { name?: string })?.name === "ParameterNotFound") return undefined;
      throw error;
    }
  }
}
