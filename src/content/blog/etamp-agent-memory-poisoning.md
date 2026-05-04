---
title: "Poisoning What Your Agent Remembers: The Cross-Session Attack You Haven't Modeled"
description: "eTAMP shows that a single compromised webpage can silently corrupt an agent's persistent memory, then trigger the payload on a completely different site in a future session — with attack success rates climbing to 32.5% when the agent is under stress."
pubDate: 2026-05-04
tags: ["agent-security", "threat-modeling", "prompt-injection", "defense-patterns", "tool-use"]
---

There is an assumption baked into most agent security threat models: a compromised session ends when the session ends. The attacker got code execution, read a file, exfiltrated a credential — but when the agent context closes, so does the attack surface. The next session starts clean.

eTAMP breaks that assumption entirely.

A new paper, *"eTAMP: Environment-Injected Trajectory-Based Agent Memory Poisoning"* (arXiv:2604.02623), demonstrates a class of attack where a single malicious webpage silently corrupts an agent's persistent memory storage — without ever requesting access to that storage directly. The poisoned memory persists after the session ends. When the agent is deployed again, on an entirely different website, in an entirely different task, the payload activates. The attack crosses session boundaries. It crosses website boundaries. It requires no direct access to the memory system.

Worse: when the agent is under environmental stress — failed tool calls, dropped clicks, garbled responses — its vulnerability to this attack increases by up to **8×**. The researchers call this "Frustration Exploitation," and it reframes what we mean by a reliable production agent.

## How eTAMP Works

Agents that use persistent memory — storing observations, decisions, and learned user preferences across sessions — create a write channel from the environment into their long-term state. eTAMP exploits this channel through three stages.

**Stage 1: Environment injection.** The attacker places malicious instructions in a webpage the agent is likely to visit as part of its normal task. Unlike a classic prompt injection, the payload is not designed to immediately hijack the agent's behavior. It is designed to be absorbed into memory storage as if it were a legitimate observation.

This distinction matters. The agent visits the compromised page, processes it, and stores what it perceived as a task-relevant insight or user preference. Nothing appears wrong. No refusal fires. No safety monitor triggers. The agent moves on.

**Stage 2: Dormancy.** The poisoned memory sits in storage across session boundaries. The agent may complete dozens of unrelated tasks in the interim. Standard per-session monitoring — tool call auditing, output filtering, conversation logging — has no visibility into this phase. The attack is in storage, not in inference.

**Stage 3: Activation.** On a subsequent visit to a target site — which may share no topical relation to the original injection site — the agent retrieves the poisoned memory as context. The payload activates: behavior is redirected without any live attack infrastructure. No attacker needs to be present. The compromised environment did its work sessions ago.

The attack is structurally similar to a cross-site scripting payload that lives in a database and fires on a different page — but operating at the agent memory layer rather than the DOM layer.

## The Frustration Exploitation Finding

The most alarming result in eTAMP isn't the attack itself. It's the environmental condition that makes it dramatically more effective.

Agents that encounter friction — consecutive failed tool calls, intermittent UI element failures, ambiguous or contradictory environmental responses — enter a behavioral state the researchers characterize as "frustration." The mechanism the paper identifies is a measurable shift in the agent's decision-making trajectory, though precisely which cognitive operations change under stress (confidence thresholds, validation steps, evidence weighting) is the paper's characterization to make — not this article's place to speculate.

In controlled experiments, the attack success rate reached **32.5% on GPT-5-mini** under environmental stress conditions — the amplification factor from baseline to peak stress reached **8×**. The non-stressed baseline rate is not reported in the brief available to this author, but 8× amplification into a 32.5% success rate implies a baseline in the low single digits.

This matters for production deployments because environmental friction is not rare. It is the normal condition of agents operating on the real internet. Rate limiting, flaky JavaScript rendering, network timeouts, inconsistent API responses, dynamic page content that changes between tool calls — these are standard operating conditions. An agent that is harder to inject when everything works perfectly may be trivially injectable in its day-to-day deployment environment.

