/**
 * Global categories, tags, and merchant rules (`PK = GLOBAL`), shared by every user. The data stack
 * writes these items at deploy time; tests load the same list.
 */
export interface SeedLabel {
  id: string;
  name: string;
}

export interface SeedRule {
  merchantKey: string;
  categoryId: string;
  tagIds: string[];
  /** A merchant text that normalizes to `merchantKey` (checked by a unit test). */
  sample: string;
}

export const GLOBAL_CATEGORIES: SeedLabel[] = [
  { id: "groceries", name: "Groceries" },
  { id: "eating-out", name: "Eating out" },
  { id: "transport", name: "Transport" },
  { id: "housing", name: "Housing and rent" },
  { id: "utilities", name: "Utilities" },
  { id: "health", name: "Health" },
  { id: "education", name: "Education" },
  { id: "entertainment", name: "Entertainment" },
  { id: "shopping", name: "Shopping" },
  { id: "clothing", name: "Clothing" },
  { id: "subscriptions", name: "Subscriptions" },
  { id: "travel", name: "Travel" },
  { id: "personal-care", name: "Personal care" },
  { id: "gifts", name: "Gifts and donations" },
  { id: "fees", name: "Bank fees" },
  { id: "salary", name: "Salary and client payments" },
  { id: "other", name: "Other" },
];

export const GLOBAL_TAGS: SeedLabel[] = [
  { id: "university", name: "University" },
  { id: "hobbies", name: "Hobbies" },
  { id: "household", name: "Household" },
  { id: "work", name: "Work" },
];

export const GLOBAL_RULES: SeedRule[] = [
  { merchantKey: "automercado", categoryId: "groceries", tagIds: [], sample: "AUTOMERCADO ESCAZU 042" },
  { merchantKey: "walmart", categoryId: "groceries", tagIds: [], sample: "WALMART CURRIDABAT 3021" },
  { merchantKey: "mas-menos", categoryId: "groceries", tagIds: [], sample: "MAS X MENOS SABANA 12" },
  { merchantKey: "pricesmart", categoryId: "groceries", tagIds: [], sample: "PRICESMART ESCAZU" },
  { merchantKey: "uber-trip", categoryId: "transport", tagIds: [], sample: "UBER *TRIP HELP.UBER.COM" },
  { merchantKey: "uber-eats", categoryId: "eating-out", tagIds: [], sample: "UBER EATS 8005928996" },
  { merchantKey: "netflix", categoryId: "subscriptions", tagIds: [], sample: "NETFLIX.COM 866-579-7172" },
  { merchantKey: "spotify", categoryId: "subscriptions", tagIds: [], sample: "SPOTIFY P1A2B3C4D5" },
  { merchantKey: "starbucks", categoryId: "eating-out", tagIds: [], sample: "STARBUCKS MULTIPLAZA 07" },
];
