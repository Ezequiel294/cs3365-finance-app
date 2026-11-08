import { exampleBankCsv } from "./example-bank-csv";
import { exampleBankEmail } from "./example-bank-email";
import type { CsvTemplate, EmailTemplate } from "./types";

/** Every bank template the product knows. Add new banks here, each with a golden test. */
export const CSV_TEMPLATES: CsvTemplate[] = [exampleBankCsv];
export const EMAIL_TEMPLATES: EmailTemplate[] = [exampleBankEmail];

export type { CsvTemplate, EmailTemplate } from "./types";
