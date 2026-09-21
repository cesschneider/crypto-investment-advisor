# Epic 9: Config-Driven Advisor (Remove Hardcoded Values)

**Priority**: P1

## Goal
Eliminate all hardcoded literals from the advisor. Every tunable becomes a profile-specific config value loaded from JSON, giving full per-investor configurability and a single source of truth.

## Stories
- **9.1 AdvisorConfig schema + defaults**
- **9.2 JSON profile files (config/profiles/*.json)**
- **9.3 Config loader (loadConfig)**
- **9.4 SignalScorer accepts ScorerConfig**
- **9.5 SignalEngine threads AdvisorConfig**
- **9.6 Remove deprecated/legacy files**

## Constitution
- Law III: every story has a story file + GitHub issue + PR
- Law V: lint/typecheck/test green before merge
