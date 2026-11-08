import type { DateFormat, NumberFormat } from "./templates/types";

/**
 * Parses a bank-formatted amount into integer minor units, without floating point.
 * Returns the absolute value and whether it was negative ("-1,234.56" or "(1,234.56)").
 */
export function parseAmount(text: string, format: NumberFormat): { minor: number; negative: boolean } | null {
  let s = text.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d.,-]/g, "");
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1);
  }
  const thousands = format === "en" ? "," : ".";
  const decimal = format === "en" ? "." : ",";
  s = s.split(thousands).join("");
  const parts = s.split(decimal);
  if (parts.length > 2) return null;
  const [whole, frac = ""] = parts;
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(frac)) return null;
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(minor)) return null;
  return { minor, negative };
}

/** Parses a bank-formatted date into `yyyy-mm-dd`. */
export function parseDate(text: string, format: DateFormat): string | null {
  const s = text.trim();
  let m: RegExpExecArray | null;
  let y: string, mo: string, d: string;
  switch (format) {
    case "dd/MM/yyyy":
      m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
      if (!m) return null;
      [d, mo, y] = [m[1], m[2], m[3]];
      break;
    case "dd-MM-yyyy":
      m = /^(\d{1,2})-(\d{1,2})-(\d{4})/.exec(s);
      if (!m) return null;
      [d, mo, y] = [m[1], m[2], m[3]];
      break;
    case "MM/dd/yyyy":
      m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
      if (!m) return null;
      [mo, d, y] = [m[1], m[2], m[3]];
      break;
    case "yyyy-MM-dd":
      m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
      if (!m) return null;
      [y, mo, d] = [m[1], m[2], m[3]];
      break;
  }
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const check = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.toISOString().slice(0, 10) !== iso) return null;
  return iso;
}
