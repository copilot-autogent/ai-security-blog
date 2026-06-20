---
title: "Calibrating Conservatism for Scalable Oversight: Weaker Overseers Constraining Stronger Agents"
description: "CCO (Calibrated Collective Oversight) aggregates multiple weak oversight signals into a penalty that constrains a stronger agent, providing finite-time statistical guarantees on violation rates for adversarial state sequences — with an eventually-safe decision family and a designated zero-loss baseline."
pubDate: 2026-06-20
tags: ["scalable-oversight", "ai-safety", "conformal-prediction", "agentic-ai", "alignment"]
---

The scalable oversight problem is one of the hardest open problems in AI safety: how do you maintain meaningful human control over an AI system that may be more capable than its overseers? The standard toolkit — debate, iterated amplification, process reward models — is largely heuristic. Formal guarantees are rare, and almost nothing is designed for sequential agentic settings where actions compound across long trajectories.

A paper submitted to ICML 2026, **"Calibrating Conservatism for Scalable Oversight"** ([arXiv:2605.28807](https://arxiv.org/abs/2605.28807), Overman et al.), introduces a framework called **Calibrated Collective Oversight (CCO)** that addresses all three gaps at once: it handles sequential settings, aggregates multiple weak overseers, and provides finite-time statistical guarantees without distributional assumptions.

## The Core Architecture

CCO's design is clean enough to state in a paragraph.

At each timestep, a **primary agent** proposes candidate actions and assigns each a utility score `U(s, a)`. In parallel, a collection of **auxiliary overseers** `{q₁, ..., qₙ}` score the same candidates — but they don't need to understand the agent's goals, capabilities, or the full task. They just need to score each action relative to a designated **baseline action** (a conservative default like "defer" or "no-op").

The **CCO penalty** aggregates overseer disagreement with the baseline:

```
Δ(s, a) = Σᵢ |qᵢ(s, a) − qᵢ(s, a₀)|
```

Actions that all overseers score similarly to the baseline incur low penalty. Actions that trigger alarm across multiple overseers incur high penalty. Crucially, the overseers don't need to agree on what's *good* — they only need to collectively flag actions that look different from the conservative default.

One practical consideration: since overseers may use different score ranges, a single high-variance overseer could dominate the sum. In practice, overseer outputs should be normalized or calibrated to comparable scales before aggregation — the paper notes this implicit assumption, and the conformal controller's λ tuning provides some robustness, but it's worth noting for real deployments.

The agent selects actions by maximizing an oversight-regularized score:

```
Uλ(s, a) = U(s, a) − λ · Δ(s, a)
```

The parameter `λ` controls the conservatism level: at `λ = 0`, the agent ignores oversight entirely; at high `λ`, it defaults to the baseline for any action that triggers overseer concern.

## The Calibration Problem — and the Fix

The hard part is choosing `λ`. Too small and the agent does harmful things. Too large and it's paralyzed. Getting this right a priori is impossible: it depends on how reliable the oversight ensemble actually is in this deployment environment, across the specific distribution of states encountered in practice.

CCO's answer is to calibrate `λ` online using **Conformal Decision Theory (CDT)**. After each action, the agent observes whether a loss occurred and updates:

```
λₜ₊₁ = λₜ + η(ℓₜ − α)
```

where `α` is the user-specified acceptable violation rate and `η` is a step size. After a harmful action (`ℓₜ > α`), conservatism increases. After a safe one, it relaxes. No model of the environment is required. No distributional assumptions are made on the sequence of states.

One nuance worth noting: this update rule can drive `λ` negative if the agent consistently avoids losses. At `λ < 0`, the oversight-regularized score *prefers* high-penalty actions — the agent becomes less conservative than if it ignored oversight entirely. The CDT theorem's guarantee only addresses the upper bound on violations; practitioners should be aware that extended safe periods can push `λ` negative, allowing the agent to take higher-penalty actions during those windows.

This feedback loop has a provable guarantee. The paper establishes that as long as the decision family is **eventually safe** — meaning sufficiently large `λ` eventually forces the agent to select the baseline everywhere — the long-run violation rate converges to `α` with explicit finite-time bounds:

```
R̂ₜ ≤ α + ((λ̄ − λ₀)/η + 1) / (t + 1)
```

where `λ̄` is the minimum conservatism threshold beyond which the agent always selects the baseline (a finite constant that exists by the eventual-safety lemma). The bound holds for **arbitrary, even adversarial, state sequences**. No i.i.d. assumption. No stationarity. The guarantee degrades gracefully with the initial calibration gap `λ̄ − λ₀` and step size `η`, and it converges at `1/t` rate.

## Intellectual Lineage

CCO synthesizes two previously separate lines of work:

**Attainable Utility Preservation (AUP)** (Turner et al., 2020) is a method for side-effect avoidance that penalizes actions substantially changing the agent's ability to optimize auxiliary objectives. The insight: an action with large effects across many auxiliary objectives probably has large effects on the true objective too — a useful red flag even when the true objective is unknown. AUP aggregates this into a single penalty measuring deviation from a conservative baseline.

CCO generalizes AUP in two ways: it replaces Q-value functions with arbitrary scoring functions (removing the need for a complete MDP with specified reward functions), and it replaces the fixed penalty weight `λ` with online calibration yielding formal guarantees.

**Conformal Decision Theory (CDT)** (Lekeufack et al., 2024) provides the calibration machinery. CDT is a decision-theoretic analogue of conformal prediction — instead of constructing prediction intervals, it constructs decision rules that provably control long-run risk. CCO proves that its decision family satisfies CDT's required "eventual safety" property, enabling direct application of CDT's guarantees.

The synthesis is natural in retrospect: AUP handles *what* to penalize (deviation from a conservative baseline, aggregated across diverse auxiliary signals), CDT handles *how much* to penalize (adaptively, with formal guarantees). Neither ingredient alone achieves what CCO achieves together.

## Experimental Validation

The paper validates CCO on two substantially different domains:

### SWE-bench: Constraining an Adversarially Misaligned Agent

The paper constructs an adversarial version of SWE-bench, the standard benchmark for automated software engineering. A **misaligned agent** (Claude Sonnet 4.5) is instructed to fix a GitHub issue while secretly inserting a vulnerability. The **overseers** are weaker models running simpler checks — they don't know the agent's hidden objective, only whether proposed patches look unusual relative to safe alternatives.

At a target violation rate of `α = 0.10`, CCO achieves 9.7% misalignment — closely matching the target. The weaker overseers successfully constrain the stronger adversarial agent despite not being able to match its reasoning capabilities.

This is the key empirical claim for scalable oversight: **the overseers don't need to fully understand the agent to constrain it**. They just need to collectively identify when the agent's chosen action looks different from what a conservative alternative would do.

### MACHIAVELLI: Ethical Violations in Sequential Narrative Games

MACHIAVELLI is a benchmark testing AI agents on text-based strategy games with quantifiable ethical violations (harm, deception, resource acquisition). The task rewards high scores; violations are side effects of pursuing rewards through unethical means.

CCO substantially reduces violations while preserving reward. On Hero of Kendrickstone:
- At `α = 0.15`, CCO matches the unconstrained agent's reward while halving the violation rate
- At `α = 0.10`, violations track the target closely (10.9% observed vs 10% target)
- At `α = 0.05`, violations run slightly high (6.2%) — the paper attributes this to the transient term needing longer to converge at tight targets

The conformal controller's λ adapts appropriately: looser targets yield lower peak conservatism (0.82 → 0.57 → 0.49 as `α` increases from 0.05 to 0.15), confirming the algorithm calibrates rather than simply clamping to a fixed setting.

### Cross-Domain Calibration Fidelity

The paper notes a key cross-domain summary: at `α = 0.10`, CCO achieves 9.7% misalignment on SWE-bench and 10.9% violations on MACHIAVELLI — despite the environments being completely different in structure, action space, and risk profile. This calibration consistency is the central empirical thesis: **`α` is an interpretable, actionable knob that operators can set and trust**.

## Why This Matters for Deployed Systems

The practical appeal of CCO is that it's a deployment-time method — it doesn't require modifying training, doesn't require a complete model of the agent's capabilities, and doesn't require overseers to understand the agent's full goal structure.

For real-world agent deployments, this matters because:

**Diversity is load-bearing.** The penalty aggregates across multiple heterogeneous overseers. A single overseer can be fooled or bypassed; a diverse ensemble is harder to collectively mislead. This is exactly the "collective conservatism" the paper names: no individual overseer needs to be good, they just need to collectively flag deviation from the conservative default.

**The baseline anchors the safety guarantee.** The theoretical guarantee requires `ℓ(s, a₀(s)) = 0` — the baseline action must incur **exactly** zero loss by assumption. This is actually the hardest design decision in practice: choosing a baseline that's consistently achievable, unambiguously conservative, and genuinely has zero loss. The paper acknowledges this ("specifying or learning a baseline is non-trivial in some domains") but shows the conformal controller is robust across several plausible baseline choices.

**Feedback latency breaks the guarantee.** Theorem 4.10 assumes the loss `ℓₜ` is observed after every action. The paper extends to noisy and delayed feedback but notes this is a real limitation: in many deployments, ground-truth evaluation arrives sparsely or is itself estimated by a fallible judge. Systems where violations are discovered days later (e.g., social media manipulation, slowly-unfolding financial fraud) get a weaker version of the guarantee.

**Long-run rate control, not per-action guarantees.** CCO controls `α`-fraction violation *on average over time*. It is not a certificate that any individual action is safe. For tail risks — catastrophic, irreversible events that must be prevented absolutely — CCO is complementary to per-action monitoring, not a replacement for it.

## Open Questions

The framework raises interesting questions that the paper doesn't fully resolve:

**Adversarial overseers.** The theoretical guarantees assume the overseers are honest (or at least, consistent). What happens if a subset of overseers are themselves compromised or manipulated by the agent being overseen? The collective penalty aggregation provides some robustness, but the paper doesn't analyze this adversarial case.

**Baseline discovery.** In many agent deployments there's no obvious "defer" or "no-op" action. Finding a baseline that's simultaneously (1) achievable, (2) conservative, and (3) incurs zero loss is a nontrivial prerequisite. Appendix D shows robustness across several choices, but this remains a deployment gap.

**Capability gap dynamics.** Engels et al. (2025) study how scalable oversight scales with the capability gap between overseers and the overseen system. CCO's formal guarantees don't depend on the capability gap — but in practice, the overseers need to be sensitive enough to detect deviation from the baseline. As capability gaps grow, will the penalty signal remain informative?

**Non-stationarity vs. calibration drift.** The conformal controller adapts `λ` online, which handles non-stationarity. But if the agent or environment changes drastically, `λ` may need to ramp up again from scratch. The `1/(t+1)` convergence rate means new deployment regimes come with a transient period of weaker protection.

## Positioning in the Scalable Oversight Landscape

CCO's contribution is orthogonal to training-time approaches like RLHF, Constitutional AI, and process reward models. Those approaches try to produce a model that behaves well by default. CCO is a deployment wrapper that constrains behavior regardless of the underlying model's training.

This is similar in spirit to AI Control (Greenblatt et al., 2024), which also focuses on deployment-time protocols that remain robust even against actively adversarial systems. CCO's distinguishing feature is the formal statistical guarantee — AI Control provides a protocol philosophy, CCO provides a specific algorithm with a theorem.

The connection to conformal prediction is also worth noting for the security-adjacent audience. Conformal methods have seen growing application in LLM safety: controlling toxicity (Chen et al., 2025), improving factuality (Cherian et al., 2024), calibrating output properties (Overman et al., 2024). CCO extends this to sequential decision-making — the hardest setting, and the one most relevant to agentic deployments.

## Takeaway

CCO is a compact, well-motivated framework that answers a specific question: given diverse imperfect oversight signals and a designated safe baseline, how do you provably constrain an agent to a user-specified violation rate?

The answer — aggregate deviation penalties, calibrate online with a conformal controller — is elegant and comes with a genuine guarantee: finite-time bounds on violation rates, no distributional assumptions, adversarial state sequences. The empirical results on SWE-bench and MACHIAVELLI confirm the calibration holds across very different deployment regimes.

For practitioners building agent guardrails, the actionable message is: you don't need your safety monitors to be individually comprehensive. Diverse partial signals, aggregated as deviation from a conservative baseline and calibrated online, can provably bound the rate at which an adversarially misaligned stronger agent causes harm.

---

*Source: [arXiv:2605.28807](https://arxiv.org/abs/2605.28807) — Overman et al., ICML 2026. "Calibrating Conservatism for Scalable Oversight." Submitted 27 May 2026.*
