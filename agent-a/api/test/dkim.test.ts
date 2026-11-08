import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalizeBody, DkimVerifier, signedHeaderData } from "../src/ingest/dkim-verifier";
import { rawHeaderLines, splitHeaderBody } from "../src/ingest/mime";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicDer = publicKey.export({ format: "der", type: "spki" }).toString("base64");

/** Signs a synthetic message the way a bank's mail server would (relaxed/relaxed, rsa-sha256). */
function signMessage(headers: string[], body: string, domain = "example-bank.test"): string {
  const canonicalBody = canonicalizeBody(body, "relaxed");
  const bh = createHash("sha256").update(canonicalBody).digest("base64");
  const unsigned = `DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=${domain}; s=sel1; h=from:subject:date; bh=${bh}; b=`;
  const lines = rawHeaderLines(headers.join("\r\n"));
  const tags = new Map(
    unsigned
      .slice(unsigned.indexOf(":") + 1)
      .split(";")
      .map((p) => p.trim().split("=", 2) as [string, string])
      .filter((p) => p[0]),
  );
  const data = signedHeaderData({ raw: unsigned, tags }, lines, "relaxed");
  const b = sign("sha256", Buffer.from(data), privateKey).toString("base64");
  return [`${unsigned}${b}`, ...headers].join("\r\n") + "\r\n\r\n" + body;
}

const headers = ["From: Example Bank <alertas@example-bank.test>", "Subject: Notificacion de transaccion", "Date: Wed, 14 Oct 2026 13:45:10 -0600"];
const body = "Monto: CRC 14,000.00\r\nComercio: AUTOMERCADO\r\n";
const resolver = async (name: string) => (name === "sel1._domainkey.example-bank.test" ? [[`v=DKIM1; k=rsa; p=${publicDer}`]] : []);

describe("DkimVerifier", () => {
  const verifier = new DkimVerifier(resolver);

  it("accepts a correctly signed email from an allowlisted domain", async () => {
    expect(await verifier.verify(signMessage(headers, body), ["example-bank.test"])).toBe(true);
  });

  it("accepts the same message with LF line endings (as some exports deliver it)", async () => {
    expect(await verifier.verify(signMessage(headers, body).replace(/\r\n/g, "\n"), ["example-bank.test"])).toBe(true);
  });

  it("rejects a tampered body", async () => {
    const tampered = signMessage(headers, body).replace("14,000.00", "1,000.00");
    expect(await verifier.verify(tampered, ["example-bank.test"])).toBe(false);
  });

  it("rejects a tampered signed header", async () => {
    const tampered = signMessage(headers, body).replace("Subject: Notificacion", "Subject: Changed");
    expect(await verifier.verify(tampered, ["example-bank.test"])).toBe(false);
  });

  it("rejects mail whose From domain is not allowlisted, and unsigned mail", async () => {
    expect(await verifier.verify(signMessage(headers, body), ["other-bank.test"])).toBe(false);
    expect(await verifier.verify(headers.join("\r\n") + "\r\n\r\n" + body, ["example-bank.test"])).toBe(false);
  });

  it("splits headers and body at the first blank line", () => {
    expect(splitHeaderBody("A: 1\nB: 2\n\nbody")).toEqual({ headerText: "A: 1\r\nB: 2", body: "body" });
  });
});
