/**
 * InvestorProfile — backward-compatible re-export of AdvisorConfig.
 *
 * The canonical config type is `AdvisorConfig` (nested, JSON-driven) in
 * `src/config/advisor-config.ts`. This module is a thin compatibility shim so
 * existing callers that imported `InvestorProfile` / `getProfile` continue to
 * work while the codebase migrates to the config-driven model.
 *
 * Prefer `loadConfig(name, overrides)` from `src/config/profile-loader.ts` for
 * new code — it reads per-profile JSON and merges onto defaults.
 */

export type { AdvisorConfig as InvestorProfile, RiskProfileName, StrategyTuningConfig as StrategyTuning } from '../config/advisor-config';
export { loadConfig as getProfile } from '../config/profile-loader';

import type { AdvisorConfig } from '../config/advisor-config';
import { loadConfig } from '../config/profile-loader';

/** Resolve a profile by name with optional overrides (delegates to loadConfig). */
export function resolveProfile(
  name: 'conservative' | 'moderate' | 'aggressive' = 'moderate',
  overrides: Partial<AdvisorConfig> = {},
): AdvisorConfig {
  return loadConfig(name, overrides);
}

export default resolveProfile;