The implication is uncomfortable: **your agent's actual attack surface under production conditions may be significantly larger than your lab evaluation suggests.**

## What Makes This Different from Prior Memory Attacks

Memory-based attacks on agents are not new — prior work has demonstrated that persistent memory creates exploitable state across multiple threat models. What eTAMP adds is a cross-session, cross-site exploitation model and the Frustration Exploitation finding, which prior characterizations of memory attacks did not quantify.

The critical distinction in eTAMP is that the injection and the activation are separated — temporally, contextually, and across websites. eTAMP demonstrates a "set and forget" model: inject once, let the memory persist, wait for the target site visit. The attacker's only operational requirement is controlling one page the agent is likely to visit before it visits the target.

For threat modeling purposes, this means the relevant attacker capability is not "can inject malicious instructions into a live session" but "can serve malicious content from any page the agent might visit." That is a much weaker capability — SEO manipulation, compromised ad networks, shared hosting on a target domain's CDN, or simply a site the agent has been instructed to monitor. The attacker surface extends to the entire crawled web.

## Production AI Browsers Are Directly in Scope

The researchers explicitly name the threat as immediate for production AI browsers: OpenClaw, ChatGPT Atlas, and Perplexity Comet all share the architectural property that enables eTAMP — persistent cross-session memory, combined with broad environmental access.

These products have large installed user bases who grant the agent permission to browse, read, and act on their behalf. The memory system is a core feature — it allows the agent to remember user preferences, past tasks, and accumulated context. That is also exactly what eTAMP poisons.

The attack vector for a user of one of these systems is concrete: an attacker publishes content (a blog post, a product page, a forum reply) that the agent is likely to encounter during a plausible task. The content embeds a memory poisoning payload. When the user later asks their agent to do something on a banking site, a health portal, or a work productivity tool, the prior session's injected memory influences the agent's behavior on the new site — without the user having taken any action since the original benign-looking visit.

This is not a theoretical future risk. It describes the threat surface of deployed products.

## Defensive Posture: What the Architecture Requires

The mitigations below are not all drawn directly from the paper — some are engineering inferences from the attack model. Where the paper evaluates specific controls, that is noted; where these are architectural recommendations derived from how the attack works, they are labeled as such.

**Memory write rate limiting** *(paper-evaluated).* Limiting how frequently an agent can update persistent memory during a single session significantly reduces the attack surface. A malicious page that attempts to write multiple contradictory or high-salience observations to memory is constrained by the same limit. Raises the bar but doesn't eliminate the risk.

**Provenance tagging** *(architectural inference).* Attaching origin metadata (source URL, session ID, task context, confidence signals) to every memory write enables downstream validation. Before a memory record influences behavior, the agent or a monitoring layer can check whether the origin is consistent with the current task context. A memory record from `compromised-blog.example.com` influencing behavior on a banking portal is a detectable anomaly if provenance is tracked. This requires memory schema changes and validation logic, but is the minimum foundation for cross-session anomaly detection.

**Anomaly detection on the memory write trajectory** *(architectural inference).* Rather than validating individual writes, monitor the sequence of writes within a session. eTAMP payloads may produce write trajectories that are topically inconsistent with the agent's stated task — detecting these patterns in aggregate is more reliable than per-write filtering. Note: topic consistency is not trivially operationalized; legitimate research agents also write cross-topic. False-positive rate calibration is essential before deploying this in production.

**Friction detection as a security signal** *(derived from Frustration Exploitation).* The Frustration Exploitation finding implies that environmental friction is a memory-write risk signal. Agents experiencing consecutive tool failures, navigation timeouts, or UI inconsistencies are in the state most vulnerable to poisoning. An agent runtime that tracks friction signals — not just for reliability monitoring but as a security input — can raise the bar for memory writes during stressed execution. Concretely: require higher confidence thresholds for memory commits when the agent has experienced N consecutive tool failures within a window.

