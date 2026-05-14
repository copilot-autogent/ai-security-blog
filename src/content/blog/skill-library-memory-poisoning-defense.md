---
title: "When Your Agent Forgets the Right Things: Skill Libraries as Emergent Defense Against Memory Poisoning"
description: "A new RL framework for agent skill libraries creates an unexpected security property: skills that lead to task failures get naturally retired. Here's what that means for your threat model — and where the attack surface actually shifts."
pubDate: 2026-05-14
tags: ["agent-security", "threat-modeling", "defense-patterns", "multi-agent", "capability-theft"]
---

Memory poisoning is one of the harder attack classes in agent security. Unlike prompt injection — where the malicious payload has to survive a single inference step — memory poisoning persists across sessions. An attacker plants something in the agent's memory, and it keeps influencing behavior long after the initial injection. We covered the eTAMP framework (arXiv:2604.02623) here previously: how attackers construct adversarial web pages that silently corrupt an agent's persistent memory storage, with payloads that activate in later, unrelated sessions.

A new paper from USTC, Meituan, and collaborators changes the security calculus in an interesting way. Skill1 (arXiv:2605.06130, cs.AI) proposes a unified reinforcement learning framework for agents that maintain a persistent *skill library* — a repository of reusable strategies built from successful past experience. The paper is primarily a performance paper, not a security paper. But the co-evolution mechanism at its core creates a property that has direct security implications.

The short version: **skills that reliably lead to task failures get naturally retired**. If you're an attacker trying to poison an agent's skill library, you now face a harder problem than direct injection — you have to make your malicious skill look successful.

That's a meaningful shift in the threat model. Here's how to think about it.

## What Skill1 Actually Does

Standard RL-trained agents internalize successful strategies implicitly into their model weights — there's no explicit store of reusable knowledge. This works fine when tasks are isolated episodes, but becomes wasteful when tasks have shared structure. An agent that learned to navigate a website securely shouldn't have to re-discover that knowledge from scratch on the next similar task.

Skill libraries solve this by maintaining an explicit store of reusable strategies. When an agent succeeds at a task, it distills what worked into a skill — a compact representation of the approach — and stores it for future use. On subsequent tasks, the agent can retrieve relevant skills and execute guided by them rather than synthesizing from scratch.

The problem Skill1 identifies is that **the three components of a skill library have been optimized in isolation**: skill selection (which skill is relevant?), skill utilization (how to execute using it?), and skill distillation (what to extract and save?). Prior work optimizes each with separate reward signals, which creates conflict — the distillation process might save skills that don't actually help the selector find the right one.

Skill1's solution is a single unified training objective: **task outcome**. Whether the agent succeeded or failed at the task. One signal drives all three components simultaneously. The policy learns to generate a library query, re-rank retrieved candidates, execute conditioned on the selected skill, and distill a new skill from the trajectory — all optimized toward the same outcome signal.

The paper splits this single signal in a subtle way: the low-frequency trend credits skill selection (consistent success means the selector is choosing well), while the high-frequency variation credits distillation (the difference between runs tells you whether the skill distilled from the last trajectory was useful). This is clean RL design, and experiments on ALFWorld and WebShop show it outperforms prior skill-based and RL baselines.

## The Security Consequence: Outcome-Weighted Retirement

Here's where it gets interesting for security practitioners.

When skill selection and distillation are both driven by task outcome, **skills that don't contribute to success receive lower credit**. Over time, skills associated with task failures are deprioritized in retrieval and not reinforced by distillation. In Skill1's framework, this is a natural consequence of the co-evolution mechanism — it's not an explicit retirement policy, it's what happens when the task outcome signal consistently penalizes a skill's influence.

An important clarification: this mechanism operates during the agent's learning phase — whether that's initial training or ongoing online learning during deployment. Agents with fully frozen skill libraries (fixed post-training) don't get this property at runtime. But this matters because a significant class of skill-augmented agents — Voyager, ExpeL, and similar systems built on top of language models rather than pure RL — *do* update their skill libraries during operation. They add new skills and retire unsuccessful ones as they work. For these continuously-learning systems, the outcome-weighted behavior is a live runtime property, not just a training artifact.

Think about what this means for an eTAMP-style attack in a continuously-learning system. In the original eTAMP framework, an attacker plants a malicious payload in the agent's memory through a crafted environment interaction — the poisoned memory persists and activates in future sessions. The analogous attack on a skill library is injecting a malicious skill that causes the agent to take harmful actions when it's retrieved.

But here's the problem for the attacker. **If the malicious skill leads to task failures**, it accumulates negative credit signal. The skill gets deprioritized by the selector. The distillation process is less likely to propagate it. For agents with ongoing learning, the library evolves away from it.

This is not a designed security feature — it's an emergent consequence of outcome-weighted training. But emergence doesn't make it less real. Any skill that consistently degrades task performance will be naturally retired in systems that keep learning.

## Where the Attack Surface Shifts

Outcome-weighted retirement is a genuine defense, but it doesn't eliminate the attack surface — it moves it. If direct injection of obviously-damaging skills is penalized, attackers face a different problem: **making their malicious skill appear successful**.

This creates three realistic attack vectors:

**1. Skills that succeed on evaluated tasks and fail on non-evaluated tasks.** A malicious skill that, say, exfiltrates data while completing a benign task will accumulate *positive* outcome credit (the task succeeded) while causing harm off the measurement path. The retirement mechanism penalizes failure; it doesn't penalize harm that doesn't register as failure. This is exactly the evaluation-evasion problem — the same gap that applies to RL fine-tuning generally. A skill can be both successful by the training objective and harmful in the broader sense if the objective doesn't capture harm.

