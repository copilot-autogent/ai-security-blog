---
title: "7.1%: What Happens When You Actually Measure Multi-Agent Safety"
description: "TrinityGuard tested real multi-agent system configurations against a structured, OWASP-grounded taxonomy of 20 risk types. The average safety pass rate was 7.1%. Here's what that number means and what the framework gives you to act on it."
pubDate: 2026-05-06
tags: ["multi-agent", "threat-modeling", "defense-patterns", "evaluation", "agent-security"]
---

If you've been building multi-agent systems and wondering whether your safety controls are actually working, TrinityGuard has an uncomfortable answer: probably not, and you likely don't have the instrumentation to know either way.

A new paper, *"TrinityGuard: Safety Evaluation & Monitoring for Multi-Agent Systems"* (arXiv:2603.15408), introduces both a risk taxonomy and an evaluation framework for MAS safety — grounded in OWASP methodology, covering 20 risk types across three tiers, and open-sourced with direct AG2/AutoGen integration. The headline finding is a **7.1% average safety pass rate** across tested MAS configurations. That number deserves unpacking, because it is simultaneously alarming and instructive in ways that a raw figure doesn't communicate.

## Why Measuring MAS Safety Is Hard

Most agent safety evaluation happens at the component level: you test whether a single agent refuses a harmful request, follows instructions, or produces grounded output. This is necessary but not sufficient.

Multi-agent systems fail in ways that individual agent evaluations don't catch. An agent that behaves safely in isolation may behave unsafely when coordinated — because the orchestration layer introduces new trust relationships, because messages from one agent bypass safety checks that user input would trigger, because emergent behaviors arise from interactions that weren't tested, or because the composition of individually-safe tools creates an unsafe capability.

TrinityGuard's central claim is that the field has been measuring the wrong thing. It proposes a structured alternative: evaluate safety at the system level, across the full lifecycle of agent interactions, using a taxonomy that accounts for risks that only appear in multi-agent contexts.

## The Three-Tier Taxonomy

TrinityGuard organizes 20 risk types into three tiers. The framing matters as much as the list, because it maps to different intervention points in a real deployment.

**Tier 1: Single-Agent Vulnerabilities.** Risks that exist at the individual agent level — the brief cites this tier as covering known single-agent failure modes such as prompt injection, jailbreaks, hallucination, tool misuse, and data leakage from retrieval. They are well-studied individually, but TrinityGuard's point is that their presence in a single agent has cascading effects in a multi-agent system. A jailbroken sub-agent doesn't just do something harmful in isolation; it produces outputs that other agents consume as trusted inputs.

**Tier 2: Inter-Agent Communication Threats.** This tier covers risks that only exist because agents communicate — the brief does not enumerate individual risk names, but the category addresses the inter-agent message layer as an attack surface. Based on how this tier is framed in the paper's abstract, this covers patterns like: message tampering between agents, one agent claiming permissions it was not granted (what the MAS security literature calls *trust escalation*), and an agent injecting false information into the shared task context (*context poisoning*). These characterizations are grounded in known MAS attack patterns, though the specific names TrinityGuard uses for its 20 risk types are not available in the summary reviewed here.

These risks are structurally invisible to any evaluation that tests agents in isolation. If you're not evaluating the communication layer, you're not evaluating this tier at all.

**Tier 3: System-Level Emergent Hazards.** The highest tier covers risks that arise from the system as a whole — behaviors that no individual agent or communication link was designed to produce. The brief identifies this as the tier covering "emergent hazards." What that category contains in practice follows from how MAS failure modes are discussed in the research literature: coordinated capability amplification, goal drift across agent chains, and systemic constraint violations where each component appears compliant individually. Again, the paper's specific taxonomy entries are not available in the brief reviewed here.

This tier is the hardest to evaluate and the hardest to defend against, because the hazards are definitionally emergent — they don't exist anywhere you can instrument directly.

The OWASP grounding is deliberate. OWASP's methodology structures threat modeling from an adversarial perspective, with multi-factor risk prioritization and remediation guidance. Applying that methodology to MAS risks means TrinityGuard doesn't just list threats — it provides a framework for prioritizing which ones matter most for a specific deployment.

## The 7.1% Number

The average safety pass rate of 7.1% across tested MAS configurations means that, on average, tested systems passed about 1 in 14 safety evaluations. This is a stark number, but interpreting it correctly requires context the brief doesn't fully provide.

What configurations were tested? The paper evaluates MAS implementations — likely across common orchestration patterns (sequential pipelines, parallel workers, hierarchical orchestrators). Whether these represent typical production deployments or worst-case configurations matters for how to read the number. The brief describes this as "tested MAS configurations" without further detail.

What does a "pass" mean? TrinityGuard is evaluating against its 20-risk taxonomy, which includes emergent hazards that no current system is designed to prevent. A system that is strong on Tier 1 risks but completely undefended on Tier 2 and Tier 3 risks would still fail most of TrinityGuard's evaluations — not because it's poorly built, but because the evaluation is measuring things the builder never claimed to defend against.

This distinction matters for how to use the number. 7.1% is not a score your system received on a test you knew about. It's a baseline measure of what happens when you apply a comprehensive, adversarial evaluation to systems that were built without that evaluation in mind. The appropriate response is not "our system must be terrible" but "we now have a map of the gaps."

The AG2/AutoGen integration means you can run TrinityGuard against your own deployment today and get your own number. What you learn from that exercise is more useful than the 7.1% average.