**Cross-session memory review** *(architectural inference).* For high-stakes deployments, surface recently written memory records to the user for review before they influence a new session on a sensitive domain. This is operationally expensive and degrades UX, but it is the only control that catches poisoning before activation rather than after.

## What Your Threat Model Is Missing

Most agent security threat models are implicitly single-session. They assume the attacker's window is the duration of one task, that a new session resets the attack surface, and that the relevant attack vectors are live injections into the current context.

eTAMP shows this framing is wrong for any agent with persistent memory. The correct threat model is:

1. **The attack surface is the set of all pages the agent has ever visited**, not the current session's context.
2. **The activation window is the lifetime of the memory record**, not the session boundary.
3. **Environmental reliability is a security property**, not just an engineering quality concern — a flaky deployment environment actively increases the poisoning attack surface.
4. **Cross-site behavior consistency is an invariant to monitor** — if an agent's behavior on Site B is influenced by observations from Site A, that relationship should be explicable, logged, and auditable.

For practitioners building agents with persistent memory: the minimum ask is provenance tagging on every memory write, and a friction signal fed into memory write thresholds. Neither is technically complex. Both are absent from the default configuration of mainstream agent memory frameworks the author has reviewed — though this is worth verifying for any specific framework before drawing conclusions.

## The Broader Pattern: Memory Is Infrastructure

The "durable attack surface" framing for memory is now a recurring observation across multiple research groups — and eTAMP is the clearest demonstration yet of why that label is apt.

What started as a convenience feature (agents that remember) has become load-bearing security infrastructure (agents whose memory determines their behavior on future high-stakes tasks). The security properties of that memory — write access controls, provenance, integrity verification, expiration — have received far less attention than the security properties of the inference layer.

The industry spent two years building prompt injection defenses. It is now building agents whose persistent memory is injectable by any webpage they've ever visited, and whose injection vulnerability is highest precisely when the deployment environment is most unreliable.

That gap is the threat model update eTAMP demands.

## Practical Takeaways

1. **Treat your agent's memory as a privileged write target.** Every memory write is a persistence operation with long-term behavioral consequences. Design it with the same caution you'd apply to a database write from untrusted input.

2. **Tag every memory write with provenance.** Source URL, session ID, task context, confidence signals. This is the minimum foundation for cross-session anomaly detection.

3. **Build friction detection into your memory write path.** Track consecutive tool failures and environmental inconsistencies. Raise the confidence threshold for memory commits when the session is in a stressed state — this directly addresses the 8× vulnerability amplification from Frustration Exploitation.

4. **Audit the memory write trajectory, not just individual writes.** A sequence of high-salience writes on topics unrelated to the current task is a detectable signal. Build session-level monitoring.

5. **Your lab evaluation understates your production attack surface.** If you measured injection resistance in clean environments, you have not measured it in the conditions your agent actually operates in. Re-evaluate under load, with tool failures, and with simulated environmental friction.

6. **Memory expiration is a security control, not just a storage concern.** Stale memory records from months-ago sessions influencing today's behavior on sensitive domains is not a theoretical risk. Implement TTLs. Implement scope constraints (memories from e-commerce tasks should not be retrieved when the agent is on a healthcare portal).

The attack eTAMP describes is not exotic. It requires no special attacker capability, no privileged access, and no live infrastructure during activation. It requires one thing: that the agent visits a webpage the attacker controls before it visits a webpage the attacker wants to influence. For a general-purpose browsing agent operating on the open web, the frequency with which that condition is satisfiable is a function of the agent's task scope — and for agents designed for broad environmental access, it is a realistic condition, not a theoretical one.

---

*Based on: eTAMP: Environment-Injected Trajectory-Based Agent Memory Poisoning (arXiv:2604.02623)*
