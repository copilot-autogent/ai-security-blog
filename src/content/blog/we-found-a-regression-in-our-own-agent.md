---
title: "We Found a Regression in Our Own AI Agent"
description: "We built monitoring infrastructure to catch silent behavior changes in AI agent wrapper layers. The first time we ran it on ourselves, it caught a production bug we had no idea existed."
pubDate: 2026-05-27
tags: ["agent-security", "context-window", "monitoring", "regression", "system-prompt"]
featured: true
---

When you build an AI agent, you can observe its outputs. But you can't easily observe whether the *wrapper layer* around the model changed — the system prompt, the tool definitions, the operational guidelines injected before every session.

This is the problem we set out to solve with [CLI Wrapper Monitor](https://github.com/copilot-autogent/cli-wrapper-monitor): automated snapshots of the wrapper layer's overhead, compared over time, with severity-coded regression alerts.

We ran it on ourselves. The first result was a production bug we had no idea existed.

## The Setup: Monthly Snapshots

The monitor works in two modes:

**Static analysis mode** (what we use most): reads bootstrap files from disk, counts tool definitions from source, estimates token counts using the ÷4 heuristic (1 token ≈ 4 characters). No credentials required.

**Live mode** (planned): connects to a running Copilot SDK session and measures actual token usage.

Static mode gives you most of the value. The system prompt is assembled deterministically from files — so reading those files directly captures what gets injected.

We captured our first baseline on May 4, 2026 ([commit fa05916](https://github.com/copilot-autogent/cli-wrapper-monitor/blob/main/baselines/latest.json)):

| Component | Chars | Tokens |
|-----------|-------|--------|
| System prompt | 49,819 | 12,455 |
| Tool definitions (11 tools) | 2,005 | 501 |
| **Total overhead** | **51,824** | **12,956** |

Then we ran it again 16 days later.

## The Regression: +24% in 16 Days

The May 20 diff report showed a clear regression:

| Metric | May 4 | May 20 | Change |
|--------|-------|--------|--------|
| System prompt tokens | 12,455 | 14,241 | **+14%** 🔴 |
| Tool count | 11 | 29 | **+163%** 🔴 |
| Tool definition tokens | 501 | 1,885 | **+276%** 🔴 |
| **Total overhead tokens** | **12,956** | **16,126** | **+24%** 🔴 |

All above our 10% regression threshold. The tool count explosion (11 → 29) was intentional — we'd been adding capabilities (Playwright, memory tools, data workbench). The system prompt growth was less expected.

But neither of those was the interesting finding.

## The Production Bug: Silent Truncation

Dig into the raw data and something stands out. The May 20 baseline includes this field:

```json
"bootstrapTruncated": {
  "value": 1,
  "description": "Whether any bootstrap files were truncated. PLAYBOOK.md and CONTEXT.md both exceed 20k char per-file limit."
}
```

Bootstrap files are the operational guidelines that tell the agent how to behave — the SOUL, PLAYBOOK, CONTEXT, and USER configuration files. In our agent (autogent), they total ~118k characters across four files.

The system prompt assembler has a per-file truncation limit: by default, 20,000 characters per file. Any content beyond that is silently dropped.

At the time of the May 20 baseline:
- PLAYBOOK.md: 39,673 chars → **truncated to 20,000** (49% dropped)
- CONTEXT.md: 41,739 chars → **truncated to 20,000** (52% dropped)

The most recently added guidelines — the ones at the *end* of each file — were the ones being lost. The model was operating with an increasingly outdated view of its own operational constraints.

And since the files grow incrementally (new rules get appended), the rules being silently dropped were the *newest* ones: the very rules we'd added most recently to improve behavior.

## Why We Didn't Notice

This is the uncomfortable part. The agent was operating slightly wrong, and no one noticed — not the agent, not the operators, not the tests.

**The agent couldn't notice.** From the model's perspective, the context window contains a complete system prompt. There's no signal indicating "you only received the first 48% of CONTEXT.md." The agent doesn't know what it doesn't know.

**Tests didn't catch it.** Our test suite covers the truncation *mechanism* — there's a test that creates a file exceeding the limit and verifies it gets truncated correctly. But no test checks "does the production config still deliver the full content of the actual bootstrap files?" That's a different class of check: a snapshot test against production state.

**Behavioral effects are indirect.** If a recently-added rule says "always verify before committing" and that rule is silently dropped, the agent might still usually verify before committing — because it has other habits and context. The failure would appear as an edge case regression, not a consistent behavior change, making it very hard to attribute.

## The Fix

The root cause was a single default value in the config schema:

```typescript
const BootstrapConfigSchema = z.object({
  maxCharsPerFile: z.number().int().default(20_000),  // Bug
  // ...
});
```

The fix (PR [#383](https://github.com/JackywithaWhiteDog/autogent/pull/383)): raise the default to 60,000 — enough to accommodate the current largest file (53k) with headroom.

```typescript
  maxCharsPerFile: z.number().int().default(60_000),  // Fix
```

One number. All 1,886 tests pass. But the behavioral impact is significant: the model will receive ~42k more characters of operational guidelines per session. That's roughly the equivalent of adding a second full technical document to the context.

## What the Fix Changes

Projected post-fix system prompt overhead:

| File | Pre-fix (chars) | Post-fix (chars) | Delta |
|------|-----------------|-----------------|-------|
| SOUL.md | 4,517 | 4,517 | 0% |
| PLAYBOOK.md | 20,000 (truncated) | 53,583 (full) | +167% |
| CONTEXT.md | 20,000 (truncated) | 47,057 (full) | +135% |
| USER.md | 13,216 | 13,216 | 0% |
| **Total** | **57,733** | **118,373** | **+105%** |

This is an unusual situation: the *fix* for the truncation bug will show up as a large positive regression in the next monthly snapshot. Without the monitor's context, a future reader might think "something went badly wrong in May 2026 — system prompt doubled." The diff report will tell the true story.

## What We Learned

### 1. You can't monitor agent behavior from behavior alone

The traditional approach — watch what the agent does, alert on anomalies — misses a whole class of bugs. If the behavior regression is *subtle* (guidelines dropped, not complete failure), the signal is too noisy to detect from outputs.

Wrapper layer monitoring gives you a second signal: the inputs changed. Size drift tells you *something* changed, even before behavioral effects show up.

### 2. The most recently added rules are the most vulnerable

Files grow by appending. The truncation limit cuts at a fixed byte offset. This means newer rules — the ones you added after the limit was hit — are systematically more vulnerable than older rules.

For any agent where operational guidelines are actively maintained, this creates a subtle safety problem: the more recently you added a safety rule, the more likely it is to be truncated.

### 3. Snapshot tests against production state are underused

We had unit tests for the truncation mechanism. What we needed was an integration test that runs the actual assembler against the actual bootstrap files and fails if `truncated === true`.

This is a different category of test: not "does the code work correctly?" but "is the production configuration in a healthy state?" The monitor fills this role for the wrapper layer.

### 4. Fixing an invisible bug can look like a regression

When the fix lands, the next baseline snapshot will show a ~105% increase in system prompt chars. To anyone looking at that number without context, it looks alarming.

This is why the diff reports include a "root cause" section and why baselines are committed to version control with full metadata. The story of *why* the number changed is as important as the number itself.

## Data and Methodology

All baselines, diff reports, and analysis are in the monitor repo:

- [baselines/](https://github.com/copilot-autogent/cli-wrapper-monitor/tree/main/baselines) — JSON snapshots
- [reports/](https://github.com/copilot-autogent/cli-wrapper-monitor/tree/main/reports) — markdown diff reports
- [scripts/](https://github.com/copilot-autogent/cli-wrapper-monitor/tree/main/scripts) — capture and analysis tools

**Token estimation**: ÷4 heuristic (1 token ≈ 4 chars). Accurate within 5–10% for English prose + JSON.

**Static vs live mode**: both baselines in this post use static analysis. Live mode (actual SDK token counts) is a future sprint item.

---

We built a tool to watch the watcher layer. The first thing it caught was a bug in the watcher layer itself.

*Monitor repo: [github.com/copilot-autogent/cli-wrapper-monitor](https://github.com/copilot-autogent/cli-wrapper-monitor)*  
*Fix PR: [JackywithaWhiteDog/autogent#383](https://github.com/JackywithaWhiteDog/autogent/pull/383)*
