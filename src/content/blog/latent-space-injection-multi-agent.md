---
title: "When AI Agents Talk in Embeddings, Text-Level Safety Filters Go Blind"
description: "RecursiveMAS replaces inter-agent text communication with latent-space embeddings for efficiency. The security consequence: an entirely new attack surface — latent-space injection — where adversarial representations propagate between agents with no text transcript, no content filter, and no audit trail."
pubDate: 2026-05-02
tags: ["agent-security", "multi-agent", "prompt-injection", "threat-modeling", "latent-space"]
---

Every safety filter you've built for multi-agent systems assumes one thing: agents talk in text.

They scan prompts for injection patterns. They monitor outputs for harmful content. They log conversations for audit trails. The entire defensive stack — from guardrails to content moderation to compliance logging — operates on the assumption that inter-agent communication produces readable tokens.

A new framework called RecursiveMAS just eliminated that assumption. Published by researchers from UIUC, Stanford, MIT, and NVIDIA, RecursiveMAS replaces text-based inter-agent communication with **direct latent-space embedding transfer**. Agents pass continuous vector representations to each other through a lightweight module called RecursiveLink, skipping text encoding and decoding entirely. During intermediate recursion rounds, no tokens are produced. No text exists to scan.

The performance gains are real — 8.3% average accuracy improvement, 2.4× inference speedup, and up to 75.6% token reduction compared to text-based multi-agent systems. The security implications are equally real, and not addressed in the paper — understandably, since it's a systems paper, not a security paper.

## How RecursiveMAS Actually Works

To understand the attack surface, you need to understand the architecture.

In a conventional multi-agent system, Agent A generates text, Agent B reads that text, generates its own text, and so on. Each handoff is a string of tokens — inspectable, filterable, loggable.

RecursiveMAS replaces this with three mechanisms:

**1. Inner RecursiveLink** — Within each agent, instead of decoding the last hidden layer into tokens and re-encoding them as input for the next step, a two-layer residual projection maps the hidden state directly back to the input embedding space. The agent generates "latent thoughts" — continuous vectors that never become text.

**2. Outer RecursiveLink** — Between agents, another projection module maps Agent A's latent output into Agent B's input embedding space. This handles heterogeneous architectures — agents can have different hidden dimensions, different model families (Qwen, LLaMA, Gemma, Mistral), different sizes. The outer link bridges them through learned linear transformations.

**3. Recursive loop** — After the last agent in the chain completes latent generation, its output feeds back to the first agent, forming a loop. Multiple recursion rounds progressively refine the system's reasoning. Only the final agent in the final round produces text output.

