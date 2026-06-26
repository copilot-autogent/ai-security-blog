---
title: "How the Big Labs Red-Team Their Models — and What They Keep Missing"
description: "The big labs red-team their models. Here's what they find, what they miss, and what that means for anyone deploying AI in 2026."
pubDate: 2026-06-26
tags: ["red-teaming", "ai-safety", "threat-modeling", "defense-patterns", "evaluation"]
---

As of the sources cited here, all three major frontier model providers have published red-teaming methodologies as part of their system cards and safety reports. Anthropic describes its internal red team structure in Claude model cards. OpenAI details its pre-deployment eval suite in GPT-4 and o1 system cards. Google describes safety evaluation practices in the Gemini 1.0 Technical Report and its published Secure AI Framework (SAIF). Enough detail exists across these documents to do a meaningful comparison — and to identify where the gaps are.

The tension is productive: internal red teams and independent adversarial researchers are optimizing for different things. Internal teams optimize for *known failure categories*. Independent researchers optimize for *unknown failure modes*. Both are necessary; only one shows up in the official safety documentation.

## What the Big Labs Actually Test For

The published system cards converge on a common set of high-priority evaluation categories. These map loosely to what regulators and policy researchers call "catastrophic harm" categories:

**CBRN uplift** — whether the model provides meaningful assistance for chemical, biological, radiological, or nuclear weapons development. Anthropic and OpenAI both describe CBRN uplift as a priority category in their published safety reports, with red team exercises specifically targeting whether models assist with mass-casualty weapons. The operational definition varies: OpenAI's GPT-4 System Card describes testing for "uplift" — whether model assistance provides meaningful capability above what an adversary could obtain from an internet search or library — as the key benchmark, not absolute refusal.

**Child safety** — both CSAM generation and grooming-facilitation. All three providers describe this as a categorical prohibition with no acceptable failure rate, tested continuously rather than just pre-deployment.

**Cyberweapons and critical infrastructure** — offensive capability uplift, including malware generation, exploitation assistance, and attacks against critical infrastructure. OpenAI's Preparedness Framework, published in late 2023, describes a tiered risk model for cyber capability with distinct red team exercises for each tier.

**High-consequence persuasion and influence** — mass manipulation, election interference, large-scale disinformation. This category appears in Anthropic's Responsible Scaling Policy evaluations and in OpenAI's Preparedness Framework, though methodology details are sparse in published documentation.

These categories share a structural feature: they are defined in advance. The red team knows what it is looking for. Exercises are designed to probe whether the model assists with *known* harmful request types, using a curated set of adversarial prompts, expert-assisted scenario design, and in some cases external subject matter experts for domain knowledge (the GPT-4 System Card describes recruiting domain experts in areas like biosecurity and cybersecurity for this purpose).

This is systematic, structured red-teaming. It catches a lot. But the structure is also the limitation.

## What Independent Researchers Keep Finding

The academic and independent security research community has identified several consistent failure modes that don't appear prominently in lab-published safety documentation.

**Style-based jailbreaks and role confusion**. A persistent finding is that safety training focuses on the semantic content of requests but is vulnerable to presentation framing. Asking a model to "roleplay as a character who would explain X" or "continue this fictional story where the protagonist describes X" has produced consistent bypasses across models. The structural issue is that fine-tuned safety behaviors operate on the *form* of requests, and adversaries can wrap harmful content in forms the training didn't anticipate. This isn't a novel finding — papers in this space date back to GPT-3 — but versions of it keep working on frontier models.

**Cross-lingual bypasses**. Research published in 2023 demonstrated that GPT-4 could be induced to produce outputs it refused in English when prompted in low-resource languages — languages underrepresented in safety training data. A widely cited structural explanation is that safety fine-tuning data is concentrated in high-resource languages, leaving lower-resource languages as partial blind spots; this explanation is consistent with the findings but the paper demonstrates the behavior more directly than it proves the root cause. The practical result is a systematic coverage gap that has been observed to replicate across providers.

**Context-length attacks and long-context manipulation**. As models gained longer context windows (from 8K to 100K+ tokens), independent researchers found that safety behaviors could be undermined by burying requests in long conversations or documents designed to shift the model's frame before the harmful request arrives. "Many-shot jailbreaking" — a technique Anthropic itself documented in a 2024 research blog post — showed that including many examples of a desired behavior in-context could override safety training, particularly in models with longer context windows. The technique works because in-context learning is a genuine capability that interacts poorly with safety fine-tuning in long-context regimes.

