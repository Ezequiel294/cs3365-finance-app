/** Global reference data, written as DynamoDB attribute values (PK = GLOBAL). */
const S = (s: string) => ({ S: s });

const CATEGORIES: [string, string][] = [
  ['groceries', 'Groceries'],
  ['eating-out', 'Eating out'],
  ['transport', 'Transport'],
  ['fuel', 'Fuel'],
  ['housing', 'Housing and rent'],
  ['utilities', 'Utilities'],
  ['phone-internet', 'Phone and internet'],
  ['subscriptions', 'Subscriptions'],
  ['health', 'Health'],
  ['education', 'Education'],
  ['entertainment', 'Entertainment'],
  ['clothing', 'Clothing'],
  ['travel', 'Travel'],
  ['gifts', 'Gifts and donations'],
  ['fees', 'Bank fees'],
  ['income', 'Income and interest'],
  ['other', 'Other'],
];

export const GLOBAL_CATEGORIES = CATEGORIES.map(([id, name]) => ({
  PK: S('GLOBAL'),
  SK: S(`CAT#${id}`),
  id: S(id),
  name: S(name),
  scope: S('GLOBAL'),
  archived: { BOOL: false },
}));

const RULES: [string, string][] = [
  ['automercado', 'groceries'],
  ['walmart', 'groceries'],
  ['masxmenos', 'groceries'],
  ['spotify', 'subscriptions'],
  ['netflix', 'subscriptions'],
  ['uber', 'transport'],
  ['pago-liberty-movil-movistar', 'phone-internet'],
  ['intereses', 'income'],
];

export const GLOBAL_RULES = RULES.map(([merchantKey, categoryId]) => ({
  PK: S('GLOBAL'),
  SK: S(`RULE#${merchantKey}`),
  merchantKey: S(merchantKey),
  categoryId: S(categoryId),
  tagIds: { L: [] },
  scope: S('GLOBAL'),
}));
