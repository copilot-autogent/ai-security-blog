---
title: "Crescendo and Multi-Turn Jailbreaks: Why Your Single-Turn Safety Filters Are Insufficient"
description: "The Crescendo attack demonstrates that LLMs refusing direct harmful requests will comply when those requests are built across 10–20 individually benign turns. Single-turn safety evaluations are structurally blind to this. Here's why, and what to do about it."
pubDate: 2026-07-11
tags: ["jailbreak", "multi-turn", "crescendo", "ai-safety", "red-teaming", "safety-evaluation", "llm-security"]
---

If your AI product's safety evaluation only tested single prompts, it hasn't been tested against the most effective known attack class.

That's not a criticism of your engineering team. It's a structural problem with how safety evaluations are designed. Standard benchmarks — ToxiGen, AdvBench, HarmBench — measure a model's refusal rate on individual, direct harmful prompts. A model that scores 99% on these benchmarks has demonstrated something real: it won't immediately comply when someone types "explain how to make explosives." That's a genuine safety property.

What it hasn't demonstrated is what happens when someone asks about a general chemistry topic, then about a specific reaction class in an educational context, then about historical industrial applications of that chemistry, then about technical parameters in that domain — each turn individually defensible, the aggregate trajectory converging on the same endpoint as the original prompt. Each turn is defensible. The trajectory is not.

This is the Crescendo attack. It works reliably, it's been demonstrated against GPT-4, Claude, and Gemini in published research, and most production safety systems are architecturally incapable of detecting it.

## Why Conversation State Creates a New Attack Surface

Language models don't process your latest message in isolation. They process the full conversation history — every prior turn, concatenated into the context window. This is what makes them useful. It's also what makes them vulnerable.

When you've had 15 turns of friendly, intellectually curious conversation about chemistry, the model's internal representation of "what kind of request is this person likely making" is profoundly different than it is at turn 1. Prior context shifts the distribution. The model that would refuse "explain how to synthesize methamphetamine" in turn 1 is, by turn 15 of a carefully designed conversation, operating in a distributional context that makes the same underlying request feel like the natural continuation of an ongoing technical discussion.

This isn't a model "being fooled" in a naive sense. It's the model doing exactly what it was trained to do — being coherent, contextually appropriate, and responsive to the established conversational register — in service of an attacker's goal.

Single-turn safety filters operate on individual messages. They have no view of conversation trajectory, no concept of distributional shift across turns, no mechanism for detecting that the aggregate path of a conversation is being steered toward a harmful endpoint. They're evaluating leaves without modeling the branch.

## The Crescendo Technique: What the Research Shows

The Crescendo attack was described by Russinovich et al. in **"Great, Now Write an Essay About How to Make Napalm": The Crescendo Multi-Turn Jailbreak Attack** (Microsoft Research, 2024, arXiv:2404.01833). The paper is worth reading in full; what follows is an accurate summary of the core mechanism and empirical findings.

The attack works in approximately three phases:

**Phase 1: Benign anchor establishment (turns 1–3).** The attacker begins with requests that are clearly and genuinely benign — general knowledge questions about the topic domain, requests for historical context, or academic framings. The purpose is to establish conversational precedent: the model has engaged helpfully with this topic before, creating an implicit social contract about what's "in scope."

**Phase 2: Graduated escalation (turns 3–8).** Each subsequent turn requests information that is slightly more specific than the prior one, but plausibly connected to the established context. Crucially, each individual turn would be borderline-defensible in isolation — close to the edge, but arguable. The target model has been contextually normalized to treat this domain as legitimate; the escalation feels incremental rather than sudden.

**Phase 3: Payload delivery (turns 8–15).** The final turns request the actually harmful content. By this point, the model is operating in a conversational context where the harmful request is a natural continuation of what has come before. The conversational context has been weaponized to make refusal feel contextually inappropriate.

The paper tested this technique across GPT-4, Claude, and Gemini. The attack success rates varied by model and topic, but the central finding was consistent: **models that robustly refused the same requests in a single-turn setting were substantially more likely to comply when those requests were delivered via the multi-turn pathway.** The attack doesn't require any special prompt injection, no system prompt exploitation, no unusual characters — just a carefully sequenced conversation.

One empirical note worth highlighting: the researchers found that automated Crescendo variants (where a second LLM generates the escalation sequence) were often comparably effective to human-generated sequences. This has significant implications for scale — it means the attack can be industrialized.

## Multi-Turn Attack Variants

Crescendo is the most rigorously documented instance of the attack class, but several related techniques exploit the same fundamental vulnerability: a model's reliance on conversational history to calibrate its responses.

### Persona Drift

