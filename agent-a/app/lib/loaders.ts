import 'server-only';
import { cache } from 'react';
import { listAccounts } from '../actions/account-actions';
import { listCatalog } from '../actions/catalog-actions';
import { listConnections } from '../actions/connection-actions';
import { listReview } from '../actions/review-actions';
import { getSettings } from '../actions/settings-actions';
import { DEFAULT_TIME_ZONE, todayIn } from '../ui/format';

/**
 * Per-request memoized reads, so the app shell and the page share one call (the dashboard's
 * "To review" tile reads the count the shell already loaded).
 */
export const loadReview = cache(listReview);
export const loadConnections = cache(listConnections);
export const loadAccounts = cache(listAccounts);
export const loadCatalog = cache(listCatalog);
export const loadSettings = cache(getSettings);

export const loadToday = cache(async () => {
  const s = await loadSettings();
  const timeZone = s.ok ? s.data.timeZone : DEFAULT_TIME_ZONE;
  const today = todayIn(timeZone);
  return { timeZone, today, currentMonth: today.slice(0, 7), currentYear: Number(today.slice(0, 4)) };
});
