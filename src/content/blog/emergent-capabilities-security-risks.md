---
title: "Emergent Capabilities as Security Risks: What AI Systems Can Do That Nobody Planned For"
description: "LLMs spontaneously develop capabilities not explicitly trained—and this creates unpredictable security properties that defenders can't anticipate from static model cards or one-time capability evals."
pubDate: 2026-06-28
tags: ["capability-evaluation", "threat-modeling", "model-cards", "emergent-behavior", "ai-governance"]
featured: false
---

In 2022, a Google research team published a paper that quietly unsettled the AI security world. They documented something that shouldn't happen if language models were simply memorizing and pattern-matching: at certain parameter scales, models spontaneously developed capabilities they hadn't been trained on, without warning, without gradual improvement curves, and without anyone planning for it.

Wei et al. called this phenomenon **emergent abilities**: skills that appear sharply at scale thresholds rather than improving continuously. Below threshold, a model scores near chance on a task. Cross the threshold, and it suddenly succeeds at rates far above chance.

For capability evaluation and security, this is not a curiosity. It's a core threat.

---

## What Emergence Actually Means

The term "emergent capability" gets used loosely, so let's be precise. In the Wei et al. framework, an emergent ability has two characteristics:

1. **Discontinuity**: It doesn't appear gradually. There's a threshold—measured in parameters, compute, or data—below which the capability is essentially absent and above which it appears.
2. **Unpredictability**: It can't be anticipated by linear extrapolation from smaller models.

The original paper documented dozens of examples: chain-of-thought reasoning (models spontaneously solving multi-step problems when prompted with "let's think step by step"), multi-step arithmetic, code execution planning, analogical reasoning, and calibration of uncertainty estimates.

None of these were explicitly optimized for. They emerged.

The security implications follow directly: **if capabilities appear unpredictably, capability evaluations performed before deployment don't necessarily describe the system you're operating.**

---

## The Deployment Gap Problem

Consider a realistic enterprise scenario. A security team evaluates a language model for deployment as a document summarization service. They run standard capability evals: summarization quality, factual accuracy, hallucination rate, content policy adherence. The model passes. It gets deployed.

Twelve months later, the vendor releases a fine-tuned update—same model family, more training data, slightly more parameters. The security team reviews the model card. Summarization quality improved. No new concerning behaviors flagged.

What they don't know: the updated model has crossed a scale threshold at which code comprehension capability has emerged. The summarization service now has an unreported ability to analyze code snippets in documents, understand exploit patterns described in incident reports, and synthesize that understanding into outputs the security team never evaluated.

This isn't hypothetical. The broader pattern is well-documented. GPT-4 at deployment had capabilities—multilingual reasoning, multi-modal inference, long-context synthesis—that weren't fully characterized in the original GPT-4 technical report. Red teamers at external organizations found behaviors that hadn't surfaced in OpenAI's internal evaluations, not because OpenAI was negligent, but because emergent capabilities at that scale were genuinely difficult to enumerate exhaustively.

The challenge isn't vendor bad faith. It's that **the capability surface of a frontier model is not a fixed, enumerable set.**

---

## Dark Emergence: What Adversaries Find First

The most operationally dangerous variant of emergence isn't the capability that appears on benchmarks. It's the capability that appears in adversarial probing *before* it shows up in standard evaluations.

Call this **dark emergence**: latent capabilities that don't surface under normal operating conditions but appear when inputs are specifically constructed to elicit them.

A model deployed for customer support may have a latent capability for generating persuasive text that its standard safety evaluations never discovered, because safety evals typically use naturalistic inputs, not adversarially crafted ones. An attacker probing the system with iterative queries specifically designed to elicit persuasive framing may surface this capability before any benchmark does.

This creates an asymmetric threat:

| Actor | Discovery Method | Timeline |
|-------|-----------------|---------|
| **Vendor/deployer** | Standard benchmarks, model cards | May lag by months or years |
| **Red teamers (internal)** | Structured adversarial probing | Weeks to months post-deployment |
| **External attackers** | Opportunistic probing + automated capability scanning | Whenever they choose to look |

