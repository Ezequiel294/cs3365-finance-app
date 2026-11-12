import { CsvReader } from './csv-reader';
import { CSV_TEMPLATES, EMAIL_TEMPLATES } from './templates';
import type { CsvTemplate, EmailTemplate } from './templates/types';

/** Picks the template for a statement file or an alert email. */
export class TemplateRegistry {
  constructor(
    private readonly csvTemplates: CsvTemplate[] = CSV_TEMPLATES,
    private readonly emailTemplates: EmailTemplate[] = EMAIL_TEMPLATES,
  ) {}

  /** Try each CSV template's detection rule against the file's lines. */
  detect(lines: string[]): CsvTemplate | null {
    const first = lines[0] ?? '';
    for (const t of this.csvTemplates) {
      const fields = CsvReader.split(first, t.delimiter).map(CsvReader.normalize);
      if (t.layout === 'table') {
        if (fields.length === t.header.length && t.header.every((h, i) => fields[i] === h)) return t;
      } else if (t.preamble && t.detailMarker) {
        const head = t.preamble.header;
        const prefixOk = head.every((h, i) => fields[i] === h);
        const marker = t.detailMarker;
        if (prefixOk && lines.some((l) => CsvReader.normalize(l) === marker)) return t;
      }
    }
    return null;
  }

  /** The email template for a sender (case-insensitive) and subject, or null. */
  match(sender: string, subject: string): EmailTemplate | null {
    const from = sender.trim().toLowerCase();
    return (
      this.emailTemplates.find(
        (t) => t.senders.some((s) => s.toLowerCase() === from) && t.subject.test(subject.trim()),
      ) ?? null
    );
  }

  /** Every alert sender the Gmail script should forward. */
  senderAllowlist(): string[] {
    return [...new Set(this.emailTemplates.flatMap((t) => t.senders.map((s) => s.toLowerCase())))];
  }
}
