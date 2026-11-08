import { foldText } from "./csv";
import { CSV_TEMPLATES, EMAIL_TEMPLATES, type CsvTemplate, type EmailTemplate } from "./templates";

/** Finds the bank template for a statement file (by header row) or an alert email (by sender and subject). */
export class TemplateRegistry {
  constructor(
    private readonly csvTemplates: CsvTemplate[] = CSV_TEMPLATES,
    private readonly emailTemplates: EmailTemplate[] = EMAIL_TEMPLATES,
  ) {}

  detect(headerRow: string[]): CsvTemplate | undefined {
    const cells = headerRow.map(foldText).filter((c, i, all) => c.length > 0 || i < all.length - 1);
    return this.csvTemplates.find(
      (t) => t.headerRow.length === cells.length && t.headerRow.every((h, i) => foldText(h) === cells[i]),
    );
  }

  /** Delimiters used by known templates, for trying candidate header lines. */
  delimiters(): string[] {
    return [...new Set(this.csvTemplates.map((t) => t.delimiter))];
  }

  match(sender: string | undefined, subject: string): EmailTemplate | undefined {
    if (!sender) return undefined;
    const from = sender.toLowerCase();
    return this.emailTemplates.find((t) => t.senders.includes(from) && t.subject.test(subject));
  }

  /** Every bank sender address; the Gmail script searches only for these. */
  senderAllowlist(): string[] {
    return [...new Set(this.emailTemplates.flatMap((t) => t.senders.map((s) => s.toLowerCase())))].sort();
  }

  /** Domains of the allowlisted senders, used for the DKIM check. */
  allowedDomains(): string[] {
    return [...new Set(this.senderAllowlist().map((s) => s.split("@")[1]))];
  }
}