METR (previously ARC Evals) capability evaluation framework formalizes this asymmetry as a core problem in AI safety evaluation. Their methodology explicitly includes adversarial capability elicitation—testing models under conditions specifically designed to surface latent capabilities—because experience with frontier models demonstrated that standard evaluation misses significant fractions of the capability surface.

The AI Safety Institute capability evaluations (published by DSIT in the UK) adopt a similar posture: capabilities must be tested under conditions where an adversary is actively trying to elicit them, not just under expected use conditions.

---

## Cross-Task Capability Spill

Emergent capabilities don't respect deployment context boundaries.

A model trained heavily on code may develop emergent formal reasoning capabilities that weren't explicitly optimized for. When that model is deployed in a non-code context—say, as a legal document analyzer—those formal reasoning capabilities are present whether or not the deployment team is aware of them. An attacker who knows the base model's training distribution can craft inputs that activate these capabilities in the deployed context.

This is **cross-task capability spill**: a capability that emerged from one training objective surfaces in a deployment context that wasn't evaluated for it.

Documented examples include:

- **Multilingual generalization**: Models trained primarily on English develop emergent non-English language capabilities. Jailbreaks and safety bypasses that don't work in English sometimes work in lower-resource languages, because the safety training coverage in those languages is thinner than the underlying capability.
- **Code generation in text-focused deployments**: Models fine-tuned for text tasks often retain significant code generation capability from base training. Systems deployed without code execution permissions may still generate functional code if prompted correctly.
- **Instruction following with implicit authority framing**: As models scale, they develop more sophisticated understanding of authority and delegation. Models deployed without explicit system-level privilege contexts may nonetheless respond differently to inputs framed as administrator commands versus user requests.

Each of these represents a capability the deployment model card may not fully characterize, because the capability emerged from base training rather than fine-tuning, and the deployment context was never tested for it.

---

## The Continuous Audit Imperative

The conventional security posture for AI systems treats capability evaluation as a pre-deployment checkpoint. You evaluate the model before you deploy it. You document what it can do. You build controls accordingly.

This posture fails against emergence for three reasons:

**1. Models update.** A fine-tuned update, a different inference configuration, a change in system prompt—any of these can shift the model's effective capability surface. The model card from last quarter describes last quarter's model.

**2. Context shifts capability expression.** The same base model can express different capabilities depending on deployment context, system prompt configuration, and user interaction patterns. A capability that doesn't appear in isolation may appear when the deployment accumulates context across a session.

**3. New evaluation methods surface previously invisible capabilities.** As adversarial probing techniques improve, evaluators routinely surface capabilities in existing models that prior evaluations missed. The capability was always there. The evaluation methodology didn't reach it.

Anthropic's model card methodology has begun formalizing continuous evaluation as a requirement rather than a best practice: model cards should specify capability evaluation schedules, not just point-in-time results. But the industry standard—a single capability disclosure document at launch—remains static by default.

For security teams operating deployed AI systems, the implication is that **model cards require active expiration tracking**. A model card older than the most recent significant model update should be treated as potentially stale, and the evaluation scope that produced it should be reviewed against any updates to the model's training, fine-tuning, or inference configuration.

---

## The Policy Response

Regulators are beginning to require capability disclosure, though the frameworks are still immature.

**EU AI Act (2024)**: High-risk AI systems are required to maintain technical documentation that includes a description of the system's capabilities and limitations. For general-purpose AI models above certain compute thresholds, providers must conduct model evaluations, assess and mitigate systemic risks, and report incidents. However, the current text doesn't specifically address emergent capabilities or require continuous re-evaluation as models update.

**NIST AI Risk Management Framework (AI RMF 1.0)**: The AI RMF includes capability tracking under the Govern, Map, and Measure functions. Specifically, the Measure function calls for AI risk measurements to be taken "throughout the AI lifecycle," which implies continuous rather than point-in-time evaluation. The framework stops short of mandating specific capability evaluation methodologies, but the principle of lifecycle-continuous measurement applies directly to the emergence problem.

