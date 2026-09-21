---
status: Done
story_id: 9.3
epic: 9
title: "Config loader (loadConfig)"
owner: "@dev"
acceptance_criteria:
  - loadConfig(name, overrides) merges JSON onto defaults
  - Graceful fallback when JSON absent/malformed
  - Programmatic overrides have highest precedence
---

# Story 9.3: Config loader (loadConfig)

## Summary

Config loader (loadConfig). Part of Epic 9 (Config-Driven Advisor (Remove Hardcoded Values)).

## Acceptance Criteria

- [x] loadConfig(name, overrides) merges JSON onto defaults
- [x] Graceful fallback when JSON absent/malformed
- [x] Programmatic overrides have highest precedence

## Validation Gates

- [x] Unit tests passing
- [x] No type errors
- [x] No linting errors

## Related Issues

- Epic #9 (Config-Driven Advisor (Remove Hardcoded Values))
