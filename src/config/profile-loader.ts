/**
 * AdvisorConfig loader — reads per-profile JSON config files and merges them
 * onto DEFAULT_ADVISOR_CONFIG. This is the single entry point for resolving a
 * fully-populated AdvisorConfig (defaults + JSON overrides) by risk profile name.
 *
 * No hardcoded values leak here: the defaults live in advisor-config.ts and the
 * per-profile overrides live in config/profiles/*.json.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  AdvisorConfig,
  RiskProfileName,
  DEFAULT_ADVISOR_CONFIG,
  mergeConfig,
} from './advisor-config';

/** Directory containing per-profile JSON overrides (repo-relative). */
export const PROFILES_DIR = path.resolve(__dirname, '../../config/profiles');

/** Resolve the filesystem path to a profile's JSON file. */
function profilePath(name: RiskProfileName): string {
  return path.join(PROFILES_DIR, `${name}.json`);
}

/**
 * Load a profile's JSON override (partial AdvisorConfig). Returns null when the
 * file is absent or unparseable (caller falls back to defaults + logs).
 */
export function loadProfileOverride(name: RiskProfileName): Partial<AdvisorConfig> | null {
  const p = profilePath(name);
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw) as Partial<AdvisorConfig>;
  } catch (err) {
    // Missing/malformed file → null; caller merges defaults and can surface a warning.
    return null;
  }
}

/**
 * Resolve the fully-populated AdvisorConfig for a risk profile.
 *
 * @param name The profile name (default 'moderate').
 * @param overrides Optional programmatic overrides applied last (highest precedence).
 */
export function loadConfig(
  name: RiskProfileName = 'moderate',
  overrides: Partial<AdvisorConfig> = {},
): AdvisorConfig {
  const fileOverride = loadProfileOverride(name);
  let config = { ...DEFAULT_ADVISOR_CONFIG, name, label: DEFAULT_ADVISOR_CONFIG.label };
  if (fileOverride) {
    config = mergeConfig(config, fileOverride) as AdvisorConfig;
  }
  if (Object.keys(overrides).length > 0) {
    config = mergeConfig(config, overrides) as AdvisorConfig;
  }
  config.name = name;
  return config;
}

export default loadConfig;
