import type { DailyUsagePoint, DashboardUsage, ModelUsagePoint, UsageSource } from '../shared/types.js';
import type { AppConfig } from './config.js';
import type { AiCreditUsageResponse, CopilotBillingResponse, GitHubClient } from './githubClient.js';

interface NormalizedUsageItem {
  date: string;
  model: string;
  grossCredits: number;
  includedCredits: number;
  additionalCredits: number;
  grossAmountUsd: number;
  discountAmountUsd: number;
  netAmountUsd: number;
}

interface IncludedLimit {
  limit: number;
  source: 'override' | 'derived' | 'unknown';
}

export async function buildDashboardUsage(config: AppConfig, github: GitHubClient, now = new Date()): Promise<DashboardUsage> {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const currentDay = now.getUTCDate();

  const [monthlyUsage, dailyUsage, billing] = await Promise.all([
    github.getAiCreditUsage({ year, month }),
    fetchDailyUsage(github, year, month, currentDay),
    github.getCopilotBilling().catch(() => null)
  ]);

  const source: UsageSource = config.GITHUB_ENTERPRISE ? 'enterprise' : 'organization';
  const monthlyItems = normalizeItems(monthlyUsage, year, month);
  const dailyItems = dailyUsage.flatMap((response, index) => normalizeItems(response, year, month, index + 1));
  const limit = resolveIncludedLimit(config, billing, now);
  const totals = sumItems(monthlyItems);
  const includedUsed = resolveIncludedUsed(totals.grossCredits, totals.includedCredits, limit.limit);
  const warning = limit.source === 'unknown'
    ? 'Set INCLUDED_CREDITS_OVERRIDE to match the included-credit limit shown in GitHub.'
    : undefined;

  return {
    organization: config.GITHUB_ORG,
    source,
    period: {
      year,
      month,
      label: formatMonth(year, month)
    },
    includedCredits: {
      used: roundCredits(includedUsed),
      limit: roundCredits(limit.limit),
      remaining: roundCredits(Math.max(0, limit.limit - includedUsed)),
      percent: limit.limit > 0 ? Math.min(100, (includedUsed / limit.limit) * 100) : 0,
      source: limit.source
    },
    additionalUsage: {
      credits: roundCredits(totals.additionalCredits),
      amountUsd: roundCurrency(totals.netAmountUsd)
    },
    totals: {
      grossCredits: roundCredits(totals.grossCredits),
      includedCredits: roundCredits(totals.includedCredits),
      additionalCredits: roundCredits(totals.additionalCredits),
      grossAmountUsd: roundCurrency(totals.grossAmountUsd),
      discountAmountUsd: roundCurrency(totals.discountAmountUsd),
      netAmountUsd: roundCurrency(totals.netAmountUsd)
    },
    daily: groupByDay(dailyItems, year, month, currentDay),
    models: groupByModel(monthlyItems),
    refreshedAt: new Date().toISOString(),
    stale: false,
    warning
  };
}

async function fetchDailyUsage(github: GitHubClient, year: number, month: number, currentDay: number): Promise<AiCreditUsageResponse[]> {
  const responses: AiCreditUsageResponse[] = [];

  for (let day = 1; day <= currentDay; day += 1) {
    responses.push(await github.getAiCreditUsage({ year, month, day }));
  }

  return responses;
}

export function normalizeItems(response: AiCreditUsageResponse, year: number, month: number, fallbackDay = 1): NormalizedUsageItem[] {
  const fallbackDate = toDateKey(year, month, response.timePeriod?.day ?? fallbackDay);

  return (response.usageItems ?? []).map((item) => {
    const pricePerCredit = item.pricePerUnit ?? 0.01;
    const grossCredits = item.grossQuantity ?? 0;
    const additionalCredits = item.netQuantity ?? creditsFromAmount(item.netAmount, pricePerCredit);
    const includedCredits = item.discountQuantity ?? Math.max(0, grossCredits - additionalCredits);

    return {
      date: item.date ?? fallbackDate,
      model: item.model || 'Unknown',
      grossCredits,
      includedCredits,
      additionalCredits,
      grossAmountUsd: item.grossAmount ?? grossCredits * pricePerCredit,
      discountAmountUsd: item.discountAmount ?? includedCredits * pricePerCredit,
      netAmountUsd: item.netAmount ?? additionalCredits * pricePerCredit
    };
  });
}

