/**
 * A small MIME reader for bank alert emails: headers, multipart bodies, base64 and
 * quoted-printable, charsets, and RFC 2047 encoded words. It extracts the readable text of the
 * message (text/plain preferred, otherwise text/html with tags removed).
 */
export interface ParsedMime {
  headers: Map<string, string[]>;
  from?: string;
  fromAddress?: string;
  subject: string;
  messageId?: string;
  date?: Date;
  text: string;
}

interface Part {
  headers: Map<string, string[]>;
  body: string; // still transfer-encoded, as binary string
}

export function normalizeLineEndings(raw: string): string {
  return raw.replace(/\r?\n/g, "\r\n");
}

export function splitHeaderBody(raw: string): { headerText: string; body: string } {
  const text = normalizeLineEndings(raw);
  const idx = text.indexOf("\r\n\r\n");
  if (idx === -1) return { headerText: text, body: "" };
  return { headerText: text.slice(0, idx), body: text.slice(idx + 4) };
}

/** Header lines with continuation lines kept attached, in original order. */
export function rawHeaderLines(headerText: string): string[] {
  const lines: string[] = [];
  for (const line of headerText.split("\r\n")) {
    if (/^[ \t]/.test(line) && lines.length > 0) lines[lines.length - 1] += `\r\n${line}`;
    else if (line.length > 0) lines.push(line);
  }
  return lines;
}

function parseHeaders(headerText: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const line of rawHeaderLines(headerText)) {
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).replace(/\r\n[ \t]+/g, " ").trim();
    map.set(name, [...(map.get(name) ?? []), value]);
  }
  return map;
}

function header(headers: Map<string, string[]>, name: string): string | undefined {
  return headers.get(name)?.[0];
}

function headerParam(value: string | undefined, param: string): string | undefined {
  if (!value) return undefined;
  const m = new RegExp(`${param}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, "i").exec(value);
  return m ? (m[1] ?? m[2]) : undefined;
}

function decodeCharset(bytes: Uint8Array, charset: string | undefined): string {
  const label = (charset ?? "utf-8").toLowerCase();
  try {
    return new TextDecoder(label === "iso-8859-1" || label === "latin1" ? "windows-1252" : label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function binaryToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function decodeQuotedPrintable(s: string): Uint8Array {
  const cleaned = s.replace(/=\r\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(cleaned.slice(i + 1, i + 3))) {
      bytes.push(parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = cleaned.charCodeAt(i);
      if (code < 256) bytes.push(code);
      else bytes.push(...new TextEncoder().encode(ch));
    }
  }
  return new Uint8Array(bytes);
}

function decodeTransfer(body: string, encoding: string | undefined): Uint8Array {
  switch ((encoding ?? "").toLowerCase()) {
    case "base64":
      return new Uint8Array(Buffer.from(body.replace(/\s+/g, ""), "base64"));
    case "quoted-printable":
      return decodeQuotedPrintable(body);
    default:
      return new TextEncoder().encode(body);
  }
}

/** Decodes RFC 2047 encoded words such as `=?UTF-8?B?...?=` and `=?ISO-8859-1?Q?...?=`. */
export function decodeEncodedWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=(\s+(?==\?))?/g, (_m, charset: string, enc: string, text: string) => {
    const bytes =
      enc.toUpperCase() === "B"
        ? new Uint8Array(Buffer.from(text, "base64"))
        : decodeQuotedPrintable(text.replace(/_/g, " "));
    return decodeCharset(bytes, charset);
  });
}

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", ntilde: "ñ",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú", Ntilde: "Ñ", uuml: "ü", colon: ":",
};

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n: string) => ENTITIES[n] ?? m)
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parsePart(raw: string): Part {
  const { headerText, body } = splitHeaderBody(raw);
  return { headers: parseHeaders(headerText), body };
}

function collectTextParts(part: Part, out: { plain?: string; html?: string }, depth = 0): void {
  const contentType = header(part.headers, "content-type") ?? "text/plain";
  const type = contentType.split(";")[0].trim().toLowerCase();
  if (type.startsWith("multipart/") && depth < 8) {
    const boundary = headerParam(contentType, "boundary");
    if (!boundary) return;
    const pieces = part.body.split(`--${boundary}`);
    for (const piece of pieces.slice(1)) {
      if (piece.startsWith("--")) break;
      collectTextParts(parsePart(piece.replace(/^\r\n/, "")), out, depth + 1);
    }
    return;
  }
  if (type !== "text/plain" && type !== "text/html") return;
  const disposition = header(part.headers, "content-disposition") ?? "";
  if (/attachment/i.test(disposition)) return;
  const bytes = decodeTransfer(part.body, header(part.headers, "content-transfer-encoding"));
  const text = decodeCharset(bytes, headerParam(contentType, "charset"));
  if (type === "text/plain" && out.plain === undefined) out.plain = text;
  if (type === "text/html" && out.html === undefined) out.html = text;
}

export function extractAddress(from: string | undefined): string | undefined {
  if (!from) return undefined;
  const angle = /<([^>]+)>/.exec(from);
  const candidate = (angle ? angle[1] : from).trim();
  const m = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(candidate);
  return m ? m[0].toLowerCase() : undefined;
}

export function parseMime(raw: string): ParsedMime {
  const root = parsePart(raw);
  const out: { plain?: string; html?: string } = {};
  collectTextParts(root, out);
  const text = out.plain?.trim() ? out.plain.replace(/\r\n/g, "\n").trim() : out.html ? htmlToText(out.html) : "";
  const from = header(root.headers, "from");
  const dateHeader = header(root.headers, "date");
  const date = dateHeader ? new Date(dateHeader) : undefined;
  const messageId = header(root.headers, "message-id")?.replace(/^<|>$/g, "").trim();
  return {
    headers: root.headers,
    from: from ? decodeEncodedWords(from) : undefined,
    fromAddress: extractAddress(from),
    subject: decodeEncodedWords(header(root.headers, "subject") ?? ""),
    messageId: messageId || undefined,
    date: date && !Number.isNaN(date.getTime()) ? date : undefined,
    text,
  };
}