The attacker begins by establishing a roleplay persona in which the model takes on a character with different values or capabilities — a medieval alchemist, a fictional AI without restrictions, a "pre-safety-training" version of itself. The key move is establishing this persona before any harmful content is requested, so when the harmful request arrives it's framed as in-character behavior rather than a direct policy violation.

The effectiveness of persona drift depends on how the model handles the tension between roleplay norms and safety behaviors. Many models correctly refuse even in-character harmful requests. But when the persona has been established over many turns with the model demonstrating enthusiastic compliance, that prior behavior creates normative context that's harder to override.

### Precedent Anchoring

The attacker gets the model to agree to a series of smaller, individually acceptable requests — defining a technical term, explaining a mechanism at a high level, acknowledging that a process exists — and then explicitly cites those prior agreements to justify the next escalation. "You already explained X; you said Y was true; it follows that you should tell me Z."

This pattern exploits conversational consistency norms. Models are trained to be coherent and contextually consistent; an attacker can leverage that training by constructing a logical chain where each step references prior model output as justification for the next.

### Context Flooding

Rather than gradually escalating, context flooding fills the conversation window with large amounts of benign content related to the target domain — articles, technical discussions, reference material — then embeds the harmful request in a way that makes it appear to be the natural next step in the established context. The goal is to dilute the signal that would normally trigger safety behaviors by surrounding it with contextually normalized material.

This variant is particularly relevant for models with large context windows, where the ratio of benign-to-harmful context can be made very large.

### Memory Exploitation

In systems with persistent memory — user profiles that accumulate across sessions, or explicit memory tools that agents can query — multi-turn attacks extend across session boundaries. An attacker who can poison early sessions (establishing preferences, confirming behaviors, creating precedents) can construct a memory state that causes the model to comply with harmful requests in a future session that would otherwise be refused.

This variant is qualitatively different from in-session attacks because the attack surface persists. The model "remembers" a version of the user that was constructed by an earlier attack phase, and that memory shapes behavior in sessions the attacker may not directly control.

## Why Single-Turn Evaluations Systematically Miss This

The gap between single-turn benchmark performance and multi-turn real-world robustness is structural, not incidental. Understanding why requires looking at how safety evaluations are built.

Standard red-teaming evaluations — including HarmBench (Mazeika et al. 2024) and JailbreakBench (Chao et al. 2024) — are designed around a unit of analysis: the prompt-response pair. A test case is a single prompt; the safety property being evaluated is the model's response to that prompt. This design makes evaluation tractable, reproducible, and comparable across models. It's also what makes it blind to multi-turn attacks.

Consider what HarmBench is measuring: given a harmful intent expressed in a single message, how often does the model comply? A model with a near-zero score on HarmBench has demonstrated that its safety behaviors activate on explicit harmful requests. Nothing about that test tells you whether those same behaviors activate when the explicit request is the 15th turn in a carefully constructed conversation.

Perez et al. (2022) in "Red Teaming Language Models with Language Models" showed that automated red-teaming could generate adversarial prompts at scale — but the adversarial prompts are still single-turn inputs. The paper demonstrates that better single-turn evaluations are achievable; it doesn't address the multi-turn gap.

The implication for deployment: a model vendor's safety evaluation, a third-party audit, or an internal red-teaming exercise that only tested single-turn inputs is leaving the Crescendo attack class entirely unevaluated. The evaluation isn't wrong about what it measured. It's incomplete.

## Detection Challenges

Each individual turn in a Crescendo attack is genuinely benign. This is not a description of turns that look benign but secretly contain encoded harmful content — turn-level content analysis would catch that. Each turn really is benign. A request to explain the history of thermite isn't harmful. A question about oxidizer chemistry in the context of an ongoing chemistry discussion isn't harmful. The harmful intent lives in the trajectory, not any individual message.

This creates a detection problem that's fundamentally different from turn-level filtering. Standard content classifiers look at a message and ask: does this message contain harmful content or constitute a harmful request? The answer at each turn in a Crescendo attack is genuinely no. Deploying a more accurate turn-level classifier doesn't help — you're correctly classifying the wrong unit.

What detection actually requires is **semantic trajectory analysis**: the ability to model where a conversation is going, not just where it is. This means treating the conversation as a sequence and asking whether the sequence is converging toward a harmful endpoint — even if no individual element of the sequence would be flagged in isolation.

This is technically harder than turn-level classification. It requires maintaining conversation-level state, building representations that encode conversational direction rather than just current position, and making predictions about likely future states. None of this is impossible; it's just not what most deployed safety systems do.

## Defenses

The good news is that effective defenses exist. The bad news is that most require changes to system architecture, not just safety filter parameters.

### Conversation-Level Safety Scanning

