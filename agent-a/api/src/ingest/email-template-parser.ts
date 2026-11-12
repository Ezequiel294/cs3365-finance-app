import { simpleParser } from 'mailparser';
import type { ParsedTransaction } from '../../../shared/types';
import { AmountParser } from './amount-parser';
import { CsvReader } from './csv-reader';
import { DateParser } from './date-parser';
import { HtmlText } from './html-text';
import type { EmailTemplate } from './templates/types';

export class EmailParseError extends Error {
  /** FIELD_MISSING:<field> or UNKNOWN_TYPE:<type>. */
  constructor(readonly reason: string) {
    super(reason);
  }
}

export interface EmailEnvelope {
  messageId: string | null;
  sender: string;
  subject: string;
  html: string;
  date: string | null;
}

/** Message-ID from the raw headers without a full parse (angle brackets removed). */
export function headerMessageId(mime: string): string | null {
  const end = mime.search(/\r?\n\r?\n/);
  const headers = (end >= 0 ? mime.slice(0, end) : mime).replace(/\r?\n[ \t]+/g, ' ');
  const m = /^message-id:\s*<?([^>\r\n]+?)>?\s*$/im.exec(headers);
  return m ? m[1]!.trim() : null;
}

/** Generic alert-email parser; every bank-specific detail comes from the template. */
export class EmailTemplateParser {
  async envelope(mime: string | Buffer): Promise<EmailEnvelope> {
    const mail = await simpleParser(mime, { skipImageLinks: true, skipTextToHtml: true });
    const from = mail.from?.value?.[0]?.address ?? '';
    return {
      messageId: mail.messageId ? mail.messageId.replace(/^<|>$/g, '') : null,
      sender: from,
      subject: mail.subject ?? '',
      html: typeof mail.html === 'string' ? mail.html : '',
      date: mail.date ? mail.date.toISOString() : null,
    };
  }

  async parse(mime: string | Buffer, template: EmailTemplate): Promise<ParsedTransaction> {
    const env = await this.envelope(mime);
    return this.parseHtml(env.html, template);
  }

  /** Run the template's field patterns on the one-line text of the HTML body. */
  parseHtml(html: string, t: EmailTemplate): ParsedTransaction {
    const text = HtmlText.toText(html);
    const need = (name: string, re: RegExp | undefined): RegExpExecArray => {
      const m = re ? re.exec(text) : null;
      if (!m) throw new EmailParseError(`FIELD_MISSING:${name}`);
      return m;
    };

    let typeText: string;
    let merchant: string;
    if (t.fields.typeAndMerchant) {
      const m = need('typeAndMerchant', t.fields.typeAndMerchant);
      typeText = m[1]!;
      merchant = m[2]!.replace(/\s+/g, ' ').trim();
    } else {
      merchant = need('merchant', t.fields.merchant)[1]!.replace(/\s+/g, ' ').trim();
      typeText = need('type', t.fields.type)[1]!;
    }
    const typeKey = CsvReader.normalize(typeText).toUpperCase();
    const kind = t.typeMap[typeKey];
    if (!kind) throw new EmailParseError(`UNKNOWN_TYPE:${typeText.trim()}`);

    const dt = need('dateTime', t.fields.dateTime);
    const month = DateParser.month(dt[1]!);
    if (!month) throw new EmailParseError('FIELD_MISSING:dateTime');
    const hhmm = DateParser.time(Number(dt[4]), Number(dt[5]), t.clock === '12h' ? dt[6] : null);
    const when = DateParser.local(Number(dt[3]), month, Number(dt[2]), hhmm);
    if (!when) throw new EmailParseError('FIELD_MISSING:dateTime');

    const card = need('cardLast4', t.fields.cardLast4)[1]!;
    const authorization = need('authorization', t.fields.authorization)[1]!;
    const reference = need('reference', t.fields.reference)[1]!;
    const amount = need('amount', t.fields.amount);
    const amountMinor = AmountParser.parse(amount[2]);
    if (!amountMinor) throw new EmailParseError('FIELD_MISSING:amount');

    return {
      accountId: null,
      cardLast4: card,
      localDate: when.localDate,
      occurredAt: when.occurredAt,
      direction: kind === 'refund' ? 'in' : 'out',
      kind,
      currency: amount[1] as 'CRC' | 'USD',
      amountMinor,
      merchantRaw: merchant,
      statementRef: reference,
      bankCode: null,
      authorization,
      source: 'gmail',
      sourceRef: null,
      line: null,
    };
  }
}