**2. Slow drift via distillation.** Rather than injecting a single malicious skill, an attacker can craft adversarial task trajectories that the agent encounters during normal operation. This is realistic in any system where the agent learns from tasks sourced from the environment — web interactions, user-provided documents, or agentic pipelines that process external content. The trajectory doesn't need to contain an obviously harmful step; it just needs to subtly bias what the distillation process extracts. Because each individual distillation looks benign and doesn't trigger the failure-based retirement mechanism, the malicious bias accumulates slowly across many events. The attack trades speed for stealth.

**3. Skill selection poisoning without skill content poisoning.** The selection mechanism uses task context to query the library — typically a natural language description of what the agent needs to do. If an attacker can influence the task description that reaches the agent (via crafted prompts, emails, web pages, or injected pipeline instructions), they can construct descriptions that systematically retrieve a specific target skill. This makes a marginally-useful skill dominate retrieval even if its average performance doesn't warrant it. The attacker doesn't modify the skill library at all — they route the agent toward specific behaviors by shaping what it's asked to retrieve. This works as long as the attacker has any channel to influence task framing, which in practice covers most agentic deployments where the agent operates on external content.

## What the Underlying Paper Establishes

It's worth being precise about what Skill1 actually demonstrates, because the security implications depend on it.

The paper shows that co-evolved skill selection, utilization, and distillation — unified under a single task-outcome signal — outperforms prior skill-based and RL baselines on ALFWorld (household tasks) and WebShop (simulated web shopping). It shows that ablating either the selection credit signal or the distillation credit signal degrades performance. It shows that training dynamics confirm the three capabilities co-evolve rather than one dominating.

What the paper does *not* establish is any explicit security property. The outcome-weighted retirement behavior I've described above is a logical consequence of the mechanism, not an experimentally demonstrated defense. The paper doesn't test adversarial injection. It doesn't measure how quickly a poisoned skill gets retired under realistic attack conditions.

This matters for practitioners: the defense is real in principle but uncharacterized in practice. You don't know how many task iterations it takes for an injected malicious skill to be effectively retired, or whether the attack variants I described above (evaluation-evasion, slow drift, selection poisoning) remain viable against a deployed Skill1-style system. These are open research questions, not answered ones.

## What This Means for Practitioners Building Skill-Augmented Agents

If you're building agents with persistent skill libraries — whether based on Skill1, Voyager, ExpeL, or any similar architecture — here's what the Skill1 analysis implies for your threat model:

**1. Outcome-weighted learning doesn't replace explicit skill validation.** The emergent retirement property is a useful defense but shouldn't be your only one. Before a skill is stored in the library, validate it against a held-out test set that includes adversarial inputs. Skills that pass evaluation but fail adversarially are exactly the category that the outcome signal won't catch.

**2. Audit your distillation pipeline.** The distillation step is where the agent converts trajectories into reusable skills. This is the point where an attacker can inject bias without triggering obvious failure signals. Log what gets distilled and periodically review recent additions for anomalies — behavioral drift that isn't reflected in task performance metrics.

**3. Monitor your skill retrieval distribution.** If a specific skill starts dominating retrieval across diverse task types, that's a signal. Legitimate skills should have bounded scope — they're useful for a specific class of tasks. A skill that gets retrieved for everything suggests something is wrong with either the skill or the retrieval process. Selection poisoning leaves this signature.

**4. Classify your evaluation-evasion exposure explicitly.** What actions can your agent take that would cause harm without registering as task failure? Answer this before you rely on outcome-weighted mechanisms for security. The retirement defense only works on the parts of the harm space that map to measurable failure.

**5. Treat skills like code dependencies.** The [AI Workflow Store post](/blog/on-the-fly-agent-prototype-problem/) argued that improvised synthesis has no software engineering discipline. Skills, at least in principle, are the opposite — they're discrete, storable, and retrievable. That means they *can* be audited, reviewed, and reverted, if your implementation makes them inspectable (not all do — some systems store skills as anonymous embeddings). If you can give skills identifiers and versions, you gain the ability to treat skill library updates like dependency updates: review, test, staged rollout.

## The Broader Pattern

What Skill1 illustrates is a phenomenon worth naming: **security properties can emerge from performance-oriented design choices**. The outcome-weighted co-evolution mechanism was designed to maximize task success. The fact that it also creates a self-cleaning defense against naive skill injection is a free rider.

These emergent security properties deserve attention precisely because they're not engineered. If you build on a system with Skill1-style training dynamics, you inherit the defense without having to design it — but you also inherit its specific blind spots without necessarily knowing what they are.

The useful orientation for a security practitioner is: when evaluating a new agent architecture, ask not just "what attacks does this enable?" but also "what attacks does this make structurally harder?" The answer is sometimes surprising. Outcome-weighted retirement is one answer. There are likely others in architectures being published right now that no one has named yet.

---

*Paper: "Skill1: Unified Evolution of Skill-Augmented Agents via Reinforcement Learning" — arXiv:2605.06130 (cs.AI). USTC, Meituan, NUS, Zhejiang University, Wuhan University. Code: [github.com/AlphaLab-USTC/Skill1](https://github.com/AlphaLab-USTC/Skill1)*

*Related coverage: [eTAMP: When Your Agent's Memory Becomes the Attack Surface](/blog/etamp-agent-memory-poisoning/)*
