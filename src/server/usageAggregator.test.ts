import { describe, expect, it } from 'vitest';
import { compareWithPreviousPeriod, normalizeItems, projectMonthEndTotals, resolveIncludedLimit } from './usageAggregator.js';

describe('usage aggregation helpers', () => {
  it('normalizes billing AI credit quantities', () => {
    const items = normalizeItems({
      usageItems: [
        {
          model: 'GPT-5',
          grossQuantity: 100,
          discountQuantity: 80,
          netQuantity: 20,
          grossAmount: 1,
          discountAmount: 0.8,
          netAmount: 0.2
        }
      ]
    }, 2026, 6, 4);

    expect(items).toEqual([
      {
        date: '2026-06-04',
        model: 'GPT-5',
        grossCredits: 100,
        includedCredits: 80,
        additionalCredits: 20,
        grossAmountUsd: 1,
        discountAmountUsd: 0.8,
        netAmountUsd: 0.2
      }
    ]);
  });

  it('prefers explicit included credit override', () => {
    const limit = resolveIncludedLimit({ INCLUDED_CREDITS_OVERRIDE: 33000 }, {
      plan_type: 'business',
      seat_breakdown: { active_this_cycle: 11 }
    }, new Date('2026-06-04T00:00:00Z'));

    expect(limit).toEqual({ limit: 33000, source: 'override' });
  });

  it('derives promotional business credits during June 2026', () => {
    const limit = resolveIncludedLimit({}, {
      plan_type: 'business',
      seat_breakdown: { active_this_cycle: 11 }
    }, new Date('2026-06-04T00:00:00Z'));

    expect(limit).toEqual({ limit: 33000, source: 'derived' });
  });

  it('projects month-end totals from current pace', () => {
    const forecast = projectMonthEndTotals(13000, 42, 10, 30, 33000);

    expect(forecast).toEqual({
      projectedTotalCredits: 39000,
      projectedAdditionalCredits: 6000,
      projectedAdditionalAmountUsd: 126
    });
  });

  it('computes signed previous-period change', () => {
    const comparison = compareWithPreviousPeriod(11800, 10000, 'May 2026');

    expect(comparison).toEqual({
      previousPeriodLabel: 'May 2026',
      previousTotalCredits: 10000,
      percentChange: 18
    });
  });

  it('handles missing previous-period usage', () => {
    const comparison = compareWithPreviousPeriod(2500, 0, 'May 2026');

    expect(comparison).toEqual({
      previousPeriodLabel: 'May 2026',
      previousTotalCredits: 0,
      percentChange: 100
    });
  });
});