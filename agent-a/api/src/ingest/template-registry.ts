import { CsvReader } from './csv-reader';
import { CSV_TEMPLATES, EMAIL_TEMPLATES, type CsvTemplate, type EmailTemplate } from './templates';

/** Finds the template for a statement file or an alert email. */
export class TemplateRegistry {
  constructor(
    private readonly reader: CsvReader = new CsvReader(),
    private readonly csvTemplates: CsvTemplate[] = CSV_TEMPLATES,
    private readonly emailTemplates: EmailTemplate[] = EMAIL_TEMPLATES,
  ) {}

  /** Tries each CSV template's detection rule against the file's lines. */
  detect(lines: string[]): CsvTemplate | null {
    for (const template of this.csvTemplates) {
      if (this.detects(template, lines)) return template;
    }
    return null;
  }

  private detects(template: CsvTemplate, lines: string[]): boolean {
    if (lines.length === 0) return false;
    const first = this.reader.split(lines[0], template.delimiter).map((f) => this.reader.normalize(f));
    if (template.layout === 'table') {
      if (first.length > 0 && first[first.length - 1] === '') first.pop();
      return first.length === template.header.length && first.every((f, i) => f === template.header[i]);
    }
    const pre = template.preamble!.header;
    const startsRight = pre.every((h, i) => first[i] === h);
    const hasMarker = lines.some((l) => this.reader.normalize(l) === template.detailMarker);
    return startsRight && hasMarker;
  }

  /** The email template for a sender and subject; null when none matches. The sender is compared case-insensitively. */
  match(sender: string, subject: string): EmailTemplate | null {
    const from = sender.trim().toLowerCase();
    return this.emailTemplates.find((t) => t.senders.includes(from) && t.subject.test(subject.trim())) ?? null;
  }

  isAllowedSender(sender: string): boolean {
    return this.senderAllowlist().includes(sender.trim().toLowerCase());
  }

  /** Every email template's senders; the Gmail script searches for these. */
  senderAllowlist(): string[] {
    return [...new Set(this.emailTemplates.flatMap((t) => t.senders))];
  }
}
