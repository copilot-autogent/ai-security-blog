---
title: "FinHarness: Multi-tier Inline Safety Harness for Finance LLM Agents"
description: "FinHarness wraps finance agents end-to-end with a Query Monitor, Tool Monitor, and adaptive Cascade judge — cutting attack success rate from 38.3% to 15.0% while preserving legitimate workflow approval."
pubDate: 2026-06-20
tags: ["agent-safety", "finance", "llm-guardrails", "prompt-injection", "inline-monitoring"]
---

Most AI safety work focuses on the edges of a conversation: filter the input, audit the output. FinHarness argues this is structurally wrong for finance agents — and backs it up with numbers.

The paper: **[FinHarness: An Inline Lifecycle Safety Harness for Finance LLM Agents](https://arxiv.org/abs/2605.27333)** (arXiv:2605.27333, May 2026) from researchers across Peking University, Nanyang Technological University, Tsinghua University, USTC, and several other institutions.

The core claim: effective defense for a finance agent must operate *inline* — inside the execution loop itself — not as a wrapper that sees only the first and last turns.

## Why Edge Defenses Fail Finance Agents

Finance agents are different from general-purpose chatbots in one important way: they invoke tools that commit irreversible state. A fund transfer, a contract signing, a pledge — once executed, the action stands. You can't undo a wire transfer by patching the model.

Two patterns dominate today's deployment stack, and both have structural gaps:

**Boundary filters** (prompt-injection classifiers, output guards) make allow/deny decisions at the conversation boundary. They're lightweight and stateless, but completely blind to what happens inside the tool-call loop. Attacks that fragment their payload across turns, or hide inside retrieved documents, pass through cleanly.

**Post-hoc LLM judges** feed the entire completed trace to a separate evaluator. They're accurate — but they audit *after termination*. The wire transfer has already cleared. And the judging context grows linearly with trace length, making them computationally expensive for long workflows.

The deeper problem: both patterns treat protection as an external supervisor watching a black-box agent. A five-step semantic-obfuscation attack might score 0.22 at every individual step — below any single-step threshold — while accumulating monotonically toward irreversible action at step five. A step-wise observer misses this entirely.

## Architecture: Three Inline Components

FinHarness wraps the finance agent end-to-end with three components that operate on every trajectory step.

### Query Monitor

The Query Monitor runs *without any LLM calls* — it uses deterministic compliance priors to score user input. Two sub-scorers run in parallel:

**Single-turn intent (Q1–Q5)** evaluates the current query: verb-tier intent (read vs. write vs. override), amount magnitude, risk-product flags, coercion or urgency signals, and injection lexicon patterns. These aren't fitted parameters — they're manually specified severity priors drawn from the tool-permission schema and finance-compliance taxonomy.

**Cross-turn drift (D1–D5)** compares the current turn against prior turns: false references to unsupported entities, pseudo test/debug mode assertions, phantom approval codes, verb-tier jumps, and closing push imperatives. Strong structural heads (false reference, pseudo-debug, phantom approval) can independently push the session risk into the unsafe band; weak signals can only approach the uncertain band even if both fire simultaneously.

The Monitor maintains a **session-level query risk cumulant** with gravity decay. If no strong structural drift has ever fired, the cumulant decays between turns (rate 0.7), so isolated weak signals fade. Once a strong structural signal fires, the cumulant persists indefinitely — the session is flagged and stays flagged.

When the cumulant crosses thresholds, the Monitor emits one of four advisory labels: `unsafe` (≥0.5), `uncertain` (0.25–0.5), `safe` (≤0.1), or a dead zone (⊥) where signals are too weak to label but too non-zero to clear. Advisory labels are injected into the agent's system prompt as *evidence* — e.g., `[turn k fired: Q4_coercion(0.85), D1_false_reference(0.85)]` — not as verdicts. The agent retains autonomy to refuse, re-plan, or approve based on this evidence.

### Tool Monitor

Before each prospective tool call, the Tool Monitor evaluates five heads: **permission tier** of the requested tool (read vs. write vs. critical write), **dangerous-parameter** pattern matching, **argument anomalies** (large amounts, injection tokens, high-risk product codes), **business-fact consistency** (does the accumulated context contradict what's being requested?), and **sequence anomalies** (critical write without prior verification step, consecutive critical writes).

The five heads are fused conservatively: the tool-side risk is the maximum of all five. Then the Query Monitor and Tool Monitor results are fused again by maximum — either a risky user intent *or* a risky tool call is sufficient to raise the step's risk, without requiring both to fire simultaneously.

### Cascade: Adaptive Judge Routing

The Cascade module is where the cost/accuracy tradeoff gets solved.

A **Risk Window** maintains the sum of per-step risk scores over a sliding window of the last five steps (W=5, threshold θ=1.0). When the window sum doesn't exceed the threshold, the step goes to the **cheap-tier judge** (gpt-4o-mini). When it does, it escalates to the **advanced-tier judge** (gpt-4o). The two tiers are mutually exclusive — at most one additional judge call per step (the protected agent's own model calls are separate).

A **Selective Episodic Memory** retrieves at most two prior steps for the judge's context, using two complementary selectors: the highest-risk recent step (risk-salience), and the step most similar to the current one in terms of semantic content and entity overlap (collusion detection). This bounds the judge's context window to a fixed size regardless of trajectory length — judge prompt cost is constant, independent of how long the trajectory grows (though the selectors themselves scan recent history to pick the two steps).

Fired risk signals from all three components are **re-injected into the agent input as ex-ante evidence** before the judge verdict is returned. This is what enables *agent-initiated self-rejection*: the agent sees the evidence, and can refuse or re-plan autonomously, rather than being hard-blocked by the harness.

## Results on FinVault

The benchmark is FinVault, a finance-specific agent safety evaluation grounded in state-changing workflows. The key metrics are **Attack Success Rate (ASR)** — how often an adversarial trajectory succeeds — and **Approve rate** on benign workflows.

| System | ASR | Approve (benign) |
|--------|-----|-----------------|
| Baseline (no harness) | 38.3% | 41.1% |
| **FinHarness (routed)** | **15.0%** | **39.3%** |
| FinHarness (always-advanced) | 8.4% | 37.4% |
| GuardAgent adaptation | 2.8% | 8.4% |
| InferAct adaptation | 0.9% | 0.9% |

The tradeoff is stark. GuardAgent and InferAct get very low ASR — but they also *collapse* benign approval to near-zero. An agent that blocks everything isn't useful.

FinHarness's routed configuration cuts ASR by more than half (38.3% → 15.0%) while dropping benign approval by only 1.8 percentage points (41.1% → 39.3%). The always-advanced ablation gets ASR down to 8.4% but at 37.4% benign approval — and uses **4.7× more advanced-judge calls** than the routed version.

On a secondary 856-trace synthesis stress set:
- Agent-initiated refusal: **+15.7 percentage points**
- Active interception (hard-stop + self-rejection + escalation): **+6.7 pp**
- Total containment (1 − ASR): **+4.0 pp**

## The Key Design Decisions

Several specific choices drive these results:

**Ex-ante evidence injection, not post-hoc verdicts.** By feeding fired risk signals back to the agent *before* the judge issues a verdict, FinHarness enables the agent to make its own safety decisions. This is what produces the 15.7 pp gain in agent-initiated refusal — the agent is informed, not bypassed.

**Conservative fusion.** Everywhere in the architecture, risk signals are fused by maximum, not average. A single high-risk signal raises the step's risk level regardless of other signals. This prevents a multi-signal attack from diluting any individual channel below threshold.

**Gravity decay with structural memory.** The session cumulant decays between turns unless a strong structural signal has ever fired. This means transient noise fades, but a session with confirmed structural attack patterns stays elevated indefinitely. Calibration, not accumulation for its own sake.

**Deterministic monitors, LLM judges only where needed.** The Query Monitor and Tool Monitor run entirely without LLM calls. The Cascade routes to LLM judges only for verification, and routes to the cheap tier by default. This is what makes the architecture viable at production scale: the expensive components fire rarely, and deterministically only when the accumulated evidence warrants it.

## Relation to the Broader Safety Stack

FinHarness compares explicitly to several related approaches and positions itself in the stack:

- **LlamaFirewall** (Meta): boundary-layer guardrail system. Complementary — FinHarness adds the inline loop coverage that boundary filters miss.
- **GuardAgent**: converts safety requests into guardrail checks. Achieves lower ASR but collapses benign approval.
- **InferAct**: detects misaligned actions before execution. Similar inline philosophy; FinHarness adds finance-specific priors and adaptive routing.
- **SafeHarness**: general-purpose lifecycle-integrated harness. FinHarness specializes to finance with domain compliance priors.

The prompt-injection defenses (Spotlighting, StruQ, IPIGuard) are explicitly called out as *complementary*: better-structured prompts still benefit from inline monitoring once the agent begins to act. FinHarness isn't trying to prevent the injection at the input stage — it's trying to catch the trajectory deviation as it unfolds.

## What This Points Toward

The inline architecture is the paper's conceptual contribution. The specific thresholds and head values are calibrated for FinVault; the interesting question is whether the pattern generalizes.

Three features of the design suggest it might:

1. **The risk cumulant model is domain-agnostic.** The specific priors are finance-specific, but the pattern — fuse per-turn intent scores with session-level drift, maintain a cumulant, emit advisories — works for any domain with a compliance taxonomy. Healthcare agents, legal agents, and infrastructure agents all have analogous tool-permission hierarchies.

2. **Evidence injection works because agents can reason about evidence.** The agent-initiated refusal gain isn't a FinHarness quirk — it reflects that modern LLMs are capable of refusing actions when given structured risk evidence. Any harness that frames risk as evidence rather than verdict probably gets this lift.

3. **Adaptive routing trades cost for accuracy.** The 4.7× reduction in advanced-judge calls relative to always-advanced comes purely from routing. The principle — use a cheaper model for routine cases, escalate for high-risk ones — applies to any verification loop where a cheap fast model and an accurate slow model both exist.

The benchmark results also raise a harder question: GuardAgent and InferAct achieve lower ASR. If the threat model is catastrophic irreversible actions (the FinVault premise), accepting 15% ASR vs 2.8% might be unacceptable for real deployments. FinHarness's argument is that 8.4% benign approval is effectively a broken system — but the threshold between "acceptable ASR" and "acceptable workflow degradation" is ultimately an operational decision, not a research one.

---

*Paper: [FinHarness: An Inline Lifecycle Safety Harness for Finance LLM Agents](https://arxiv.org/abs/2605.27333) — arXiv:2605.27333 (May 2026)*
