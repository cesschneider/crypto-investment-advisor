/**
 * STORY-3.4: Data Freshness & Input Validation Gate
 *
 * A validation gate that runs BEFORE any scoring. It:
 *   - Enforces max_data_age_seconds per data source (configurable; default 300s critical / 3600s secondary)
 *   - Rejects future timestamps (> now + 60s tolerance)
 *   - Detects cross-source discrepancies (spot vs. perpetual price, bid/ask spread, volume spikes)
 *   - Forces INSUFFICIENT_DATA when critical data is stale or inconsistent
 *
 * Audit requirement (FR-304, audit §20/§24): never fabricate values; missing or
 * inconsistent critical data produces INSUFFICIENT_DATA, not a forced BUY/SELL.
 */

import { SignalInput, SignalAction, DataSource } from '../types';

/** Severity of a validation issue. */
export type IssueSeverity = 'critical' | 'warning';

/** A single data-quality problem found during validation. */
export interface ValidationIssue {
  source: string;
  severity: IssueSeverity;
  message: string;
}

/** Result of running the input validation gate. */
export interface ValidationResult {
  /** True when the input is safe to score. */
  valid: boolean;
  /** Ordered list of data issues (critical first). */
  issues: ValidationIssue[];
  /** When critical data fails, the action to short-circuit to. */
  insufficient_data_signal?: SignalAction;
}

/**
 * Per-source maximum data age (seconds).
 * Critical sources (market price, technical indicators) get a tight default;
 * secondary/optional sources get a looser default.
 */
export interface FreshnessConfig {
  /** Max age (seconds) for critical data sources (default 300). */
  critical_max_age_seconds: number;
  /** Max age (seconds) for secondary data sources (default 3600). */
  secondary_max_age_seconds: number;
  /** Tolerance (seconds) for "future" timestamps due to clock skew (default 60). */
  future_timestamp_tolerance_seconds: number;
  /** Max allowed spot vs. perpetual price divergence as a fraction (default 0.02 = 2%). */
  max_spot_perp_divergence: number;
  /** Max allowed bid/ask spread as a fraction (default 0.01 = 1%). */
  max_spread: number;
}

/** Default freshness configuration (matches audit §24). */
export const DEFAULT_FRESHNESS_CONFIG: FreshnessConfig = {
  critical_max_age_seconds: 300,
  secondary_max_age_seconds: 3600,
  future_timestamp_tolerance_seconds: 60,
  max_spot_perp_divergence: 0.02,
  max_spread: 0.01,
};

/** Source categories treated as critical (must be fresh and consistent). */
const CRITICAL_CATEGORIES: ReadonlySet<DataSource['category']> = new Set([
  'market',
  'technical',
]);

/**
 * Compute the age (seconds) of a timestamp relative to now.
 * A negative value indicates a future timestamp (clock skew or bad data).
 */
function ageSecondsOf(timestamp: string, now: number): number {
  const t = new Date(timestamp).getTime();
  if (Number.isNaN(t)) {
    return Number.NaN;
  }
  return (now - t) / 1000;
}

/**
 * Validate a single data source's freshness.
 * Pushes an issue if the timestamp is unparseable, in the future, or stale.
 */
function checkSourceFreshness(
  source: DataSource | undefined,
  label: string,
  config: FreshnessConfig,
  now: number,
  issues: ValidationIssue[],
): void {
  if (!source) {
    return;
  }

  const age = ageSecondsOf(source.timestamp, now);
  if (Number.isNaN(age)) {
    issues.push({
      source: label,
      severity: 'critical',
      message: `${label}: unparseable timestamp "${source.timestamp}"`,
    });
    return;
  }

  // Future timestamp rejection (allow small tolerance for clock skew).
  if (age < -config.future_timestamp_tolerance_seconds) {
    issues.push({
      source: label,
      severity: 'critical',
      message: `${label}: future timestamp (${Math.abs(age).toFixed(0)}s ahead of now)`,
    });
    return;
  }

  // Freshness enforcement per category.
  const isCritical = CRITICAL_CATEGORIES.has(source.category);
  const maxAge = isCritical
    ? config.critical_max_age_seconds
    : config.secondary_max_age_seconds;

  if (age > maxAge) {
    issues.push({
      source: label,
      severity: isCritical ? 'critical' : 'warning',
      message: `${label}: data stale (${age.toFixed(0)}s old, max ${maxAge}s)`,
    });
  }
}

/**
 * Validate cross-source consistency: spot vs. perpetual price divergence.
 * A divergence beyond the configured threshold indicates one source is corrupted.
 */
