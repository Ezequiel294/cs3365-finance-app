export const DASHBOARD_TABS = [
  { id: 'spending', label: 'Spending', href: '/dashboard' },
  { id: 'cashflow', label: 'Money in and out', href: '/cashflow' },
];

export const FOOTNOTE = 'All amounts in USD. Transfers between your own accounts and card payments are not counted.';

export const isMonth = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
