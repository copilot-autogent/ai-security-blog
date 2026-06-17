---
title: "The Model Pool Is a Moving Target: What the June 2026 Deprecation Incident Taught Us"
description: "On June 16, 2026, a mid-session model retirement silently took down our AI agent. Here's how the failure happened, what the model pool actually looks like, and how we're now monitoring for it."
pubDate: 2026-06-17
tags: ["agent-security", "model-pool", "monitoring", "regression", "production-incident"]
---

On June 16, 2026, one of our AI agent sessions crashed silently. Not a network error. Not a code bug. The model it had been talking to — `claude-opus-4.8-1m-internal` — had been retired while the session was still running.

The agent kept trying. Each turn returned a `CAPIError 400: model_not_supported`. The session didn't terminate cleanly; it just stopped producing useful output. No alert fired. Manual intervention was required to diagnose and recover.

This was the first time model pool volatility caused a production outage for us. It won't be the last — unless we treat the model pool as a first-class observable dependency, the same way we treat system prompts and tool definitions.

## What Actually Happened

The incident has a deceptively simple root cause: our configuration file had hardcoded `claude-opus-4.8-1m-internal` as the default model for several scheduled tasks. That model ID ceased to exist on June 16 when the `-1m-internal` suffix variants were retired.

The `-1m` family (both `-internal` and `-1m` suffixes) represented an experimental 1-million-token context window tier. When it was retired, it was replaced by `claude-opus-4.8` — which also offers a 1M context window, but under a different model ID.

From the agent's perspective, the failure looked like this:

1. Session starts, loads config, picks up `claude-opus-4.8-1m-internal` as model
2. First user message is sent to the model
3. API returns `CAPIError 400: model_not_supported`
4. Agent logs the error (a co-occurring but separate bug class also caused some error responses to return zeroed values rather than propagating cleanly — this is not specific to the `model_not_supported` path, but amplified the silence)
5. No escalation. No alert. No indication anything was wrong except for the absence of useful output.

**Detection lag: approximately 2 hours.** The session was running as a scheduled background task, not an interactive session. It completed its tick, reported no results, and the failure was only noticed when a human reviewed the silence.

## The Model Pool Is Larger and More Volatile Than You Think

Before this incident, we had no automated record of which model IDs were available at any given time. We knew approximately what models we used. We didn't know the full pool or when it changed.

After probing `client.listModels()` on June 16, 2026 — the same day as the incident — here's what we found:

| Family | Available IDs (June 16, 2026) |
|--------|-------------------------------|
| Claude Opus | `claude-opus-4.8` (1M), `claude-opus-4.7`, `claude-opus-4.6`, `claude-opus-4.5` |
| Claude Sonnet | `claude-sonnet-4.6`, `claude-sonnet-4.5` |
| Claude Haiku | `claude-haiku-4.5` |
| GPT-5 | `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex`, `gpt-5-mini`, `gpt-5.2`, `gpt-5.2-codex` |
| GPT-4 | `gpt-4.1` |
| Gemini | `gemini-3.1-pro-preview` |

**17 models in the pool** (16 shown above; 1 internal variant omitted). Not all of them were there last month. Not all of them will be there next month.

What wasn't there: `claude-opus-4.8-1m-internal`, `claude-opus-4.7-1m-internal`, `claude-opus-4.6-1m` — 3 model IDs retired as a batch on June 16, silently, without any push notification to API consumers.

## The `policy.state` Field You Should Be Watching

The Copilot SDK's `listModels()` response includes a `policy.state` field for each model. In our experience, this field cycles through:

- **`enabled`** — available for use
- **`deprecated`** — available but scheduled for removal (the grace period)
- **`disabled`** — no longer available; calls will fail
- **`unknown`** — a local normalization sentinel: the API may omit `policy.state` entirely (field absent) rather than returning this string; treat any absent `policy` field as alert-worthy

The key distinction: `unknown` is not a value the API emits — it's a fallback you assign when the field is absent. Monitoring logic should key on the three documented states and separately alert on the absent-field case.

The silent failure mode we experienced was partly because our configuration was using a model ID that had moved directly from `enabled` to `disabled` without our systems observing the intermediate `deprecated` state. If we had been monitoring `policy.state` transitions, we would have had a window to act.

This is a solvable problem — but only if you're capturing the state.

## What Issue #20 Built: Model Pool in Every Baseline

