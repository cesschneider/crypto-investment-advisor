import { getProfile, INVESTOR_PROFILES } from '../profiles/investor-profile';

describe('InvestorProfile', () => {
  test('ships three distinct templates', () => {
    expect(Object.keys(INVESTOR_PROFILES)).toHaveLength(3);
    expect(INVESTOR_PROFILES.conservative).toBeDefined();
    expect(INVESTOR_PROFILES.moderate).toBeDefined();
    expect(INVESTOR_PROFILES.aggressive).toBeDefined();
  });

  test('risk ordering: conservative is the most restrictive', () => {
    const c = INVESTOR_PROFILES.conservative;
    const m = INVESTOR_PROFILES.moderate;
    const a = INVESTOR_PROFILES.aggressive;

    // Position sizing: conservative smallest, aggressive largest.
    expect(c.max_position_pct).toBeLessThan(m.max_position_pct);
    expect(m.max_position_pct).toBeLessThan(a.max_position_pct);

    // Confidence bar: conservative highest.
    expect(c.min_confidence).toBeGreaterThan(m.min_confidence);
    expect(m.min_confidence).toBeGreaterThan(a.min_confidence);

    // Reward/risk: conservative demands the most.
    expect(c.min_reward_risk_ratio).toBeGreaterThan(m.min_reward_risk_ratio);
    expect(m.min_reward_risk_ratio).toBeGreaterThan(a.min_reward_risk_ratio);

    // Drawdown tolerance: conservative tightest.
    expect(c.max_drawdown_pct).toBeLessThan(m.max_drawdown_pct);
    expect(m.max_drawdown_pct).toBeLessThan(a.max_drawdown_pct);
  });

  test('conservative disables mean-reversion, requires all confirmations', () => {
    const c = INVESTOR_PROFILES.conservative;
    expect(c.allow_mean_reversion).toBe(false);
    expect(c.require_multi_timeframe_alignment).toBe(true);
    expect(c.require_derivatives_confirmation).toBe(true);
    expect(c.require_on_chain_confirmation).toBe(true);
  });

  test('aggressive requires no confirmations and allows mean reversion', () => {
    const a = INVESTOR_PROFILES.aggressive;
    expect(a.allow_mean_reversion).toBe(true);
    expect(a.require_multi_timeframe_alignment).toBe(false);
    expect(a.require_derivatives_confirmation).toBe(false);
    expect(a.require_on_chain_confirmation).toBe(false);
  });

  test('getProfile returns template and applies overrides', () => {
    const p = getProfile('moderate', { min_confidence: 70 });
    expect(p.name).toBe('moderate');
    expect(p.min_confidence).toBe(70);
    expect(p.max_position_pct).toBe(INVESTOR_PROFILES.moderate.max_position_pct);
  });

  test('getProfile defaults to moderate', () => {
    const p = getProfile();
    expect(p.name).toBe('moderate');
  });

  test('getProfile throws on unknown profile', () => {
    expect(() => getProfile('nonexistent' as any)).toThrow(/Unknown investor profile/);
  });
});
