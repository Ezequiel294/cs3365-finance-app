import type { CsvTemplate } from "./types";

/**
 * PLACEHOLDER TEMPLATE. No real bank statement sample was available when this was written, so it
 * describes a made-up "Example Bank" statement export:
 *
 *   Fecha,Descripción,Referencia,Débito,Crédito,Moneda
 *   14/10/2026,AUTOMERCADO ESCAZU 042,000123,"14,000.00",,CRC
 *   15/10/2026,PAGO CLIENTE ACME,000124,,"1,250.00",USD
 *
 * Replace it with a template built from a redacted real statement (and a golden test) before
 * relying on CSV import. A file whose header row matches no template fails with
 * "no bank template matches this file" instead of being guessed at.
 */
export const exampleBankCsv: CsvTemplate = {
  id: "example-bank-csv-v1",
  bank: "Example Bank (placeholder)",
  placeholder: true,
  numberFormat: "en",
  dateFormat: "dd/MM/yyyy",
  headerRow: ["Fecha", "Descripción", "Referencia", "Débito", "Crédito", "Moneda"],
  encoding: "utf-8",
  delimiter: ",",
  columns: {
    date: "Fecha",
    description: "Descripción",
    reference: "Referencia",
    debit: "Débito",
    credit: "Crédito",
    currency: "Moneda",
  },
  currencySource: "column",
  debitKind: "purchase",
  creditKind: "income",
};
