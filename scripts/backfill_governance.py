#!/usr/bin/env python3
"""Backfill AIOX governance for the advisor code changes (Epics 8-9).

Creates story files + epic PRDs under the crypto-investment-advisor repo, then
creates matching GitHub issues for full traceability (story -> issue -> PR -> code).

Epic 8: Investor Profile & Signal Engine Integration (code already committed in PR #30)
Epic 9: Config-Driven Advisor (remove hardcoded values) + deprecated-file cleanup
"""
import os, json, subprocess, tempfile

ROOT = "/root/projects/crypto-investment-advisor"
DOCS = os.path.join(ROOT, "docs")

EPICS = [
    {
        "id": 8, "slug": "investor-profile-signal-engine",
        "title": "Investor Profile & Signal Engine Integration",
        "priority": "P1",
        "goal": "Wire the audited Epic 3-6 services into one decision pipeline, parameterized per investor risk profile, and integrate with paper trading. Closes the remaining gaps from the performance analysis.",
        "stories": [
            ("8.1", "investor-profile-templates", "InvestorProfile risk templates (low/mid/high)",
             ["Three named profiles: conservative/moderate/aggressive",
              "Profile parameterizes sizing, stops, TPs, min R:R, confidence, drawdown, exposure, confirmations",
              "getProfile(name, overrides) resolves a template with field-level overrides"]),
            ("8.2", "signal-engine-orchestration", "SignalEngine decision pipeline",
             ["Wires RegimeClassifier, MultiTimeframeAnalyzer, SignalScorer, Derivatives, OnChain, Sentiment, Macro, ATR risk, Volatility sizing, Drawdown breaker in order",
              "Emits structured EngineResult with action + trade_setup",
              "INSUFFICIENT_DATA / NO_TRADE are first-class outcomes"]),
            ("8.3", "exit-manager", "ExitManager position lifecycle",
             ["STOP_LOSS / TAKE_PROFIT / TRAILING_STOP / SIGNAL_FLIP exits",
              "Cascaded take-profit (fractional close)",
              "Deterministic exit decisions with logged reason"]),
            ("8.4", "paper-trading-executor", "Profile-aware paper trading executor",
             ["Uses SignalEngine + ExitManager + InvestorProfile",
              "Enforces max exposure + max drawdown from profile",
              "Replaces legacy RSI-only fixed-2% engine"]),
            ("8.5", "per-strategy-tuning", "Per-strategy tuning dimension",
             ["StrategyTuning: enabled + indicator params + entry/exit thresholds + regime weights",
              "Conservative disables mean-reversion; aggressive loosens thresholds",
              "Engine vetoes entry when regime maps to no enabled strategy"]),
        ],
    },
    {
        "id": 9, "slug": "config-driven-advisor",
        "title": "Config-Driven Advisor (Remove Hardcoded Values)",
        "priority": "P1",
        "goal": "Eliminate all hardcoded literals from the advisor. Every tunable becomes a profile-specific config value loaded from JSON, giving full per-investor configurability and a single source of truth.",
        "stories": [
            ("9.1", "advisor-config-schema", "AdvisorConfig schema + defaults",
             ["Full nested config schema (scorer/sizing/risk/drawdown/strategy/macro/derivatives/onchain/sentiment/freshness)",
              "DEFAULT_ADVISOR_CONFIG + mergeConfig deep-merge helper",
              "No business logic hardcodes a threshold"]),
            ("9.2", "json-profile-files", "JSON profile files (config/profiles/*.json)",
             ["conservative.json / moderate.json / aggressive.json",
              "Each file only overrides values that differ from defaults",
              "JSON is the source of truth for profile parameters"]),
            ("9.3", "config-loader", "Config loader (loadConfig)",
             ["loadConfig(name, overrides) merges JSON onto defaults",
              "Graceful fallback when JSON absent/malformed",
              "Programmatic overrides have highest precedence"]),
            ("9.4", "scorer-config-refactor", "SignalScorer accepts ScorerConfig",
             ["All scorer thresholds/weights come from ScorerConfig",
              "No inline literals (RSI 30/70, MACD 10, volume ratios, action thresholds)",
              "DEFAULT_SCORER_CONFIG preserves current behavior"]),
            ("9.5", "engine-config-threading", "SignalEngine threads AdvisorConfig",
             ["Engine constructs every service from the resolved AdvisorConfig",
              "Profile config flows into ATR risk, sizing, drawdown, strategy weights",
              "Removes inline multipliers (0.8/1.5 stop scaling)"],
             "InProgress"),
            ("9.6", "remove-deprecated-files", "Remove deprecated/legacy files",
             ["Delete src/analyzers/onchain.ts, altcoin.ts, technical.ts (replaced by services/)",
              "Delete src/examples/test-technical.ts",
              "Delete legacy paper-trading portfolio/service/dashboard on the old main branch",
              "Remove stale src/__tests__/onchain.test.ts, altcoin.test.ts, technical.test.ts"],
             "Draft"),
        ],
    },
]

def write(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)

def create_issue(title, body):
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
        f.write(body)
        bf = f.name
    r = subprocess.run(["gh", "issue", "create", "--title", title, "--body-file", bf], capture_output=True, text=True)
    os.unlink(bf)
    out = (r.stdout or r.stderr).strip()
    return out

epic_issue_nums = {}

for epic in EPICS:
    eid = epic["id"]
    # Epic PRD
    prd = f"# Epic {eid}: {epic['title']}\n\n**Priority**: {epic['priority']}\n\n## Goal\n{epic['goal']}\n\n## Stories\n"
    for item in epic["stories"]:
        sid, slug, title = item[0], item[1], item[2]
        prd += f"- **{sid} {title}**\n"
    prd += f"\n## Constitution\n- Law III: every story has a story file + GitHub issue + PR\n- Law V: lint/typecheck/test green before merge\n"
    write(f"{DOCS}/prd/epic-{eid}-{epic['slug']}.md", prd)

    # Epic issue
    out = create_issue(f"Epic {eid}: {epic['title']}", f"{epic['goal']}\n\nStories: " + ", ".join(s[0] for s in epic["stories"]) + f"\n\nSee docs/prd/epic-{eid}-{epic['slug']}.md")
    epic_issue_nums[eid] = out
    print(f"Epic {eid} issue: {out}")

    # Stories
    for item in epic["stories"]:
        sid, slug, title, criteria = item[0], item[1], item[2], item[3]
        status = item[4] if len(item) > 4 else "Done"
        ac_yaml = "\n".join(f"  - {c}" for c in criteria)
        ac_md = "\n".join(f"- [{'x' if status == 'Done' else ' '}] {c}" for c in criteria)
        story = f"""---
status: {status}
story_id: {sid}
epic: {eid}
title: "{title}"
owner: "@dev"
acceptance_criteria:
{ac_yaml}
---

# Story {sid}: {title}

## Summary

{title}. Part of Epic {eid} ({epic['title']}).

## Acceptance Criteria

{ac_md}

## Validation Gates

- [{'x' if status == 'Done' else ' '}] Unit tests passing
- [{'x' if status == 'Done' else ' '}] No type errors
- [{'x' if status == 'Done' else ' '}] No linting errors

## Related Issues

- Epic #{eid} ({epic['title']})
"""
        write(f"{DOCS}/stories/epic-{eid}/STORY-{sid}-{slug}.md", story)

        out = create_issue(f"Story {sid}: {title}", f"Epic {eid}. {title}.\n\nSee docs/stories/epic-{eid}/STORY-{sid}-{slug}.md")
        print(f"Story {sid} issue: {out}")

print("DONE")