**EU AI Act vs. NIST AI RMF on emergence:**

| Dimension | EU AI Act | NIST AI RMF |
|-----------|----------|------------|
| Capability disclosure required | Yes (for high-risk + GPAI above threshold) | Recommended, not mandated |
| Continuous re-evaluation | Implicit in incident reporting | Explicit in Measure function |
| Emergent capability specifically addressed | No | No |
| Adversarial capability testing | Not specified | Not specified |

The gap matters: neither framework currently requires the adversarial capability elicitation that METR's methodology treats as essential. Regulatory requirements trail the technical reality of how capability surfaces are actually discovered.

For practitioners, this means compliance with current frameworks is necessary but not sufficient. Meeting EU AI Act capability disclosure requirements doesn't guarantee that dark emergence has been evaluated. Organizations operating at the capability frontier need to go beyond compliance baselines.

---

## A Working Framework for Practitioners

Given the above, here's a security-oriented framework for managing emergent capability risk in deployed AI systems:

**1. Treat the model card as a living document with a freshness date.**
Every model card or capability disclosure should carry an associated evaluation date and scope description. When the base model updates, the evaluation date resets.

**2. Define a minimum re-evaluation trigger set.**
Not every model update requires full capability re-evaluation, but some do. Define explicit triggers: a change in parameter count, a new fine-tuning dataset, a change in base model version, any reported capability finding by a third party.

**3. Include adversarial capability elicitation in evaluations.**
Standard benchmarks are insufficient. Evaluations should include structured adversarial probing specifically designed to surface capabilities not expected in the deployment context. The METR capability evaluation framework and AISI evaluation protocols provide starting methodologies.

**4. Monitor for anomalous behavior patterns that suggest unexpected capabilities.**
In production, anomalous output patterns—outputs that don't match the expected capability distribution—can be an early signal that a capability has emerged or been elicited. Runtime behavioral monitoring isn't just a safety control; it's an early warning system for undiscovered capabilities.

**5. Audit cross-task capability risk at deployment.**
For any model deployment, explicitly assess the capability profile of the base model (not just the fine-tuned version) against the deployment context. Capabilities that exist in the base model don't disappear with fine-tuning; they may be suppressed but can be elicited.

---

## The Fundamental Challenge

The security problem posed by emergent capabilities is fundamentally different from conventional vulnerability management. In conventional software security, a vulnerability is a specific flaw in a specific system that can be enumerated, patched, and verified fixed. The attack surface, while large, is in principle exhaustible.

Emergent capabilities in large language models don't work this way. The capability surface isn't a fixed set. It expands as scale increases, changes when context shifts, and can only be partially characterized by any finite evaluation. New evaluation methods routinely surface capabilities that previous evaluations missed—not because the capability appeared, but because the evaluation reached it for the first time.

This means that the security model for AI systems needs to treat **unknown capabilities** as a standing threat category, not a gap to be closed by better documentation. Every frontier model deployment has a capability surface that extends beyond its model card. The security question isn't whether unknown capabilities exist. It's how to build systems that remain safe when they're elicited.

That's a harder problem than conventional vulnerability management. And it doesn't yet have a fully adequate solution.

---

## References

- Wei, J., et al. (2022). [Emergent Abilities of Large Language Models](https://arxiv.org/abs/2206.07682). *Transactions on Machine Learning Research*.
- Anthropic. (2024). Model Card Methodology and Claude Model Cards.
- METR (ARC Evals). Autonomy Evaluation Framework. [metr.org](https://metr.org).
- AI Safety Institute (DSIT). (2024). Capabilities Evaluation Framework.
- NIST. (2023). AI Risk Management Framework 1.0. [NIST AI RMF](https://airc.nist.gov/RMF_Overview).
- European Parliament. (2024). EU AI Act (Regulation 2024/1689).
- OpenAI. (2023). GPT-4 Technical Report. [arXiv:2303.08774](https://arxiv.org/abs/2303.08774).
