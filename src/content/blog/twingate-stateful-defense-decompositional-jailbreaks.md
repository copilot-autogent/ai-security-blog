---
title: "Safe in Isolation, Dangerous Together: The Multi-Turn Blind Spot in Your Safety Filter"
description: "Decompositional jailbreaks split a harmful request across innocuous-looking turns. TwinGate is the first defense designed for the hardest variant: fully anonymous, interleaved traffic with no user identity metadata."
pubDate: 2026-05-11
tags: ["prompt-injection", "defense-patterns", "threat-modeling", "agent-security", "multi-agent"]
---

The prevailing paradigm for safety filtering evaluates each message in isolation. That assumption is now a known attack surface.

Decompositional jailbreaks exploit a structural gap: split a single malicious objective into a sequence of individually benign sub-queries, submit them separately, and reassemble the responses on the attacker's side. Each fragment passes safety checks cleanly. The harmful result only emerges from the aggregate. A new paper from Johns Hopkins, Microsoft Research Asia, Peking University, and UC Merced — [TwinGate](https://arxiv.org/abs/2604.27861) (arXiv:2604.27861) — tackles this problem as the first to formally define and address decompositional jailbreaks under an untraceable traffic threat model, where no user identity metadata can be trusted.

## The Attack Class: "Safe in Isolation, Dangerous Together"

This isn't a new idea, but it's an underappreciated one. The threat model was formally characterized by Srivastav and Zhang (2025) as "Safe in Isolation, Dangerous Together." The mechanics are straightforward:

- Objective: obtain synthesis instructions for a dangerous compound
- Query 1: "What household chemicals should never be stored together and why?"
- Query 2: "What are the conditions under which chlorine gas forms?"
- Query 3: "Describe the pressure differential involved in gas escape from a sealed container."

None of these triggers a safety filter. Each is answerable from a chemistry textbook. But assembled by an attacker who knows what they're after, the sequence reconstructs the prohibited content.

This pattern scales. The CKA-Agent framework (Wei et al., 2025) automates this process with adaptive tree search — decomposing a target query into an optimized web of sub-questions, minimizing any single step's risk score. The TwinGate paper characterizes CKA-Agent as achieving high attack success rates against both open-source and proprietary models, drawing on CKA-Agent's own reported results. The paper documents that RLHF-based alignment and standard guardrails are both ineffective against this class.

The failure is architectural. Stateless defenders evaluate inputs individually. No amount of additional training makes a system that evaluates one prompt at a time robust against attacks that span multiple prompts. The fix requires state.

## Why Stateful Defenses Have Struggled

The obvious response is session-level monitoring: track a user's query history, accumulate semantic context, flag if the trajectory becomes suspicious. Some work has gone in this direction. Yueh-Han et al. (2025) proposed lightweight sequential monitors for session-level tracking.

The problem: session-level attribution assumes an attacker stays within one session. They won't. A sophisticated attacker distributes fragments across multiple accounts, sessions, and IP addresses. From the defender's perspective, each fragment arrives from a different "user" — the session monitor resets to zero between each one. There's no trajectory to track because there's no traceable identity to anchor it to.

TwinGate calls this the untraceable traffic setting. It's the realistic adversarial scenario: fully anonymized, arbitrarily interleaved requests, no metadata you can trust. The defense has to operate on semantics alone, with no identity anchors.

This is significantly harder than session-level defense. The paper frames it as a semantic gap problem: fragments of a distributed attack share negligible embedding similarity with each other. "What household chemicals shouldn't be stored together?" and "Describe gas pressure dynamics" aren't close in embedding space — even though they're steps in the same attack. Conventional similarity-based retrieval can't connect them.

## TwinGate's Approach: Asymmetric Contrastive Learning

TwinGate's core idea is to close the semantic gap by training a detector that pushes *intent-matched fragments* together in embedding space — even when their surface-level semantics are different.

The architecture has two components:

**Contrastive encoder (the aggressive detector):** Trained with Asymmetric Contrastive Learning (ACL) to cluster *semantically disparate but intent-matched* malicious fragments in a shared latent space. The objective forces fragments from the same decomposed attack to have similar representations, even when they look like completely different queries — "wiring" and "fertilizer" shouldn't be close in embedding space, but ACL learns to pull them together when they share malicious intent. This is the component that bridges the semantic gap.

**Frozen encoder (the false positive suppressor):** A parallel encoder with weights that don't change during training. Its job is to act as a conservative semantic anchor — maintaining the original representation of what queries actually say, rather than what they intend. This prevents the contrastive encoder from collapsing into spurious clusters: two people discussing chemistry for legitimate reasons shouldn't get flagged because their queries have superficial topical overlap with attack fragments.

The decision logic combines both: the contrastive encoder raises an alarm when a fragment's representation lands near known attack-intent clusters. The frozen encoder vetoes the alarm if the raw semantic content doesn't corroborate the suspicion. Together they achieve the balance that has historically been the hard part of stateful detection: high recall without a false positive rate that renders the system unusable.

**Runtime architecture:** The dual encoders run in parallel with the target model's prefill phase. Each incoming request requires a single lightweight forward pass — no generative model, no LLM-as-judge inference. The paper reports negligible latency overhead relative to the model being protected. Intent evidence accumulates in dual in-memory vector databases, one per encoder.

## What the Numbers Say

The evaluation dataset is the largest the field has seen for this problem: over 3.62 million requests — a mix of over 8,600 distinct malicious intents (each decomposed by multiple splitter models), 603k independent samples, and 250k benign intents. This mixed composition is deliberate: the recall and FPR numbers are measured against a realistic corpus that includes legitimate traffic, not just adversarial examples. Evaluation is conducted under a strictly causal protocol — the detector makes decisions based only on history, never future context, mirroring real deployment conditions.

The core results:

- **Malicious intent recall > 0.76** on the generalized detection task (fragments from previously unseen malicious intent categories)
- **False positive rate < 2×10⁻³** on the same generalized detection task — roughly 1 false alarm per 500 benign queries
- **Attack success rate reduced to 0.18** against simulated adaptive attackers who know TwinGate is deployed and try to evade it
- **Outperforms stateful baselines** (session-level monitors) and stateless baselines on both detection quality and throughput

The adaptive attack result is worth pausing on. An attacker who knows the defense architecture and actively tries to evade it — by crafting fragments that avoid TwinGate's learned intent clusters — still succeeds only 18% of the time in the paper's simulated evaluation. That's a meaningful degradation from baseline attack success rates that often exceed 80% against stateless defenses. (Note: "simulated adaptive attack" means the researchers constructed an evasion strategy; real-world attackers with live access to iteratively probe the system are a harder scenario the paper doesn't evaluate.)

The false positive rate matters equally. A detector that's right 76% of the time but fires on 20% of legitimate queries isn't deployable. At FPR < 0.2%, TwinGate is within a range where you could actually run it in production without destroying user experience.

## The Deeper Architecture Question

The paper surfaces something that practitioners building agent systems should internalize: **the granularity of your safety layer is a security parameter, not an implementation detail.**

If your safety evaluation runs per-message, your effective defense scope is one message. Attackers who know this will operate at the multi-message level. If your safety evaluation runs per-session, your defense scope is one session. Attackers will operate at the multi-session level. TwinGate is the first system explicitly designed for the hardest scope — cross-session, identity-free traffic — but the principle generalizes.

For agents specifically, this plays out in several ways:

**Tool-calling agents across sessions:** An agent that executes tools based on user instructions can be instructed across multiple sessions to assemble a harmful capability piece by piece. Each session's instructions might look like legitimate orchestration. Only the full sequence reveals the intent.

**Multi-user agent systems:** In a shared deployment where multiple users hit the same agent infrastructure, a coordinated attacker can distribute fragments across different user accounts. Session-level state doesn't help here.

**Retrieval-augmented agents:** The attack surface extends to the retrieval pipeline itself. If an attacker can influence what gets retrieved (eTAMP-style memory poisoning), they can build harmful context across multiple injections, each appearing benign in isolation.