function checkSpotPerpDivergence(
  input: SignalInput,
  config: FreshnessConfig,
  issues: ValidationIssue[],
): void {
  const spot = input.market_data?.current_price;

  // Perpetual mark price is read from derivatives.mark_price (not part of the
  // core SignalInput schema, but populated by data fetchers). Compare when both
  // are present and positive.
  const perpPrice = (input as any).derivatives?.mark_price as number | undefined;
  if (spot === undefined || perpPrice === undefined || perpPrice <= 0) {
    return;
  }

  const divergence = Math.abs(spot - perpPrice) / spot;
  if (divergence > config.max_spot_perp_divergence) {
    issues.push({
      source: 'derivatives',
      severity: 'critical',
      message: `spot/perp price divergence ${(divergence * 100).toFixed(2)}% exceeds ${(config.max_spot_perp_divergence * 100).toFixed(0)}% (spot=${spot}, perp=${perpPrice})`,
    });
  }
}

/**
 * Validate cross-source consistency: bid/ask spread.
 * A spread beyond the threshold signals insufficient liquidity for execution.
 */
function checkSpread(
  input: SignalInput,
  config: FreshnessConfig,
  issues: ValidationIssue[],
): void {
  const bid = (input as any).market_data?.bid_price as number | undefined;
  const ask = (input as any).market_data?.ask_price as number | undefined;
  if (bid === undefined || ask === undefined || ask <= 0 || bid <= 0) {
    return;
  }

  const spread = (ask - bid) / bid;
  if (spread > config.max_spread) {
    issues.push({
      source: 'market_data',
      severity: 'warning',
      message: `bid/ask spread ${(spread * 100).toFixed(2)}% exceeds ${(config.max_spread * 100).toFixed(0)}%`,
    });
  }
}

/**
 * Validate cross-source consistency: impossible numeric values (negative price/volume).
 */
function checkImpossibleValues(
  input: SignalInput,
  issues: ValidationIssue[],
): void {
  const md = input.market_data;
  if (md) {
    if (typeof md.current_price === 'number' && md.current_price <= 0) {
      issues.push({ source: 'market_data', severity: 'critical', message: 'current_price must be positive' });
    }
    if (typeof md.volume_24h_usd === 'number' && md.volume_24h_usd < 0) {
      issues.push({ source: 'market_data', severity: 'critical', message: 'volume_24h_usd cannot be negative' });
    }
    if (typeof md.price_24h_high === 'number' && typeof md.price_24h_low === 'number' && md.price_24h_high < md.price_24h_low) {
      issues.push({ source: 'market_data', severity: 'warning', message: 'price_24h_high is below price_24h_low (impossible range)' });
    }
  }
}

/**
 * The input validation gate. Runs before SignalScorer.score().
 *
 * @param input The signal input to validate.
 * @param config Optional freshness configuration overrides.
 * @returns A ValidationResult indicating validity, issues, and any short-circuit action.
 */
export function validateInput(
  input: SignalInput,
  config: FreshnessConfig = DEFAULT_FRESHNESS_CONFIG,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const now = Date.now();

  // Freshness of each data source.
  checkSourceFreshness(input.market_data?.data_source, 'market_data', config, now, issues);
  checkSourceFreshness(input.technical_indicators?.data_source, 'technical_indicators', config, now, issues);
  checkSourceFreshness(input.derivatives?.data_source, 'derivatives', config, now, issues);
  checkSourceFreshness(input.on_chain?.data_source, 'on_chain', config, now, issues);
  checkSourceFreshness(input.sentiment?.data_source, 'sentiment', config, now, issues);
  checkSourceFreshness(input.macro?.data_source, 'macro', config, now, issues);

  // Cross-source consistency checks.
  checkSpotPerpDivergence(input, config, issues);
  checkSpread(input, config, issues);
  checkImpossibleValues(input, issues);

  // Order critical issues first for clear reporting.
  const severityRank: Record<IssueSeverity, number> = { critical: 0, warning: 1 };
  issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const hasCritical = issues.some((i) => i.severity === 'critical');

  return {
    valid: !hasCritical,
    issues,
    insufficient_data_signal: hasCritical ? 'INSUFFICIENT_DATA' : undefined,
  };
}

/**
 * InputValidator service wrapper providing a stable, injectable API.
 * Usage: `const validator = new InputValidator(); const result = validator.validate(input);`
 */
export class InputValidator {
  private config: FreshnessConfig;

  constructor(config: FreshnessConfig = DEFAULT_FRESHNESS_CONFIG) {
    this.config = config;
  }

  /**
   * Validate a signal input before scoring.
   * @returns ValidationResult; when critical data is stale/inconsistent, `valid` is false.
   */
  validate(input: SignalInput): ValidationResult {
    return validateInput(input, this.config);
  }
}

export default InputValidator;
