import type { EmailTemplate } from "./types";

/**
 * PLACEHOLDER TEMPLATE. No real bank alert sample was available when this was written, so it
 * describes a made-up "Example Bank" whose alerts come from `alertas@example-bank.test` and look like:
 *
 *   Subject: Notificación de transacción
 *   Se realizó una compra con su tarjeta terminada en 1234.
 *   Comercio: AUTOMERCADO ESCAZU 042
 *   Fecha: 14/10/2026 13:45
 *   Monto: CRC 14,000.00
 *   Autorización: 123456
 *
 * Replace it with a template built from a redacted real alert (and a golden test) before relying on
 * Gmail ingestion. Mail from any other sender is rejected, so this placeholder never matches real mail.
 */
export const exampleBankEmail: EmailTemplate = {
  id: "example-bank-email-v1",
  bank: "Example Bank (placeholder)",
  placeholder: true,
  numberFormat: "en",
  dateFormat: "dd/MM/yyyy",
  senders: ["alertas@example-bank.test"],
  subject: /notificaci[oó]n de transacci[oó]n/i,
  kind: "purchase",
  fieldPatterns: {
    last4: /terminada en\s*(\d{4})/i,
    merchant: /Comercio:\s*([^\n]+)/i,
    date: /Fecha:\s*(\d{2}\/\d{2}\/\d{4})/i,
    time: /Fecha:\s*\d{2}\/\d{2}\/\d{4}\s+(\d{1,2}:\d{2})/i,
    currency: /Monto:\s*(CRC|USD|₡|\$)/i,
    amount: /Monto:\s*(?:CRC|USD|₡|\$)?\s*([\d.,]+)/i,
    reference: /Autorizaci[oó]n:\s*([A-Za-z0-9]+)/i,
  },
  currencyAliases: { CRC: "CRC", "₡": "CRC", COLONES: "CRC", USD: "USD", $: "USD", DOLARES: "USD" },
};
