import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { extractAddress, rawHeaderLines, splitHeaderBody } from "./mime";

export type TxtResolver = (name: string) => Promise<string[][]>;

interface DkimSignature {
  raw: string; // the full header line, unfolded only by the canonicalizer
  tags: Map<string, string>;
}

/**
 * Verifies DKIM signatures (RFC 6376, rsa-sha256 and ed25519-sha256, simple/relaxed canonicalization)
 * and checks that the signing domain and the From address belong to an allowlisted bank domain.
 */
export class DkimVerifier {
  constructor(private readonly resolver: TxtResolver = resolveTxt) {}

  async verify(mime: string, allowedDomains: string[]): Promise<boolean> {
    const { headerText, body } = splitHeaderBody(mime);
    const lines = rawHeaderLines(headerText);
    const allowed = allowedDomains.map((d) => d.toLowerCase());

    const fromLine = [...lines].reverse().find((l) => /^from\s*:/i.test(l));
    const fromDomain = extractAddress(fromLine?.slice(fromLine.indexOf(":") + 1))?.split("@")[1];
    if (!fromDomain || !allowed.some((d) => sameOrSubdomain(fromDomain, d))) return false;

    const signatures = lines.filter((l) => /^dkim-signature\s*:/i.test(l)).map(parseSignature);
    for (const sig of signatures) {
      const d = sig.tags.get("d")?.toLowerCase();
      if (!d || !(sameOrSubdomain(fromDomain, d) || sameOrSubdomain(d, fromDomain))) continue;
      if (!allowed.some((a) => sameOrSubdomain(a, d) || sameOrSubdomain(d, a))) continue;
      try {
        if (await this.verifySignature(sig, lines, body)) return true;
      } catch {
        // malformed signature or key: try the next signature
      }
    }
    return false;
  }

  private async verifySignature(sig: DkimSignature, lines: string[], body: string): Promise<boolean> {
    const t = sig.tags;
    const algorithm = t.get("a")?.toLowerCase();
    if (t.get("v") !== "1" || (algorithm !== "rsa-sha256" && algorithm !== "ed25519-sha256")) return false;
    const [headerCanon = "simple", bodyCanon = "simple"] = (t.get("c") ?? "simple/simple").toLowerCase().split("/");
    const expires = t.get("x");
    if (expires && Number(expires) * 1000 < Date.now()) return false;

    let canonicalBody = canonicalizeBody(body, bodyCanon);
    const limit = t.get("l");
    if (limit !== undefined) canonicalBody = canonicalBody.slice(0, Number(limit));
    const bodyHash = createHash("sha256").update(canonicalBody, "utf8").digest("base64");
    if (bodyHash !== (t.get("bh") ?? "").replace(/\s+/g, "")) return false;

    const data = signedHeaderData(sig, lines, headerCanon);
    const key = await this.publicKey(t.get("s") ?? "", t.get("d") ?? "");
    if (!key) return false;
    const signature = Buffer.from((t.get("b") ?? "").replace(/\s+/g, ""), "base64");
    if (algorithm === "ed25519-sha256") {
      const digest = createHash("sha256").update(data, "utf8").digest();
      return cryptoVerify(null, digest, key, signature);
    }
    return cryptoVerify("sha256", Buffer.from(data, "utf8"), key, signature);
  }

  private async publicKey(selector: string, domain: string) {
    if (!/^[A-Za-z0-9._-]+$/.test(selector) || !/^[A-Za-z0-9.-]+$/.test(domain)) return undefined;
    const records = await this.resolver(`${selector}._domainkey.${domain}`);
    for (const record of records) {
      const tags = parseTagList(record.join(""));
      const p = tags.get("p");
      if (!p) continue;
      const der = Buffer.from(p.replace(/\s+/g, ""), "base64");
      if ((tags.get("k") ?? "rsa") === "ed25519") {
        // Raw 32-byte key: wrap in SPKI.
        const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), der]);
        return createPublicKey({ key: spki, format: "der", type: "spki" });
      }
      return createPublicKey({ key: der, format: "der", type: "spki" });
    }
    return undefined;
  }
}

function sameOrSubdomain(domain: string, parent: string): boolean {
  return domain === parent || domain.endsWith(`.${parent}`);
}

function parseTagList(value: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const part of value.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    tags.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).replace(/\s+/g, " ").trim());
  }
  return tags;
}

function parseSignature(line: string): DkimSignature {
  return { raw: line, tags: parseTagList(line.slice(line.indexOf(":") + 1)) };
}

export function canonicalizeBody(body: string, mode: string): string {
  let text = body;
  if (mode === "relaxed") {
    text = text
      .split("\r\n")
      .map((l) => l.replace(/[ \t]+/g, " ").replace(/ +$/, ""))
      .join("\r\n");
  }
  text = text.replace(/(\r\n)*$/, "");
  if (text.length === 0) return mode === "relaxed" ? "" : "\r\n";
  return `${text}\r\n`;
}

export function canonicalizeHeader(line: string, mode: string): string {
  if (mode !== "relaxed") return line;
  const colon = line.indexOf(":");
  const name = line.slice(0, colon).trim().toLowerCase();
  const value = line
    .slice(colon + 1)
    .replace(/\r\n/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  return `${name}:${value}`;
}

/** The headers named in `h=` (each instance picked bottom-up), then the signature header with `b=` emptied. */
export function signedHeaderData(sig: DkimSignature | { raw: string; tags: Map<string, string> }, lines: string[], mode: string): string {
  const names = (sig.tags.get("h") ?? "").split(":").map((n) => n.trim().toLowerCase()).filter(Boolean);
  const used = new Set<number>();
  const parts: string[] = [];
  for (const name of names) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (used.has(i)) continue;
      const lineName = lines[i].slice(0, lines[i].indexOf(":")).trim().toLowerCase();
      if (lineName === name) {
        used.add(i);
        parts.push(`${canonicalizeHeader(lines[i], mode)}\r\n`);
        break;
      }
    }
  }
  const unsigned = sig.raw.replace(/(\bb\s*=)[^;]*/i, (_m, prefix: string) => prefix);
  parts.push(canonicalizeHeader(unsigned, mode));
  return parts.join("");
}
