import type { Category } from './types';

/**
 * The sixteen global categories seeded at deploy time as PK = GLOBAL, SK = CAT#<id>
 * (class diagram section 6). Used by the Data stack seed and by tests.
 */
export const GLOBAL_CATEGORIES: ReadonlyArray<Pick<Category, 'id' | 'name'>> = [
  { id: 'groceries', name: 'Groceries' },
  { id: 'eating-out', name: 'Eating out' },
  { id: 'transport', name: 'Transport' },
  { id: 'fuel', name: 'Fuel' },
  { id: 'utilities', name: 'Utilities' },
  { id: 'phone-internet', name: 'Phone and internet' },
  { id: 'subscriptions', name: 'Subscriptions' },
  { id: 'clothing', name: 'Clothing' },
  { id: 'education', name: 'Education' },
  { id: 'entertainment', name: 'Entertainment' },
  { id: 'travel', name: 'Travel' },
  { id: 'health', name: 'Health' },
  { id: 'gifts-donations', name: 'Gifts and donations' },
  { id: 'bank-fees', name: 'Bank fees' },
  { id: 'income-interest', name: 'Income and interest' },
  { id: 'other', name: 'Other' },
];

/** The category id used in rollups for a transaction without a category. */
export const UNCATEGORIZED_ID = 'uncategorized';
export const UNCATEGORIZED_NAME = 'Uncategorized';
export const OTHER_CATEGORY_ID = 'other';