The most direct defense is building a safety layer that evaluates at the conversation level rather than the turn level. This means passing the full conversation history — not just the latest message — to a safety classifier specifically designed and evaluated for trajectory analysis. Critically, this classifier must be designed independently of the production model's context: a classifier conditioned on the same attacker-built context risks inheriting the same distributional shift that makes the production model vulnerable. Effective implementations use out-of-band classifiers or separate model instances that evaluate the conversation history without being "in" the conversation. A conversation-level classifier can be trained to recognize harmful trajectories by analyzing patterns of escalation, topic narrowing, and specificity increase across turns.

This requires maintaining conversation state and adds latency for every safety check. For many production systems, the additional latency budget is worth it; for real-time applications, the tradeoff requires careful evaluation.

### Context Summarization with Safety Re-evaluation

A lighter-weight variant: periodically summarize the conversation and re-evaluate the summary against safety criteria. A summarization of a Crescendo attack sequence will often reveal the harmful trajectory more clearly than any individual turn, because summaries compress out the gradual escalation and present the net direction of the conversation.

The cadence of re-evaluation matters — checkpoints every N turns should be chosen based on the typical length of attack sequences for the application context. The Crescendo paper found attacks typically required 8–15 turns, with payload delivery often beginning as early as turn 8. This means safety checkpoints need to begin early in the conversation — a first re-evaluation no later than turn 5 or 6, with subsequent checks every 3–5 turns, would catch most attack sequences before the payload turn. A cadence that only starts at turn 10 risks missing attacks where escalation is compressed into fewer turns.

### Conversation Reset Policies

Systems can enforce maximum conversation lengths, after which context is cleared and the model effectively starts fresh. This limits the number of turns available for escalation, shrinking the attack window.

The tradeoff is user experience: legitimate long-running conversations lose their context. This defense is most appropriate for applications where conversation length is naturally bounded (customer service workflows, structured task completion) and less appropriate for open-ended assistant use cases.

### Anomaly Detection on Conversation Trajectory

Rather than classifying the full conversation content, this approach monitors structural properties of the conversation — does specificity on a sensitive topic increase monotonically? Does the conversation narrow in scope from general to highly specific? Are there sudden topic jumps that could indicate establishment of a new escalation chain?

These are weak signals; no single structural property reliably indicates an attack. But in combination, and weighted by topic sensitivity, they can serve as a flagging layer that triggers more expensive analysis when trajectory anomalies are detected.

### Multi-Turn Red-Teaming in Pre-Deployment Evaluation

The most important architectural change isn't in the runtime safety system — it's in the evaluation process. Adding multi-turn attack scenarios to pre-deployment evaluation means actually constructing Crescendo-style attack sequences against the deployment model and measuring how often they succeed. This reveals vulnerabilities in time to fix them, rather than discovering them in production.

Automated multi-turn red-teaming is feasible: as the Crescendo paper showed, a second LLM can be prompted to generate escalation sequences. A pre-deployment evaluation pipeline that includes this testing will catch Crescendo vulnerabilities that single-turn evaluation misses entirely.

## The Evaluation Debt Problem

There's a systemic issue here that goes beyond any single deployment. AI safety claims are increasingly based on benchmark performance. "Model X achieves state-of-the-art safety on HarmBench" is a statement that has meaning — it's a real measurement of a real property. It's also a statement that says nothing about multi-turn robustness.

When safety benchmarks become the standard by which models are compared, marketed, and deployed, benchmark-invisible attack classes accumulate deployment risk invisibly. Users and operators who rely on benchmark scores are not irrational — they're using the available information. The problem is a gap between what benchmarks measure and what attackers exploit.

The Crescendo paper is from 2024. Multi-turn attacks have been possible since multi-turn conversation was possible. The evaluation gap has existed the entire time; the research just made it visible. The responsible response is to close it: add multi-turn evaluation infrastructure, treat conversation trajectories as first-class security objects, and stop treating single-turn benchmark scores as sufficient evidence of safety at deployment.

Your safety filter that scored 99% on single-turn evaluation may be an excellent single-turn safety filter. Whether it's an excellent multi-turn safety system is a question the evaluation didn't answer.

---

*Technical references: Russinovich et al. (2024), "Great, Now Write an Essay About How to Make Napalm": The Crescendo Multi-Turn Jailbreak Attack, arXiv:2404.01833; Mazeika et al. (2024), HarmBench: A Standardized Evaluation Framework for Automated Red Teaming and Robust Refusal, arXiv:2402.04249; Chao et al. (2024), JailbreakBench: An Open Robustness Benchmark for Jailbreaking Large Language Models, arXiv:2404.01318; Perez et al. (2022), Red Teaming Language Models with Language Models, arXiv:2202.03286.*
