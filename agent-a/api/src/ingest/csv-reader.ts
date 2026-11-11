/** Decoding and splitting of statement files (bank-formats.md section 1). */
export class CsvReader {
  /** UTF-8 (fatal), falling back to Windows-1252. Strips a BOM and splits on `\r?\n`. */
  decode(bytes: Uint8Array): string[] {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('windows-1252').decode(bytes);
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const lines = text.split(/\r?\n/);
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  /** Splits on the delimiter and trims every field. No quoting in either bank's format. */
  split(line: string, delimiter: string): string[] {
    return line.split(delimiter).map((f) => f.trim());
  }

  /** Only for comparing headers and markers: trim, NFD, remove accents, lower-case. */
  normalize(text: string): string {
    return text
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