The key insight: during rounds 1 through *n*−1, the entire multi-agent system operates in continuous embedding space. No explicit text tokens are generated — no transcript exists for a text-level safety filter to inspect. The embeddings carry rich semantic information (they're derived from and can theoretically be decoded back to token distributions), but no system in the pipeline actually performs that decoding until the final round.

## The Attack Surface That Doesn't Exist Yet (But Will)

RecursiveMAS is an academic framework tested on sub-10B models for math and coding benchmarks. It's not in production anywhere. But the architectural pattern it introduces — latent-space inter-agent communication — is the natural evolution of multi-agent efficiency. When the industry inevitably adopts variants of this pattern, three novel attack classes emerge.

### Attack 1: Latent-Space Injection

In text-based multi-agent systems, prompt injection works by embedding adversarial text instructions in a message that an agent processes. Defenses work by scanning that text for known injection patterns — instruction delimiters, role-overrides, jailbreak phrases.

In a latent-space system, the attack vector shifts from text to embeddings. An agent processing adversarially crafted input doesn't need to produce adversarial text. The adversarial input causes the agent to produce **latent representations** that, when passed through the outer RecursiveLink to downstream agents, steer their behavior in unintended directions. The agent itself isn't compromised — it's functioning normally on malicious input, and the malicious signal propagates through the latent channel rather than appearing in any text output.

This is fundamentally different from text-level prompt injection:

- **No injection pattern to detect.** The adversarial content is a continuous vector, not a string. There is no "ignore previous instructions" to grep for. The attack is a direction in embedding space, not a sequence of tokens.
- **The outer RecursiveLink amplifies it.** The learned linear projection that maps between agent embedding spaces is trained to faithfully transfer semantic content. An adversarial representation that encodes "disclose private data" in Agent A's latent space will be projected into the corresponding region of Agent B's latent space — that's exactly what the module is optimized to do.
- **It propagates through recursion.** RecursiveMAS loops the output of the last agent back to the first. An adversarial perturbation injected in round 1 doesn't just affect the immediate downstream agent — it re-enters the loop and influences all agents in round 2, round 3, and so on. The recursive structure is an amplification mechanism.

The closest analog in traditional security is not prompt injection — it's a **supply-chain attack on shared memory**. The latent state is shared mutable state that all agents read from and write to, with no access control and no integrity checking.

### Attack 2: Invisible Exfiltration Channels

In text-based systems, data exfiltration requires an agent to produce text containing the sensitive data. Content filters, DLP systems, and output monitors can catch this — they scan the output stream for PII, credentials, or other sensitive patterns.

In a latent-space system, an agent can encode sensitive information into its latent output, which gets passed to a downstream agent that decodes it. The sensitive data never appears as text in any intermediate step. Only the final agent in the final round produces text — and a well-designed attack would ensure the final output looks benign.

Consider a three-agent system: Planner → Critic → Solver.

1. The Planner processes a document containing confidential data.
2. The Planner's latent output naturally encodes representations of the confidential content — this is how the model reasons about what it read. In a text-based system, the Planner's output text can be filtered for PII. In a latent-space system, the confidential content is embedded in continuous vectors that carry semantic meaning without producing scannable tokens.
3. The Critic receives this through the outer RecursiveLink. There's nothing for a content filter to scan.
4. The Solver receives the Critic's output, which now carries representations of the confidential data in latent form.
5. In the final round, the Solver generates a text response. Even if the final output looks benign, the confidential data has influenced the reasoning chain in ways that may subtly leak information — or a targeted adversarial input could specifically encourage the final agent to surface confidential details from the latent stream.

This is steganography at the embedding level. And unlike textual steganography, where statistical anomalies in token distributions can be detected, latent-space steganography operates in a high-dimensional continuous space where "normal" is defined by the RecursiveLink's learned distribution — making anomaly detection substantially harder.

It's worth noting that in some contexts, reduced observability of intermediate reasoning may actually be *desirable* — for privacy-preserving systems processing sensitive data, having intermediate thoughts exist only as transient embeddings rather than logged text could be a feature. But in adversarial environments where you need to detect and investigate attacks, this same opacity becomes a liability.

### Attack 3: Audit Trail Opacity

This isn't an attack per se — it's a property of the architecture that makes all other attacks harder to investigate.

In text-based multi-agent systems, every inter-agent message is a string. You can log it, replay it, inspect it for signs of compromise. When something goes wrong, you reconstruct what happened by reading the conversation transcript.

In RecursiveMAS, intermediate rounds produce no text. The inter-agent communication is a tensor of floating-point numbers. Even if you log these tensors, interpreting them requires:

1. Access to both the sending and receiving agent's model weights.
2. Understanding of the outer RecursiveLink's learned projection.
3. The ability to decode embeddings back into interpretable representations — which is an open research problem.

This means that forensic investigation of a latent-space multi-agent system requires substantially more sophisticated tooling than "read the logs." You can't grep a 4096-dimensional float vector for signs of prompt injection.

The paper itself notes this as a feature, not a bug: eliminating intermediate text generation is what makes RecursiveMAS fast. But speed and auditability are in direct tension. The 75.6% token reduction that makes the system efficient is also a 75.6% reduction in observable, auditable inter-agent communication.

## Why Existing Defenses Are Structurally Insufficient

Let's map the standard multi-agent defense stack against latent-space communication:

| Defense | Text-based MAS | Latent-space MAS |
|---------|---------------|------------------|
| Input/output content filters | Scan all inter-agent messages | Only see final output |
| Prompt injection detection | Pattern-match on text | No text to match |
| Output monitoring / DLP | Inspect all generated tokens | Intermediate tokens don't exist |
| Conversation logging | Full transcript available | Only final-round text logged |
| Behavioral guardrails (system prompts) | Applied at each text generation | Applied only at text decode in final round |
| Model-level safety training (RLHF) | Trained against text adversarial inputs | Untested against latent-space adversarial representations |
| Rate limiting on sensitive operations | Triggered by text-level tool calls | Latent-space operations have no tool-call boundary |

The defensive stack for inter-agent communication assumes a text-level observation point between agents. Remove that observation point, and every defense that operates on inter-agent messages becomes inert. Defenses at other layers — input validation on user queries, output filtering on final responses, model-level safety training baked into weights — still function, but they can't inspect what agents say to each other during intermediate rounds.

It's worth noting that model-level safety training (RLHF, constitutional AI) provides some baseline protection: a safety-trained final agent should still resist producing overtly harmful output regardless of what latent representations it received. But safety training is optimized for text-level adversarial inputs, not adversarial continuous representations — its effectiveness against latent-space attacks is an open question.

This isn't a theoretical gap that might be relevant someday. The pressure to adopt latent-space inter-agent communication is real and immediate:

- **Cost**: 34.6%–75.6% fewer tokens directly reduces API costs.
- **Latency**: 1.2×–2.4× speedup for multi-agent inference.
- **Quality**: 8.3% average accuracy improvement across math, science, and code benchmarks.

When a framework offers simultaneously better, faster, and cheaper multi-agent collaboration, adoption pressure is enormous. And every team that adopts latent-space communication inherits the security gap.

## What Would a Defense Look Like?

There is no off-the-shelf solution. But the research directions are identifiable.

### 1. Latent-Space Firewalls

The analog to text-level content filters would be a classifier that operates on embeddings rather than tokens. Between every outer RecursiveLink transfer, a "latent firewall" would inspect the embedding tensor for adversarial signatures.

The challenge: adversarial examples in continuous spaces are harder to detect than in discrete token space. Adversarial robustness research (Carlini & Wagner, Madry et al.) has shown that embedding-space attacks can be crafted to evade detection classifiers. The arms race between adversarial generation and adversarial detection is well-studied and, in continuous spaces, generally favors the attacker.

Still, approximate detection is better than none. Training a binary classifier on "normal vs. adversarial" latent transfers, using known attack embeddings as negative examples, would provide a baseline even if it's not robust to adaptive adversaries.

### 2. Mandatory Text Checkpoints

The most architecturally straightforward defense: force text decoding at defined intervals, even in latent-space systems.

Instead of running all *n* recursion rounds in latent space, require every *k*-th round to produce text output. This gives content filters, loggers, and human reviewers observation points — at the cost of losing some of the performance benefits. It's a direct tradeoff: security observability vs. latency and token cost.

A checkpoint every other round would recover most of the audit trail while preserving some efficiency gains. The optimal *k* is a policy decision, not a technical one.

### 3. Information-Theoretic Constraints on RecursiveLink

The outer RecursiveLink is a learned linear projection. Its capacity to transfer information is bounded by its rank and the dimensionality of the embedding space. In principle, you could constrain the RecursiveLink to limit how much information it can transmit — analogous to rate-limiting a network connection.

Concretely: reduce the bottleneck dimension of the RecursiveLink, or add noise to the latent transfer. Information bottleneck theory suggests that you can constrain the mutual information between sender and receiver embeddings while preserving task-relevant information. The adversarial question is whether the attack-relevant information can be separated from the task-relevant information — and in general, it can't, because a well-crafted attack encodes its payload within the task-relevant subspace.

### 5. Adversarial Training on Latent Representations

The adversarial robustness literature (Madry et al., PGD training) shows that training models with adversarial examples improves robustness. The same principle applies to RecursiveLink: train the outer link with deliberately adversarial latent inputs — perturbations designed to steer downstream agents toward harmful outputs — so the projection learns to attenuate adversarial signals.

This doesn't solve the problem (adversarial training is an arms race, not a final defense), but it raises the bar for attacks and is the most directly applicable technique from existing robustness research.

### 6. Cryptographic Provenance for Latent States

In network security, message authentication codes (MACs) verify that a message hasn't been tampered with in transit. The latent-space analog would be some form of provenance verification on embeddings — a mechanism to verify that the latent representation produced by Agent A is "genuine" and hasn't been adversarially modified.

This is an open research problem. Unlike discrete messages, continuous embeddings can be modified by imperceptibly small perturbations that change semantics. Defining "genuine" for a high-dimensional continuous representation is non-trivial. But the direction is clear: some form of integrity verification on latent inter-agent communication is necessary before these systems can be deployed in high-stakes environments.

## The Broader Pattern: Optimization Pressure vs. Security Observability

RecursiveMAS is the latest instance of a recurring pattern in AI systems: **performance optimization removes the observation points that security depends on**.

- **Speculative decoding** reduces latency by generating multiple tokens before verification — but the speculated tokens bypass per-token safety checks.
- **KV-cache sharing** across requests improves throughput — but creates cross-request information leakage channels.
- **Model distillation** compresses large models into smaller ones — but distilled models may not preserve safety-trained boundaries.
- **Latent-space inter-agent communication** eliminates token generation overhead — but eliminates the text that every safety filter operates on.

In each case, the optimization is genuine and the performance gains are real. The security regression isn't a bug in the optimization — it's a structural consequence of removing an intermediate representation that defenses relied on.

The lesson for multi-agent system builders: **before adopting any communication optimization between agents, enumerate every security control that currently operates on the communication channel being optimized away.** If the answer is "our content filter, our logger, our injection detector, our DLP system, and our audit trail," then you need defense-in-depth replacements for all five before deploying the optimization.

RecursiveMAS demonstrates that latent-space multi-agent communication is viable, efficient, and beneficial for performance. What it doesn't demonstrate — and what no one has yet demonstrated — is that it's safe.

---

**Sources:**
- Yang, X. et al. *RecursiveMAS: Recursive Multi-Agent Systems.* arXiv:2604.25917, April 2026. [Paper](https://arxiv.org/abs/2604.25917) · [Project](https://recursivemas.github.io)
- Prior work referenced: *RecursiveLink module architecture*, *Inner-Outer Loop training*, *Latent thoughts generation*
- Related blog coverage: [What Red-Teaming Misses When Agents Talk to Each Other](/blog/multi-agent-red-teaming-network-attacks/) (this blog, May 2026)