export function resolveIncludedLimit(
  config: Pick<AppConfig, 'INCLUDED_CREDITS_OVERRIDE'>,
  billing: CopilotBillingResponse | null,
  now = new Date()
): IncludedLimit {
  if (config.INCLUDED_CREDITS_OVERRIDE) {
    return { limit: config.INCLUDED_CREDITS_OVERRIDE, source: 'override' };
  }

  const planType = billing?.plan_type;
  const seatCount = billing?.seat_breakdown?.active_this_cycle ?? billing?.seat_breakdown?.total;

  if (!seatCount || !planType) {
    return { limit: 0, source: 'unknown' };
  }

  const creditsPerSeat = creditsPerSeatForPlan(planType, now);

  if (!creditsPerSeat) {
    return { limit: 0, source: 'unknown' };
  }

  return { limit: seatCount * creditsPerSeat, source: 'derived' };
}

function creditsPerSeatForPlan(planType: string, now: Date): number | null {
  const promotionalPeriod = now >= new Date('2026-06-01T00:00:00Z') && now < new Date('2026-09-01T00:00:00Z');

  if (planType === 'business') {
    return promotionalPeriod ? 3000 : 1900;
  }

  if (planType === 'enterprise') {
    return promotionalPeriod ? 7000 : 3900;
  }

  return null;
}

function resolveIncludedUsed(grossCredits: number, includedCredits: number, limit: number): number {
  if (includedCredits > 0) {
    return includedCredits;
  }

  if (limit > 0) {
    return Math.min(grossCredits, limit);
  }

  return grossCredits;
}

function sumItems(items: NormalizedUsageItem[]) {
  return items.reduce(
    (total, item) => ({
      grossCredits: total.grossCredits + item.grossCredits,
      includedCredits: total.includedCredits + item.includedCredits,
      additionalCredits: total.additionalCredits + item.additionalCredits,
      grossAmountUsd: total.grossAmountUsd + item.grossAmountUsd,
      discountAmountUsd: total.discountAmountUsd + item.discountAmountUsd,
      netAmountUsd: total.netAmountUsd + item.netAmountUsd
    }),
    {
      grossCredits: 0,
      includedCredits: 0,
      additionalCredits: 0,
      grossAmountUsd: 0,
      discountAmountUsd: 0,
      netAmountUsd: 0
    }
  );
}

function groupByModel(items: NormalizedUsageItem[]): ModelUsagePoint[] {
  const grouped = new Map<string, ModelUsagePoint>();

  for (const item of items) {
    const current = grouped.get(item.model) ?? { model: item.model, grossCredits: 0, includedCredits: 0, additionalCredits: 0 };
    current.grossCredits += item.grossCredits;
    current.includedCredits += item.includedCredits;
    current.additionalCredits += item.additionalCredits;
    grouped.set(item.model, current);
  }

  return [...grouped.values()]
    .map((model) => ({
      model: model.model,
      grossCredits: roundCredits(model.grossCredits),
      includedCredits: roundCredits(model.includedCredits),
      additionalCredits: roundCredits(model.additionalCredits)
    }))
    .sort((left, right) => right.grossCredits - left.grossCredits);
}

function groupByDay(items: NormalizedUsageItem[], year: number, month: number, currentDay: number): DailyUsagePoint[] {
  const grouped = new Map<string, DailyUsagePoint>();

  for (let day = 1; day <= currentDay; day += 1) {
    const date = toDateKey(year, month, day);
    grouped.set(date, { date, grossCredits: 0, includedCredits: 0, additionalCredits: 0 });
  }

  for (const item of items) {
    const current = grouped.get(item.date) ?? { date: item.date, grossCredits: 0, includedCredits: 0, additionalCredits: 0 };
    current.grossCredits += item.grossCredits;
    current.includedCredits += item.includedCredits;
    current.additionalCredits += item.additionalCredits;
    grouped.set(item.date, current);
  }

  return [...grouped.values()]
    .map((day) => ({
      date: day.date,
      grossCredits: roundCredits(day.grossCredits),
      includedCredits: roundCredits(day.includedCredits),
      additionalCredits: roundCredits(day.additionalCredits)
    }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function creditsFromAmount(amount: number | undefined, pricePerCredit: number): number {
  if (!amount || pricePerCredit <= 0) {
    return 0;
  }

  return amount / pricePerCredit;
}

function toDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatMonth(year: number, month: number): string {
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function roundCredits(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}