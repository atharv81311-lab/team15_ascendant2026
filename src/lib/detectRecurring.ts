import type { DetectedCharge, Frequency } from './supabase';

export interface Transaction {
  date: string; // ISO date string or parseable date
  description: string;
  amount: number;
}

/**
 * Normalize a transaction description: lowercase, trim, strip trailing
 * numbers / store codes / common noise tokens so the same merchant
 * groups together across statements.
 */
export function normalizeDescription(desc: string): string {
  let s = (desc || '').toLowerCase().trim();
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ');
  // Strip trailing store/reference codes: e.g. "Netflix #1234", "Spotify 9876"
  s = s.replace(/[#*]?\s*\d{2,}\s*$/g, '');
  // Strip common transaction noise tokens
  s = s.replace(/\b(usa|llc|inc|payment|purchase|pos|debit|card|visa|mastercard|ach|recur|recurring|ppd|web|online|txn|transaction|direct)\b/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  // Strip any trailing punctuation
  s = s.replace(/[^\w\s]+$/g, '').trim();
  return s;
}

function parseDate(d: string): number {
  const t = Date.parse(d);
  if (Number.isNaN(t)) return NaN;
  return t;
}

const DAY_MS = 1000 * 60 * 60 * 24;

/**
 * Detect recurring charges from a list of transactions.
 *
 * - Groups by normalized description + amount within 5% tolerance.
 * - For groups with 2+ transactions, computes the average interval
 *   in days between consecutive (sorted) transactions.
 * - Classifies frequency by average interval:
 *     5-9 days  → 'weekly'
 *     25-35 days → 'monthly'
 *     350-380 days → 'yearly'
 * - Discards groups that don't fit any range.
 */
export function detectRecurringCharges(transactions: Transaction[]): DetectedCharge[] {
  // Filter to valid transactions only
  const valid = transactions.filter(
    (t) => t && t.description && !Number.isNaN(parseDate(t.date)) && typeof t.amount === 'number' && !Number.isNaN(t.amount)
  );

  // Group by normalized description
  const groups = new Map<string, Transaction[]>();
  for (const t of valid) {
    const key = normalizeDescription(t.description);
    if (!key) continue;
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }

  const results: DetectedCharge[] = [];

  for (const [name, txns] of groups) {
    if (txns.length < 2) continue;

    // Sort by date
    const sorted = txns
      .map((t) => ({ ...t, ts: parseDate(t.date) }))
      .sort((a, b) => a.ts - b.ts);

    // Sub-group by amount within 5% tolerance. We cluster amounts greedily:
    // sort amounts, then group values that are within 5% of the first in the cluster.
    const byAmount = new Map<number, typeof sorted>();
    const sortedByAmount = [...sorted].sort((a, b) => a.amount - b.amount);
    let clusterKey = sortedByAmount[0].amount;
    let cluster: typeof sorted = [];
    for (const t of sortedByAmount) {
      if (cluster.length === 0 || Math.abs(t.amount - clusterKey) / Math.abs(clusterKey) <= 0.05) {
        cluster.push(t);
      } else {
        byAmount.set(clusterKey, cluster);
        clusterKey = t.amount;
        cluster = [t];
      }
    }
    if (cluster.length > 0) byAmount.set(clusterKey, cluster);

    for (const [, group] of byAmount) {
      if (group.length < 2) continue;

      const ordered = [...group].sort((a, b) => a.ts - b.ts);
      let totalDays = 0;
      let intervals = 0;
      for (let i = 1; i < ordered.length; i++) {
        const diff = (ordered[i].ts - ordered[i - 1].ts) / DAY_MS;
        totalDays += diff;
        intervals += 1;
      }
      const avgInterval = intervals > 0 ? totalDays / intervals : 0;

      const frequency = classifyFrequency(avgInterval);
      if (!frequency) continue;

      // Representative amount: average of the cluster (rounded to 2 decimals)
      const avgAmount =
        Math.round((group.reduce((s, t) => s + t.amount, 0) / group.length) * 100) / 100;

      results.push({ name, amount: avgAmount, frequency });
    }
  }

  return results;
}

function classifyFrequency(avgIntervalDays: number): Frequency | null {
  if (avgIntervalDays >= 5 && avgIntervalDays <= 9) return 'weekly';
  if (avgIntervalDays >= 25 && avgIntervalDays <= 35) return 'monthly';
  if (avgIntervalDays >= 350 && avgIntervalDays <= 380) return 'yearly';
  return null;
}