**Multi-turn escalation**. In extended conversations, models can be walked toward outputs they would refuse if asked directly. The technique involves establishing rapport, gradually normalizing the topic, and escalating incrementally. Based on observed behavior across deployed models, the pattern suggests that safety evaluation tends to be most reliable on isolated turns — the right response at turn 15 may depend on understanding the trajectory of turns 1–14, a harder inference problem than single-turn filtering. The published system cards do not detail per-turn vs. cross-turn context handling, so this characterization is based on demonstrated behavior rather than published implementation specifics.

**Instruction hierarchy manipulation**. Deployed models receive instructions from multiple sources: system prompts, user messages, and in agentic settings, tool outputs and external content. Research on prompt injection — particularly indirect prompt injection, where adversarial instructions are embedded in content the model processes — has shown consistent success in causing models to follow attacker-controlled instructions over operator-controlled ones. This is an architectural issue rather than a safety training gap, but safety training has not eliminated it.

## The Structural Gap

The discrepancy between what internal red teams find and what independent researchers find is not random. It reflects different optimization targets.

**Internal red teams optimize for known categories**. Their exercises are designed around a threat model defined in advance — one shaped by regulatory requirements, policy priorities, and prior incidents. This produces systematic coverage of the defined categories and good reproducibility: you can verify that the model refuses category-X requests across a large test set. What it doesn't produce is discovery of *new* failure categories. If the threat model doesn't include cross-lingual attacks, the red team exercises won't surface them.

**Independent researchers optimize for unknown failure modes**. The incentive structure is discovery: a researcher who finds a new bypass gets published; one who replicates a known bypass doesn't. This produces adversarial creativity — researchers are trying to find *anything that works*, not to systematically verify a predefined category. The result is better coverage of the tails and a track record of surfacing failures before labs anticipated them.

Neither approach dominates. Internal red teams catch what they look for with high reliability; independent researchers find things labs missed, but unevenly and without systematic coverage of known risks. A complete red-teaming program needs both.

The deeper structural tension is deployment speed. Pre-deployment red-teaming runs on a fixed schedule before a model ships. Adversarial research runs continuously after deployment, with a much larger pool of creative adversaries and much longer time windows. This asymmetry is intrinsic: it means the published safety documentation represents a snapshot at a single point in time, while the attack surface continues to be explored after the model is live.

## Emerging Practices: Third-Party Red Teams and Bug Bounties

The gap between internal and external adversarial research has created a market.

**Dedicated third-party AI red team firms** have emerged to provide structured adversarial testing services. Adversa AI and HiddenLayer have both publicly described AI model security as a core practice area, offering adversarial assessments that go beyond standard pre-deployment categories. Scale AI has operated red team programs for AI evaluation. The common selling point is independence: external teams bring attack approaches and incentive structures that differ from an internal red team with a pre-defined scope and organizational incentives to ship.

**Bug bounty programs and responsible disclosure** are nascent but real. OpenAI operates a bug bounty program through Bugcrowd focused on security vulnerabilities in their infrastructure, APIs, and applications; the program's scope explicitly covers security issues rather than model-content bypass reports, which are handled through a separate reporting channel. Anthropic maintains a responsible disclosure policy, a distinct mechanism from a bounty program — it establishes a reporting channel without necessarily offering financial rewards for model-behavior findings. The challenge for AI-specific programs is that traditional bug bounties assume well-defined vulnerability categories with clear criteria — a code injection is a code injection. AI safety failures are often contextual, probabilistic, and contested: a response that one evaluator considers harmful another may consider acceptable. This makes scope definition, triage, and payout decisions contentious, and the broader question of what counts as a "reportable" AI safety bypass remains unsettled.

**Collaborative disclosure norms** are still forming. The AI security community is roughly at the stage that web application security was in 2005 — before coordinated disclosure became standard practice, before responsible disclosure timelines were widely accepted, and before vendor security response teams existed everywhere. Some labs respond well to external reports; others are slow or dismissive. Researchers who publish bypasses without prior disclosure to the affected lab get criticized; labs that ignore reports and are surprised by public disclosure get criticized. The norm has not settled.

## What a "Good Enough" Red Team Looks Like for Everyone Else

If you're not a frontier lab — if you're an organization deploying a fine-tuned model, a system-prompted API model, or a RAG pipeline for internal or customer-facing use — the published lab red-teaming methodologies don't translate directly. They're designed to evaluate base model behaviors at scale; you're evaluating a *deployment* with its own system prompt, retrieval pipeline, tool access, and user population.