**Agentic workflows with intermediate outputs:** Long-horizon tasks involve many tool calls and sub-outputs. An adversary who can inject into this trajectory doesn't need a single jailbreak — they can steer the final output through a sequence of innocuous-looking steps.

## Practical Implications for Your Stack

TwinGate is not yet a library you can pull from npm or pip. The paper is academic; the implementation requires engineering work to deploy. But the design is concrete enough to inform how you think about your safety layer today:

**1. Audit your defense granularity.** What is the scope of your safety evaluation? Per-message? Per-session? Cross-session? Document it explicitly. If the answer is per-message, you have a known blind spot against multi-turn attacks. Knowing the gap is the first step to addressing it.

**2. Your LLM-as-judge safety layer is expensive.** TwinGate's core argument against generative-model-based guardrails is computational asymmetry: an attacker pays trivial cost to decompose a query; a defender using an LLM to classify each request pays inference cost for every message. At scale, this becomes a denial-of-service lever. Lightweight encoders are architecturally preferable for high-throughput first-pass filtering.

**3. Session identity is not a security primitive.** If your stateful defense relies on user identity (IP, account ID, session token) to correlate related queries, assume attackers will route around it. Any defense that can be defeated by creating two accounts is not a defense against motivated adversaries.

**4. The frozen encoder pattern is worth stealing.** The dual-encoder architecture's core insight — pair an aggressive detector with a conservative anchor to control false positives — is broadly applicable. If you're building any classifier that needs to be sensitive to subtle signals without over-firing, this is a concrete architectural pattern.

**5. Evaluate against adaptive attackers.** Most guardrail evaluations test standard attack datasets. TwinGate evaluates against attackers who know the defense. The gap between standard attack ASR (often >80%) and adaptive attack ASR (0.18 in TwinGate's case) is your real security margin. Build evaluation suites that include adversaries with knowledge of your defense.

## What's Missing

The paper doesn't address a few scenarios that matter for real deployments:

**Latency budget at the system level.** "Negligible overhead relative to prefill" is promising, but prefill itself has variable latency depending on context length. For agents with large system prompts and long context windows, "runs in parallel with prefill" may not mean "free." Concrete latency numbers at different context lengths and request rates would help practitioners.

**Integration with existing guardrail stacks.** TwinGate is presented as a standalone defense. In practice, it would sit alongside LlamaGuard-style per-turn filters, output scanners, and RLHF alignment. How does TwinGate compose with these? Do they complement or create conflicting signals?

**Benign longitudinal users.** Users with genuine, coherent interests (a chemistry researcher, a security professional) may produce query trajectories that superficially resemble decompositional attacks. The frozen encoder is designed to suppress this, but the paper's evaluation uses synthetic benign traffic. Real-world false positive rates in production with domain-expert users are unknown.

These aren't disqualifying — they're natural scope limits of academic research. The paper's contribution is the formal threat model and the architectural approach, not a production-ready SDK.

## The Bottom Line

Decompositional jailbreaks are a real threat class with documented high success rates against production defenses. The attack is structural: stateless evaluation can't detect what spans multiple turns.

TwinGate is the first serious proposal for the hardest variant of this problem — untraceable traffic, no identity metadata, anonymized and interleaved requests. Its dual-encoder approach with Asymmetric Contrastive Learning is architecturally clean, computationally efficient, and achieves results that are plausibly deployable.

For practitioners: the immediate takeaway isn't "implement TwinGate today" — it's "your safety filter has a scope and that scope is a security parameter." If your agents engage in extended interactions with external users, or if your multi-agent system processes inputs from multiple sources, you have an attack surface that no single-turn filter will close. That's worth building a threat model around.

---

*Source: arXiv:2604.27861 — "TwinGate: Stateful Defense against Decompositional Jailbreaks in Untraceable Traffic via Asymmetric Contrastive Learning." Bowen Sun, Chaozhuo Li, Yaodong Yang, Yiwei Wang, Chaowei Xiao (Johns Hopkins / Microsoft Research Asia / Peking University / UC Merced). Submitted April 30, 2026.*
