import type { AppConfig } from './config.js';

export interface AiCreditUsageItem {
  date?: string;
  product?: string;
  sku?: string;
  model?: string;
  unitType?: string;
  pricePerUnit?: number;
  grossQuantity?: number;
  grossAmount?: number;
  discountQuantity?: number;
  discountAmount?: number;
  netQuantity?: number;
  netAmount?: number;
}

export interface AiCreditUsageResponse {
  timePeriod?: {
    year?: number;
    month?: number;
    day?: number;
  };
  organization?: string;
  enterprise?: string;
  usageItems?: AiCreditUsageItem[];
}

export interface CopilotBillingResponse {
  seat_breakdown?: {
    total?: number;
    active_this_cycle?: number;
  };
  plan_type?: 'business' | 'enterprise' | string;
}

export interface UsageRequest {
  year: number;
  month: number;
  day?: number;
}

export class GitHubClient {
  private readonly baseUrl = 'https://api.github.com';

  constructor(private readonly config: AppConfig) {}

  async getAiCreditUsage(period: UsageRequest): Promise<AiCreditUsageResponse> {
    const path = this.config.GITHUB_ENTERPRISE
      ? `/enterprises/${encodeURIComponent(this.config.GITHUB_ENTERPRISE)}/settings/billing/ai_credit/usage`
      : `/organizations/${encodeURIComponent(this.config.GITHUB_ORG)}/settings/billing/ai_credit/usage`;

    const params = new URLSearchParams({
      year: String(period.year),
      month: String(period.month)
    });

    if (period.day !== undefined) {
      params.set('day', String(period.day));
    }

    if (this.config.GITHUB_ENTERPRISE) {
      params.set('organization', this.config.GITHUB_ORG);
    }

    return this.getJson<AiCreditUsageResponse>(`${path}?${params.toString()}`);
  }

  async getCopilotBilling(): Promise<CopilotBillingResponse | null> {
    if (this.config.GITHUB_ENTERPRISE) {
      return null;
    }

    return this.getJson<CopilotBillingResponse>(`/orgs/${encodeURIComponent(this.config.GITHUB_ORG)}/copilot/billing`);
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.config.GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': this.config.GITHUB_API_VERSION,
        'User-Agent': 'github-ai-usage-dashboard'
      }
    });

    if (!response.ok) {
      const body = await response.text();

      if (response.status === 404 && path.includes('/settings/billing/ai_credit/usage') && !this.config.GITHUB_ENTERPRISE) {
        throw new Error(
          'GitHub AI credit usage was not found at the organization billing endpoint. ' +
          'If this organization is billed through an enterprise, set GITHUB_ENTERPRISE in .env to the enterprise slug and restart the server. ' +
          'If you are using a fine-grained token, it must also include Administration organization permission with read access. ' +
          `GitHub response: ${body.slice(0, 400)}`
        );
      }

      throw new Error(`GitHub API ${response.status} ${response.statusText}: ${body.slice(0, 400)}`);
    }

    return response.json() as Promise<T>;
  }
}