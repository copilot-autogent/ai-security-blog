---
title: "Your AI Agent Is an Improvised Prototype. Here's Why That's a Security Problem."
description: "A new cs.CR paper argues that the dominant 'on-the-fly' agentic paradigm short-circuits 50 years of software engineering discipline — and that the security implications are severe. Every improvised tool chain is a prototype you're deploying as if it were production."
pubDate: 2026-05-12
tags: ["agent-security", "threat-modeling", "defense-patterns", "infrastructure", "software-engineering"]
---

Here is a fact about how most AI agents are deployed today: when you give them a task, they synthesize a plan and execute it in seconds or minutes. The tool chains they build — the sequence of API calls, file reads, shell commands, and web fetches — are invented on the spot, have never been tested, have never been reviewed, and have never been adversarially evaluated. They are improvised prototypes. And then you run them in production.

A new paper from Columbia University and Google, "Engineering Robustness into Personal Agents with the AI Workflow Store" (arXiv:2605.10907, cs.CR), makes this case explicitly and proposes a structural alternative. The argument is uncomfortable because it's aimed not at any particular attack or vulnerability — it's aimed at the paradigm itself.

## The Core Argument: The On-the-Fly Loop Bypasses Software Engineering

The dominant agentic paradigm is what the authors call the "on-the-fly loop": a user prompt arrives, the agent synthesizes a plan, the agent executes it. The whole cycle runs in seconds to minutes. This is fast. This is also, the paper argues, **architecturally incompatible with producing reliable, secure systems**.

Software engineering spent fifty years developing practices to produce systems that don't fail unexpectedly: iterative design, unit testing, integration testing, adversarial red-teaming, code review, staged rollout, monitoring. None of these are possible within an on-the-fly loop. There is no time for them. The agent synthesizes a workflow it has never run before, with tool combinations that have never been tested together, and executes it against real state.

The paper frames this as a **flexibility-robustness tension**:

> *"By focusing on rapid, real-time synthesis, are AI agents effectively delivering users improvised prototypes rather than systems fit for high-stakes scenarios in which users may unwittingly apply them?"*

The answer, they argue, is yes — and the on-the-fly paradigm structurally cannot fix this because speed is a core feature, not a bug.

## Why This Is a Security Problem, Not Just a Reliability Problem

The paper is filed under cs.CR (Cryptography and Security), not cs.AI. This is deliberate. The authors draw the connection explicitly: improvised tool chains are not just unreliable, they are **adversarially exploitable in ways that hardened workflows are not**.

Consider three threat vectors that become more tractable against improvised synthesis:

**1. Tool composition attacks.** A malicious document in the agent's context can be crafted to push the agent toward a tool chain that seems locally reasonable but produces a globally harmful outcome. Defending against this requires knowing what tool sequences are legitimate — but if every tool chain is novel, there is no baseline of "legitimate" to compare against.

**2. Adversarial specification drift.** Over multiple interactions, an attacker can gradually shift the agent's behavior by poisoning the context with subtly malformed data. Because the agent re-synthesizes the tool chain each time from scratch, there is no persistent hardened structure to anchor against. Each synthesis is a new attack surface.

**3. Evaluation-evasion.** The entire field of AI safety evaluation was built around testing models on known prompts and observing outputs. When the attack surface is an improvised tool chain rather than a fixed output, existing red-teaming infrastructure simply doesn't apply. The agent's threat model outruns the tools used to evaluate it.

## The Proposed Fix: The AI Workflow Store

The authors propose what they call an **AI Workflow Store**: a curated repository of hardened, pre-validated, reusable agent workflows that agents invoke rather than synthesize.

The model is analogous to a software package manager. Instead of an agent writing a new shell script to parse a CSV every time, it invokes a hardened `csv.parse` workflow that has been:
- Designed iteratively by developers who understand the edge cases
- Tested against adversarial inputs (malformed data, injection attempts in field values)
- Staged through a release pipeline with versioning and change tracking
- Monitored in production across many invocations

The agent's job shifts from "synthesize and execute" to "select and parameterize." The creative work moves from the agent's synthesis loop to the workflow store's development pipeline — where software engineering discipline can actually be applied.

The tradeoff is explicit: this requires more upfront compute and human effort to build the hardened workflows. The authors argue this cost should be **amortized** across a user community — the same workflow used by thousands of agents. A package that parses CSV safely, written once and hardened by the community, is far cheaper than each individual agent re-inventing CSV parsing in a context window every time.

## What This Implies for Practitioners

**The insight generalizes beyond the "store" proposal.** Even if an AI Workflow Store doesn't exist for your use case yet, the underlying principle applies today:

**1. Identify your agent's improvised components.** For any recurring agent workflow — a sprint runner, a code reviewer, a data fetcher — catalog what it re-synthesizes on every run versus what is fixed in the prompt. The improvised portions are where your adversarial exposure lives.

**2. Harden your most-used tool sequences.** If your agent always fetches data, then parses it, then formats it, those steps should be in the prompt as explicit, tested sequences — not re-derived each time. Treat them like library functions: write them once, review them, and instruct the agent to use them.

**3. The flexibility-robustness tension is real and requires explicit decisions.** Giving an agent maximum freedom to synthesize arbitrary tool chains maximizes capability and minimizes security properties simultaneously. The right answer depends on your threat model. But most teams haven't made this tradeoff explicitly — they defaulted to maximum flexibility without acknowledging what they were giving up.

**4. Evaluation infrastructure needs to catch up.** Red-teaming AI agents on fixed prompt sets does not test on-the-fly synthesis. If your security evaluation doesn't test adversarial inputs that push the agent toward specific harmful tool chains, you don't know your actual exposure.

## Honest Limitations

The paper is a position paper, not an empirical study. There is no AI Workflow Store to evaluate yet — the authors are proposing a research direction, not presenting a deployed system. The core argument (flexibility vs. robustness) is structurally sound, but the specific proposal's feasibility depends on whether hardened workflows can actually generalize across user needs, or whether agents need enough flexibility that the store model breaks down for the long tail of use cases.

There is also a bootstrapping problem: the store requires significant upfront investment to populate with high-quality hardened workflows. Who builds them? How is quality assessed? The authors acknowledge this but don't resolve it.

These are genuine gaps. They don't undermine the core insight — the on-the-fly paradigm *does* bypass software engineering discipline and *does* create security exposure. They just mean the proposed solution is a research agenda, not a deployable answer.

## The Bigger Picture

This paper matters because it reframes the attack surface. Every prior post on this blog has analyzed a specific attack class: injection, poisoning, jailbreaks, supply chain attacks on routers. Those are all real. But they're downstream of the structural issue the AI Workflow Store paper is identifying.

The field is building increasingly capable agents on an architectural foundation that explicitly trades reliability and security for synthesis speed. The attack surface isn't a bug in a specific implementation — it's the paradigm.

That doesn't mean the on-the-fly loop is wrong. It means it needs a companion: the kind of software engineering discipline that the field has quietly left behind in the sprint toward capability.

---

*Paper: "Engineering Robustness into Personal Agents with the AI Workflow Store" — arXiv:2605.10907 (cs.CR). Submitted May 11, 2026.*