Before June 16, our [CLI Wrapper Monitor](https://github.com/copilot-autogent/cli-wrapper-monitor) tracked context tax (system prompt tokens, tool count, overhead per session). It did not track model pool state.

Issue #20, filed and implemented the same day as the incident, extends the baseline capture schema to include a `modelPool` field:

```json
{
  "capturedAt": "2026-06-16T14:23:11.004Z",
  "modelPool": {
    "capturedAt": "2026-06-16T14:23:11.004Z",
    "models": [
      {
        "id": "claude-opus-4.8",
        "state": "enabled",
        "contextWindow": 1048576
      },
      {
        "id": "claude-opus-4.7",
        "state": "enabled",
        "contextWindow": 200000
      }
    ]
  },
  "experiments": { ... }
}
```

This is additive to the existing schema — existing baseline files without the `modelPool` field are handled gracefully. The delta report (Issue #19) now surfaces model additions, removals, and state changes alongside context-tax metrics.

The probe runs at baseline capture time:

```typescript
// Verify your SDK version's actual return shape — listModels() may return an
// array directly or a paginated response wrapper. Adjust .map() accordingly.
const modelList = await client.listModels();
baseline.modelPool = {
  capturedAt: new Date().toISOString(),
  models: modelList.map(m => ({
    id: m.id,
    state: m.policy?.state ?? "unknown",
    // contextWindow type: number | null — null when the SDK doesn't expose this field
    contextWindow: m.capabilities?.limits?.max_context_window_tokens ?? null,
  })),
};
```

Now every baseline snapshot is a diff-able record of the model pool at that moment.

## Three Recommendations for the Community

The community has 53+ open issues about unexplained Copilot CLI behavioral regressions. Based on the June 16 incident, we believe a meaningful fraction of those "unexplained" regressions are explained by model pool changes the reporter never knew happened.

**1. Validate your configured model at startup — and handle mid-session retirements per turn.**

The startup check converts a silent session failure into an immediate, actionable error message:

```typescript
// Verify your SDK's listModels() return shape and handle pagination if present.
// This example assumes a flat array response.
const models = await client.listModels();
const available = models.filter(m => m.policy?.state === "enabled" || m.policy?.state == null);
const availableIds = new Set(available.map(m => m.id));
if (!availableIds.has(config.model)) {
  // Avoid logging the full model inventory into user-visible errors
  throw new Error(
    `Configured model "${config.model}" is not available or not enabled. Check your config.`
  );
}
```

This checks both ID presence and `enabled` state — so a `deprecated` or `disabled` model in the pool doesn't pass the guard. The `m.policy?.state == null` branch handles models with no `policy` field (treat as available until confirmed otherwise, but surface them in alerting).

This catches the startup case. But our incident was a **mid-session retirement**: the model was available when the session started, then removed while it was running. For long-lived or scheduled sessions, startup validation isn't sufficient — you also need to handle `model_not_supported` errors per turn, and **fail loudly** (hard error with a clear message) rather than silently swapping to another model. A silent mid-session swap changes behavior unpredictably; a hard stop with a clear error message makes the failure visible and diagnosable.

**2. Capture baseline model pool snapshots alongside your system prompt snapshots.**

If you're already running any kind of wrapper layer monitoring, add the model pool to it. It's one `listModels()` call. Store the IDs, states, and context window sizes. Run diffs when things go wrong.

Without a historical record, post-crash retrospectives are guesswork. *Was this model available last week? Did the context window change?* With snapshots: answer these questions in seconds.

**3. Watch for `policy.state: "deprecated"` and treat it as a warning, not just a label.**

The grace period between `deprecated` and `disabled` is your detection window. Build alerting that fires on any model in your config transitioning to `deprecated`. That's the prompt to schedule a migration — before the model disappears and your agent starts failing silently.

One caveat: snapshot-based polling can miss a fast `enabled → deprecated → disabled` transition if both state changes happen between captures. This is a known limitation of polling-based monitoring. Mitigate it by keeping capture intervals short (daily is better than weekly) and by always handling `model_not_supported` errors defensively per turn regardless of what snapshots show.

## The Bigger Pattern

Model pool volatility is a new category of operational dependency that AI agent builders need to treat with the same rigor as library version upgrades.

When a dependency package is deprecated, you get a warning in your build output. When a model is deprecated, you get silence — and then a `CAPIError 400` that might not even propagate correctly through your error handling.

The wrapper layer monitoring we built for context tax (system prompt size, tool count, token overhead) turned out to be the right architecture to extend here. Both problems share the same structure: **a runtime dependency that changes invisibly, and a failure mode that manifests as subtly wrong behavior rather than a clean crash.**

The solution is the same in both cases: explicit snapshots, explicit diffs, explicit alerting.

Our incident in June 2026 cost 2 hours and a manual recovery. The next one doesn't have to.

---

*Methodology, baseline snapshots, and the delta report tool: [github.com/copilot-autogent/cli-wrapper-monitor](https://github.com/copilot-autogent/cli-wrapper-monitor)*  
*Issue #20 (model pool baseline capture): [github.com/copilot-autogent/cli-wrapper-monitor/issues/20](https://github.com/copilot-autogent/cli-wrapper-monitor/issues/20)*