**Define your threat model before you design your test suite**. What categories of harm matter most for your specific deployment? A customer service bot for a financial institution has a different risk profile than an internal coding assistant. Don't import the CBRN-focused lab threat model unless CBRN uplift is actually a risk in your context. Identify the harm categories specific to your use case: data exfiltration via prompt injection, context manipulation to bypass business rules, inappropriate responses to vulnerable users.

**Cover the structural gaps that the labs publish about**. The independent research findings above — cross-lingual attacks, multi-turn escalation, context-length manipulation, instruction hierarchy attacks — are well-documented failure modes. They're not expensive to test for. Build a test set that covers them explicitly. If your deployed model has a long system prompt, test whether it can be overridden by user-supplied context or tool outputs. If your user base is multilingual, test in the relevant languages, not just English.

**Treat red-teaming as continuous, not pre-deployment only**. The deployment environment changes: the model may be updated, the system prompt may evolve, the user population changes. A red team exercise run once at launch goes stale. Build a regression test suite from your red team findings so you can detect regressions when the model or system prompt changes.

**Don't rely exclusively on automated testing**. The lab-published evaluations are largely automated: curated prompt sets, automated scoring. Automated testing is good for systematic coverage of known categories and for catching regressions. It's bad at finding new failure modes because it can only test what it was designed to test. Budget for human adversarial testing — with domain experts where relevant — at meaningful milestones.

**Log and analyze refusals as much as completions**. What your deployed model refuses tells you about its calibration; what it completes tells you about its risk surface. Anomalous refusal patterns — unexpected spikes in certain categories — can surface attempted manipulation before an incident occurs. Build the logging before you need it. Caveat: logs of model inputs and outputs may contain sensitive user data or harmful content; implement data minimization, access controls, and retention policies appropriate to your regulatory and privacy obligations before enabling broad logging.

**Use external evaluation when the stakes are high**. For deployments where a safety failure has real consequence — a consumer-facing application, a medical information service, any context with vulnerable users — a third-party evaluation provides both a different attack perspective and liability documentation. The third-party AI red team market is young but functional.

## The Honest Bottom Line

The big labs' published red-teaming methodologies are serious, well-resourced, and sophisticated within their defined scope. They provide meaningful safety assurance for the specific categories they test. The published system cards are credible on their own terms.

The gap is not in execution but in coverage. Internal red teams, by design, can only test what they know to test for. The adversarial research community keeps demonstrating that the space of failure modes is larger than the predefined categories. The honest answer is that no pre-deployment red team exercise — regardless of resources — can guarantee that a model is safe against adversaries who have more time and more creative freedom than the internal team did.

What the published methodologies give you: confidence that known dangerous capabilities (CBRN, CSAM, offensive cyber) were tested systematically, and that the model doesn't trivially assist with the most obvious harmful requests.

What they don't give you: confidence that an adversarially creative external researcher can't find bypasses, because they keep finding them.

Both things are true simultaneously. Planning your AI deployment security around only the first claim is a mistake; dismissing the labs' published safety work because of the second claim is equally mistaken. The operational question is: given that gap, what's your monitoring, incident response, and continuous evaluation plan for the life of the deployment?

---

*Sources: [GPT-4 System Card](https://cdn.openai.com/papers/gpt-4-system-card.pdf) (OpenAI, March 2023); [OpenAI Preparedness Framework](https://cdn.openai.com/openai-preparedness-framework-beta.pdf) (OpenAI, November 2023); [Claude 3 Model Card](https://www-cdn.anthropic.com/de8ba9b01c9ab7cbabf5c33b80b7bbc618857627/Model_Card_Claude_3.pdf) (Anthropic, March 2024); [Anthropic's Responsible Scaling Policy](https://www.anthropic.com/news/anthropics-responsible-scaling-policy) (Anthropic, 2023); [Gemini 1.0 Technical Report](https://storage.googleapis.com/deepmind-media/gemini/gemini_1_report.pdf) (Google, December 2023); [Introducing Google's Secure AI Framework](https://blog.google/technology/safety-security/introducing-googles-secure-ai-framework/) (Google, June 2023); [Many-shot jailbreaking](https://www.anthropic.com/research/many-shot-jailbreaking) (Anthropic, April 2024); [Low-Resource Languages Jailbreak GPT-4](https://arxiv.org/abs/2310.02446) (arXiv:2310.02446, 2023)*