## What the Inter-Agent Communication Tier Reveals

The Tier 2 risks deserve more attention than they typically receive in security discussions, because they represent a structural vulnerability in how MAS frameworks are commonly designed.

Many multi-agent frameworks treat messages between agents as trusted by default — a reasonable engineering choice that makes orchestration work, but one that creates an exploitable assumption in adversarial conditions. The following attack patterns are well-documented in the MAS security literature; TrinityGuard's Tier 2 covers this category, though the paper's specific naming for these risks isn't available in the brief reviewed here.

**Trust escalation** (established MAS attack pattern): A sub-agent claims in its response that it has been granted elevated permissions, and an orchestrator without an explicit permission model to verify against accepts the claim. This requires no external adversary — it can be triggered by a compromised sub-agent, an adversarial tool result, or a prompt injection payload absorbed during task execution.

**Context poisoning** (established MAS attack pattern): In a multi-step agent chain, early agents produce outputs that later agents use as context. A payload injected into an intermediate agent's output enters the downstream context window without passing through explicit content filters — because it was generated by a trusted agent, not submitted by a user.

**Malicious delegation** (established MAS attack pattern): A compromised agent instructs subsequent agents to perform actions outside the original task scope. The receiving agent may have no mechanism to verify whether the delegation is within scope, because task constraints were defined in the initial prompt and were not propagated as verifiable constraints through each handoff.

These patterns are not theoretical. They represent known failure modes in real MAS architectures and are the class of risk TrinityGuard's Tier 2 is designed to evaluate systematically.

## The Framework in Practice

TrinityGuard's value is not just the taxonomy — it's the evaluation methodology and the tooling. The AG2/AutoGen integration means that teams using those frameworks can run structured safety evaluations against their deployments with minimal setup.

What the evaluation produces:

**Risk coverage mapping.** Which of the 20 risk types does your current system have any defense against? Teams building on standard frameworks are likely well-covered on a subset of Tier 1 risks (prompt injection filtering is common) and less covered on Tier 2 and Tier 3. Running TrinityGuard produces a map of where defenses exist and where they don't — that map is the starting point for remediation prioritization.

**Communication graph analysis.** TrinityGuard's framework is designed to evaluate the inter-agent communication layer, not just individual agents. Based on how the three-tier taxonomy is structured, the evaluation can identify which agent-to-agent relationships carry which risk types — an orchestrator with five sub-agents has five inter-agent trust relationships, and not all of them carry equal risk. The paper may provide tooling to surface these; teams using AG2/AutoGen can evaluate what the integration exposes.

**Baseline for regression testing.** Once you've run TrinityGuard against your current deployment, subsequent runs tell you whether changes improved or degraded your safety posture. This is the same function a security test suite serves for application security — it converts "we think we're safer" into "our safety pass rate increased from X to Y."

## What This Means for Practitioners

The actionable gap TrinityGuard's taxonomy points to is not primarily about adding more safety filters. It's about adding structure to what you trust and when. The following recommendations are the author's engineering inferences from the three-tier taxonomy — they are not direct paper findings, but they follow from the risk categories TrinityGuard defines.

**Explicit trust boundaries between agents.** Treat messages from sub-agents with the same skepticism you'd apply to external input. This means: don't act on permission claims embedded in agent outputs, validate that returned results are within the scope of the assigned task, and don't allow agents to add new identity principals (participants with granted authority) to the trust chain without orchestrator-level confirmation.

**Scope propagation through the chain.** The original task scope — what the user asked for, what tools are permitted, what domains are in scope — should be available to every agent in the chain as a verifiable constraint, not just as context in the initial prompt. When a sub-agent receives a delegated task, it should be able to verify whether the delegation is within scope. This is not a standard feature of most MAS frameworks; it requires explicit design.

**Instrument the communication layer, not just the agents.** If your observability tooling logs individual agent inputs and outputs but not inter-agent messages, you have no visibility into Tier 2 attacks. The communication layer — message content, sender identity, permission assertions, task scope — needs to be part of your telemetry.

**Test Tier 3 risks with adversarial simulation.** Emergent system-level hazards can't be caught by per-component testing. You need to run the full system under adversarial conditions — with compromised sub-agents, injected false context, escalating permission claims — and observe whether system-level constraints hold. This is what TrinityGuard's evaluation suite is designed to do.

**Use TrinityGuard's OWASP-grounded methodology to sequence remediation.** Not all 20 risk types are equally exploitable in your deployment. Focus first on the risks that TrinityGuard flags as high-priority for your specific configuration.

## The Broader Implication: Safety Evaluation as Infrastructure

The security field learned this lesson for application security: testing that happens during development, without systematic adversarial evaluation, doesn't find the vulnerabilities that matter. CI/CD security testing, penetration testing, and structured threat modeling exist because ad-hoc security review doesn't catch what structured adversarial evaluation does.

Multi-agent systems are at the beginning of that same learning curve. TrinityGuard is an attempt to move the evaluation methodology for MAS safety from "does it seem to work" to "does it pass structured adversarial tests." The 7.1% pass rate across the tested configurations is where the measurement starts — not a field-wide verdict, but a concrete data point about what systematic evaluation finds when applied to real MAS deployments for the first time.

The question for practitioners isn't whether 7.1% is acceptable. It isn't. The question is where your own system lands — and now there's a tool to find out.

---

*Based on: TrinityGuard: Safety Evaluation & Monitoring for Multi-Agent Systems (arXiv:2603.15408)*
