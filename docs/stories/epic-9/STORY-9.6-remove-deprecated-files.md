---
status: Draft
story_id: 9.6
epic: 9
title: "Remove deprecated/legacy files"
owner: "@dev"
acceptance_criteria:
  - Delete src/analyzers/onchain.ts, altcoin.ts, technical.ts (replaced by services/)
  - Delete src/examples/test-technical.ts
  - Delete legacy paper-trading portfolio/service/dashboard on the old main branch
  - Remove stale src/__tests__/onchain.test.ts, altcoin.test.ts, technical.test.ts
---

# Story 9.6: Remove deprecated/legacy files

## Summary

Remove deprecated/legacy files. Part of Epic 9 (Config-Driven Advisor (Remove Hardcoded Values)).

## Acceptance Criteria

- [ ] Delete src/analyzers/onchain.ts, altcoin.ts, technical.ts (replaced by services/)
- [ ] Delete src/examples/test-technical.ts
- [ ] Delete legacy paper-trading portfolio/service/dashboard on the old main branch
- [ ] Remove stale src/__tests__/onchain.test.ts, altcoin.test.ts, technical.test.ts

## Validation Gates

- [ ] Unit tests passing
- [ ] No type errors
- [ ] No linting errors

## Related Issues

- Epic #9 (Config-Driven Advisor (Remove Hardcoded Values))
