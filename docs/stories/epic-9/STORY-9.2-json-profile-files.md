---
status: Done
story_id: 9.2
epic: 9
title: "JSON profile files (config/profiles/*.json)"
owner: "@dev"
acceptance_criteria:
  - conservative.json / moderate.json / aggressive.json
  - Each file only overrides values that differ from defaults
  - JSON is the source of truth for profile parameters
---

# Story 9.2: JSON profile files (config/profiles/*.json)

## Summary

JSON profile files (config/profiles/*.json). Part of Epic 9 (Config-Driven Advisor (Remove Hardcoded Values)).

## Acceptance Criteria

- [x] conservative.json / moderate.json / aggressive.json
- [x] Each file only overrides values that differ from defaults
- [x] JSON is the source of truth for profile parameters

## Validation Gates

- [x] Unit tests passing
- [x] No type errors
- [x] No linting errors

## Related Issues

- Epic #9 (Config-Driven Advisor (Remove Hardcoded Values))
