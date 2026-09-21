import { loadConfig } from '../config/profile-loader';
import { DEFAULT_ADVISOR_CONFIG, mergeConfig, AdvisorConfig } from '../config/advisor-config';

describe('AdvisorConfig (config-driven profiles)', () => {
  test('loadConfig defaults to moderate when JSON absent', () => {
    const c = loadConfig('moderate');
    expect(c.name).toBe('moderate');
    expect(c.min_confidence).toBe(DEFAULT_ADVISOR_CONFIG.min_confidence);
  });

  test('loadConfig merges JSON profile overrides onto defaults', () => {
    const c = loadConfig('conservative');
    // JSON overrides these from the default.
    expect(c.min_confidence).toBe(75);
    expect(c.sizing.max_position_pct).toBe(0.02);
    expect(c.risk.min_reward_risk_ratio).toBe(2.0);
    expect(c.drawdown.max_drawdown_pct).toBe(10);
    // Unspecified nested fields fall back to defaults.
    expect(c.sizing.correlation_threshold).toBe(DEFAULT_ADVISOR_CONFIG.sizing.correlation_threshold);
  });

  test('three profiles differ in risk ordering', () => {
    const c = loadConfig('conservative');
    const m = loadConfig('moderate');
    const a = loadConfig('aggressive');

    expect(c.sizing.max_position_pct).toBeLessThan(m.sizing.max_position_pct);
    expect(m.sizing.max_position_pct).toBeLessThan(a.sizing.max_position_pct);
    expect(c.min_confidence).toBeGreaterThan(m.min_confidence);
    expect(m.min_confidence).toBeGreaterThan(a.min_confidence);
    expect(c.risk.min_reward_risk_ratio).toBeGreaterThan(m.risk.min_reward_risk_ratio);
    expect(m.risk.min_reward_risk_ratio).toBeGreaterThan(a.risk.min_reward_risk_ratio);
    expect(c.drawdown.max_drawdown_pct).toBeLessThan(m.drawdown.max_drawdown_pct);
    expect(m.drawdown.max_drawdown_pct).toBeLessThan(a.drawdown.max_drawdown_pct);
  });

  test('conservative disables mean-reversion, aggressive loosens thresholds', () => {
    const c = loadConfig('conservative');
    const a = loadConfig('aggressive');
    expect(c.strategy_tuning.daytrade.enabled).toBe(false);
    expect(c.strategy_tuning.swing.enabled).toBe(true);
    expect(a.strategy_tuning.daytrade.enabled).toBe(true);
    expect(c.strategy_tuning.swing.rsi_oversold).toBeGreaterThan(a.strategy_tuning.swing.rsi_oversold);
    expect(c.strategy_tuning.swing.buy_score_threshold).toBeGreaterThan(a.strategy_tuning.swing.buy_score_threshold);
  });

  test('confirmation requirements differ by profile', () => {
    const c = loadConfig('conservative');
    const a = loadConfig('aggressive');
    expect(c.confirmation.require_multi_timeframe_alignment).toBe(true);
    expect(c.confirmation.require_derivatives_confirmation).toBe(true);
    expect(c.confirmation.require_on_chain_confirmation).toBe(true);
    expect(a.confirmation.require_multi_timeframe_alignment).toBe(false);
  });

  test('programmatic overrides have highest precedence', () => {
    const c = loadConfig('moderate', { min_confidence: 70 });
    expect(c.min_confidence).toBe(70);
    expect(c.sizing.max_position_pct).toBe(DEFAULT_ADVISOR_CONFIG.sizing.max_position_pct);
  });

  test('mergeConfig deep-merges nested objects', () => {
    const merged = mergeConfig(DEFAULT_ADVISOR_CONFIG, {
      sizing: { max_position_pct: 0.03 },
      risk: { min_reward_risk_ratio: 2.0 },
    } as Partial<AdvisorConfig>);
    expect(merged.sizing.max_position_pct).toBe(0.03);
    // Unchanged sibling field preserved.
    expect(merged.sizing.max_exposure_pct).toBe(DEFAULT_ADVISOR_CONFIG.sizing.max_exposure_pct);
    expect(merged.risk.min_reward_risk_ratio).toBe(2.0);
    expect(merged.risk.atr_period).toBe(DEFAULT_ADVISOR_CONFIG.risk.atr_period);
  });

  test('unknown profile throws', () => {
    expect(() => loadConfig('nonexistent' as any)).toThrow(/Unknown investor profile/);
  });
});
