import './styles.css';
import type { DashboardUsage, DailyUsagePoint, ModelUsagePoint } from '../shared/types';

const app = getAppElement();

const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const compactFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, notation: 'compact' });
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

async function loadUsage(): Promise<void> {
  try {
    const response = await fetch('/api/usage');
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error ?? `API returned ${response.status}`);
    }

    renderDashboard(payload as DashboardUsage);
  } catch (error) {
    renderError(error instanceof Error ? error.message : String(error));
  }
}

function renderDashboard(usage: DashboardUsage): void {
  const headlineCreditsUsed = usage.totals.grossCredits;
  const percent = Math.max(0, Math.min(100, usage.includedCredits.percent));
  const maxDaily = Math.max(1, ...usage.daily.map((day) => day.grossCredits));
  const maxModel = Math.max(1, ...usage.models.map((model) => model.grossCredits));

  app.innerHTML = `
    <section class="hero">
      ${renderNotice(usage)}

      <div class="usage-summary">
        <div class="usage-number">
          <span>${formatCredits(headlineCreditsUsed)}</span>
          <span class="muted">/ ${formatCredits(usage.includedCredits.limit)}</span>
        </div>
        <div class="usage-label">AI credits used</div>
      </div>

      <div class="bar-frame" aria-label="${percent.toFixed(1)} percent of included credits used">
        <div class="bar-fill" style="width: ${percent}%"></div>
      </div>

      <div class="hero-footer">
        <div>
          <span class="metric-value">${formatCredits(usage.includedCredits.remaining)}</span>
          <span class="metric-label">remaining</span>
        </div>
        <div>
          <span class="metric-value">${percent.toFixed(1)}%</span>
          <span class="metric-label">used</span>
        </div>
        <div>
          <span class="metric-value">${currencyFormatter.format(usage.additionalUsage.amountUsd)}</span>
          <span class="metric-label">additional usage</span>
        </div>
        ${renderForecastMetric(usage)}
        ${renderComparisonMetric(usage)}
      </div>
    </section>
    <section class="lower-grid">
      <div class="panel chart-panel">
        <div class="panel-heading">Daily usage</div>
        <div class="daily-chart">
          ${usage.daily.map((day) => renderDailyBar(day, maxDaily)).join('')}
        </div>
      </div>
      <div class="panel model-panel">
        <div class="panel-heading">Models</div>
        <div class="model-list">
          ${usage.models.length > 0 ? usage.models.map((model) => renderModelRow(model, maxModel)).join('') : '<div class="empty">No model usage yet.</div>'}
        </div>
      </div>
    </section>
  `;
}

function renderNotice(usage: DashboardUsage): string {
  if (usage.error) {
    return `<div class="notice error">Showing stale data. ${escapeHtml(usage.error)}</div>`;
  }

  if (usage.stale) {
    return '<div class="notice">Showing cached data while GitHub refreshes.</div>';
  }

  if (usage.warning) {
    return `<div class="notice">${escapeHtml(usage.warning)}</div>`;
  }

  return '';
}

function renderForecastMetric(usage: DashboardUsage): string {
  if (!usage.forecast) {
    return '';
  }

  return `
    <div title="Projected additional spend ${currencyFormatter.format(usage.forecast.projectedAdditionalAmountUsd)} by month end.">
      <span class="metric-value">${formatCredits(usage.forecast.projectedTotalCredits)}</span>
      <span class="metric-label">forecast</span>
    </div>
  `;
}

function renderComparisonMetric(usage: DashboardUsage): string {
  if (!usage.comparison) {
    return '';
  }

  const signedDelta = formatSignedPercent(usage.comparison.percentChange);

  return `
    <div title="${formatCredits(usage.comparison.previousTotalCredits)} credits at the same point in ${escapeHtml(usage.comparison.previousPeriodLabel)}.">
      <span class="metric-value">${signedDelta}</span>
      <span class="metric-label">vs previous month</span>
    </div>
  `;
}

function renderDailyBar(day: DailyUsagePoint, maxDaily: number): string {
  const height = Math.max(2, (day.grossCredits / maxDaily) * 100);
  const date = new Date(`${day.date}T00:00:00Z`);
  const label = new Intl.DateTimeFormat('en', { day: 'numeric', timeZone: 'UTC' }).format(date);

  return `
    <div class="day" title="${escapeHtml(day.date)}: ${formatCredits(day.grossCredits)} credits">
      <div class="day-bar-wrap"><div class="day-bar" style="height: ${height}%"></div></div>
      <div class="day-value">${compactFormatter.format(day.grossCredits)}</div>
      <div class="day-label">${label}</div>
    </div>
  `;
}

function renderModelRow(model: ModelUsagePoint, maxModel: number): string {
  const width = Math.max(3, (model.grossCredits / maxModel) * 100);

  return `
    <div class="model-row">
      <div class="model-row-top">
        <span>${escapeHtml(model.model)}</span>
        <span>${formatCredits(model.grossCredits)}</span>
      </div>
      <div class="model-track"><div class="model-fill" style="width: ${width}%"></div></div>
    </div>
  `;
}

function renderError(message: string): void {
  app.innerHTML = `
    <section class="hero error-state">
      <div class="usage-number">No data</div>
      <div class="notice error">${escapeHtml(message)}</div>
    </section>
  `;
}

function formatCredits(value: number): string {
  return formatter.format(Math.round(value));
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(rounded)}%`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  })[character] ?? character);
}

function getAppElement(): HTMLDivElement {
  const element = document.querySelector<HTMLDivElement>('#app');

  if (!element) {
    throw new Error('Missing #app element');
  }

  return element;
}

void loadUsage();
setInterval(() => void loadUsage(), 60_000);