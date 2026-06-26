export type UsageSource = 'organization' | 'enterprise' | 'cache';

export interface DailyUsagePoint {
  date: string;
  grossCredits: number;
  includedCredits: number;
  additionalCredits: number;
}

export interface ModelUsagePoint {
  model: string;
  grossCredits: number;
  includedCredits: number;
  additionalCredits: number;
}

export interface DashboardUsage {
  organization: string;
  source: UsageSource;
  period: {
    year: number;
    month: number;
    label: string;
  };
  includedCredits: {
    used: number;
    limit: number;
    remaining: number;
    percent: number;
    source: 'override' | 'derived' | 'unknown';
  };
  additionalUsage: {
    credits: number;
    amountUsd: number;
  };
  forecast?: {
    projectedTotalCredits: number;
    projectedAdditionalCredits: number;
    projectedAdditionalAmountUsd: number;
  };
  comparison?: {
    previousPeriodLabel: string;
    previousTotalCredits: number;
    percentChange: number;
  };
  totals: {
    grossCredits: number;
    includedCredits: number;
    additionalCredits: number;
    grossAmountUsd: number;
    discountAmountUsd: number;
    netAmountUsd: number;
  };
  daily: DailyUsagePoint[];
  models: ModelUsagePoint[];
  refreshedAt: string;
  stale: boolean;
  warning?: string;
  error?: string;
}