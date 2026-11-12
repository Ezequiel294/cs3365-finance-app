/** Shared CSV rules (bank-formats.md section 1). */
export const CsvReader = {
  /** UTF-8 (fatal) first, then Windows-1252; strip a BOM; split lines on \r?\n. */
  decode(bytes: Uint8Array): string[] {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder('windows-1252').decode(bytes);
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    return text.split(/\r?\n/);
  },

  /** Split on the delimiter and trim every field. A trailing empty field (line ends with the delimiter) is dropped. */
  split(line: string, delimiter: string): string[] {
    const fields = line.split(delimiter).map((f) => f.trim());
    if (fields.length > 1 && line.trimEnd().endsWith(delimiter) && fields[fields.length - 1] === '') {
      fields.pop();
    }
    return fields;
  },

  /** For comparing headers and markers only: trim, NFD, remove accents, lower-case. */
  normalize(text: string): string {
    return text
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  },
};
