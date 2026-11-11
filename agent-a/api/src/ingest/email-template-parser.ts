import { defaultDirection, type Currency } from '@finance/shared';
import { simpleParser, type ParsedMail } from 'mailparser';
import { AmountParser } from './amount-parser';
import { DateParser } from './date-parser';
import { HtmlText } from './html-text';
import type { ParsedTransaction } from './parsed-transaction';
import type { EmailTemplate } from './templates';

/** An alert email turned into a transaction, before its card is resolved to an account. */
export type ParsedEmail = Omit<ParsedTransaction, 'accountId'> & { cardLast4: string };

export interface MailHeaders {
  from: string;
  subject: string;
  messageId: string | null;
  html: string;
}

/** The email could not be read: reason is `FIELD_MISSING:<field>` or `UNKNOWN_TYPE:<type>`. */
export class EmailParseError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'EmailParseError';
  }
}

const REQUIRED = new Set(['merchant', 'typeAndMerchant', 'dateTime', 'cardLast4', 'type', 'amount']);

function stripAccentsUpper(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

/** Generic interpreter of declarative email templates. */
export class EmailTemplateParser {
  /** Parses raw MIME with `mailparser` (RFC 2047 subjects, base64 bodies, nested multiparts). */
  static async readMail(mime: Uint8Array | Buffer): Promise<{ mail: ParsedMail; headers: MailHeaders }> {
    const mail = await simpleParser(Buffer.from(mime), { skipImageLinks: true, skipTextToHtml: false });
    const from = mail.from?.value?.[0]?.address ?? '';
    const html = typeof mail.html === 'string' ? mail.html : mail.textAsHtml ?? mail.text ?? '';
    return {
      mail,
      headers: { from, subject: mail.subject ?? '', messageId: mail.messageId ?? null, html },
    };
  }

  async parse(mime: Uint8Array | Buffer | ParsedMail, template: EmailTemplate): Promise<ParsedEmail> {
    let html: string;
    if (mime instanceof Uint8Array) {
      html = (await EmailTemplateParser.readMail(mime)).headers.html;
    } else {
      const mail = mime as ParsedMail;
      html = typeof mail.html === 'string' ? mail.html : mail.textAsHtml ?? mail.text ?? '';
    }
    return this.parseText(HtmlText.toText(html), template);
  }

  /** Runs the template's field patterns on the email's one-line text. */
  parseText(text: string, template: EmailTemplate): ParsedEmail {
    const found: Record<string, RegExpExecArray> = {};
    for (const [field, pattern] of Object.entries(template.fields)) {
      const m = pattern.exec(text);
      if (m) found[field] = m;
      else if (REQUIRED.has(field)) throw new EmailParseError(`FIELD_MISSING:${field}`);
    }

    let typeText: string;
    let merchantRaw: string;
    if (found.typeAndMerchant) {
      typeText = found.typeAndMerchant[1];
      merchantRaw = found.typeAndMerchant[2].replace(/\s+/g, ' ').trim();
    } else {
      typeText = found.type[1];
      merchantRaw = found.merchant[1].replace(/\s+/g, ' ').trim();
    }
    const typeKey = stripAccentsUpper(typeText);
    const kind = template.typeMap[typeKey];
    if (!kind) throw new EmailParseError(`UNKNOWN_TYPE:${typeKey}`);

    const dt = found.dateTime;
    const month = DateParser.month(dt[1]);
    const localDate = month ? DateParser.ymd(Number(dt[3]), month, Number(dt[2])) : null;
    if (!localDate) throw new EmailParseError('FIELD_MISSING:dateTime');
    const time = DateParser.time(Number(dt[4]), Number(dt[5]), template.clock === '12h' ? `${dt[6]}.m.` : null);
    if (!time) throw new EmailParseError('FIELD_MISSING:dateTime');

    const currency = found.amount[1] as Currency;
    const amountMinor = AmountParser.parse(found.amount[2]);
    if (!amountMinor) throw new EmailParseError('FIELD_MISSING:amount');

    return {
      cardLast4: found.cardLast4[1],
      localDate,
      occurredAt: DateParser.occurredAt(localDate, time),
      direction: defaultDirection(kind),
      kind,
      currency,
      amountMinor,
      merchantRaw,
      statementRef: found.reference?.[1] ?? null,
      authorization: found.authorization?.[1] ?? null,
      source: 'gmail',
    };
  }
}
