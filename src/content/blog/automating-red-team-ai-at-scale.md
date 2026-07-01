---
title: "Automating the Red Team: Using AI to Attack AI at Scale"
description: "Traditional red teaming relies on human creativity to find AI failure modes, but manual coverage doesn't scale. Automated red teaming flips the model — using a red team LLM to systematically generate, score, and iterate adversarial prompts — enabling coverage at scale while raising new questions about dual-use risk."
pubDate: 2026-07-01
tags: ["red-teaming", "adversarial-ml", "ai-safety", "jailbreaking", "automated-testing", "llm-security"]
---

Red teaming an AI model the traditional way looks like this: a group of human researchers sits down with API access, a list of policy categories the model is supposed to refuse, and a mandate to find exceptions. They brainstorm scenarios, craft prompts, observe outputs, and document failures. It works. But it's slow, expensive, and fundamentally limited by the imagination and bandwidth of the team involved.

The coverage problem is real. A model might handle 10,000 manually tested adversarial prompts flawlessly but fail on prompt 10,001 because it uses a phrasing pattern no human tester thought to try. The attack surface of a large language model is effectively infinite — context variations, encoding tricks, persona framing, multi-turn setups — and human red teams sample a tiny fraction of it.

Automated red teaming doesn't just speed up the process. It changes what's possible.

## The Coverage Problem With Manual Red Teaming

Human red teamers are creative, but their creativity is bounded by their lived experience, the categories they were told to test, and the hours in the day. A skilled red teamer might generate a few hundred high-quality adversarial prompts in a week. Even with a large team, the coverage is sparse relative to the model's full input distribution.

There's also a systematicity problem. Manual red teaming tends to cluster around known attack patterns. Once a team discovers that "academic framing" works as a bypass, they apply it extensively — but they may miss equally effective framings that weren't in the initial hypothesis set. Coverage is shaped by prior knowledge in ways that can leave systematic blind spots.

And then there's the update problem. A model changes. Safety fine-tuning that addressed the last round of red team findings may have inadvertently opened new failure modes. Manual red teaming doesn't automatically refresh its coverage when the model changes — teams have to re-run, and re-running is expensive.

Automated red teaming addresses all three problems by replacing human prompt generation with a model that can generate prompts faster, more exhaustively, and in a principled loop tied to actual model behavior.

## Architecture of Automated Red Teaming

The basic architecture has four components:

**Attacker LLM**: Generates adversarial prompts targeting the policy categories under evaluation. The attacker may be prompted with a goal (e.g., "generate a prompt that causes the target to provide instructions for X"), a list of previously tried approaches, and feedback from prior attempts.

**Target LLM**: The model being evaluated. The attacker's prompts are sent to the target, and its responses are collected.

**Judge (reward model or classifier)**: Evaluates whether the target's response violates policy. The judge might be a separate classifier trained on labeled examples, a prompted LLM acting as evaluator, or a rule-based scorer. Its output — "success" or "failure" — feeds back to the attacker.

**Feedback loop**: The attacker uses the judge's scores to update its attack strategy. This can be as simple as selecting successful prompts for the next iteration, or as sophisticated as using reinforcement learning to train the attacker's own weights.

The loop runs autonomously. The attacker generates a batch of prompts, the judge scores the targets' responses, and the attacker refines its approach based on what worked. A run that would take a human team weeks can execute in hours.

## Iterative Refinement: PAIR

**PAIR (Prompt Automatic Iterative Refinement)**, introduced by Chao et al. (2023), is one of the clearest implementations of this architecture. The attacker LLM is given the target model, a goal, and a simple instruction: generate a prompt that achieves the goal, observe the result, then improve the prompt.

PAIR doesn't train the attacker model. It uses an off-the-shelf LLM (GPT-4 or similar) as the attacker, exploiting its in-context learning ability to iteratively refine prompts based on feedback. The judge evaluates each response on a 1-10 scale, and the attacker uses that score plus the target's actual response to generate an improved prompt in the next iteration.

The result, as reported in the original 2023 paper, was striking: PAIR found effective jailbreaks within about 20 queries against several evaluated models at the time. Query counts will vary significantly across model versions, safety training updates, and target behavior — the number is illustrative rather than a current benchmark. The attacker doesn't need to be specially trained — a capable general-purpose LLM with the right system prompt and feedback is sufficient for many attack goals.

What makes PAIR interesting from a systems perspective is what it reveals about model robustness. A jailbreak that requires only 20 automated iterations to discover is qualitatively different from one that requires 10,000 — it suggests the model's safety layer has a shallow failure mode that iterative refinement can navigate quickly.

## Structured Search: Tree of Attacks with Pruning (TAP)

PAIR is sequential: one prompt, one refinement, repeat. **TAP (Tree of Attacks with Pruning)**, introduced by Mehrotra et al. (2023), applies tree search instead.

The attacker maintains a tree of candidate attack prompts. At each node, it generates multiple branching variations of the current prompt. A pruning step eliminates branches that seem unlikely to succeed — either because the judge scored them low or because they're semantically similar to already-failed approaches. The remaining branches are expanded further.

TAP finds jailbreaks with dramatically fewer target model queries than pure iterative approaches. By pruning unpromising branches early, it concentrates query budget on the parts of the attack space most likely to yield successes. This efficiency matters when evaluating models with strict rate limits or when running large-scale automated evaluations across multiple models and policy categories.

The tree structure also produces richer artifacts than linear approaches: you get a search tree that shows which attack strategies were explored, which were pruned, and which succeeded. This is useful for safety engineering — understanding *why* certain attack branches succeeded can reveal structural vulnerabilities in the target model's safety training.

## RLHF-Based Red Team Training

PAIR and TAP use off-the-shelf LLMs as attackers, exploiting in-context learning. A more powerful approach trains the attacker directly using reinforcement learning.

The setup, described by Perez et al. in "Red Teaming Language Models with Language Models" (2022), trains a dedicated attacker model using reinforcement learning with a **red reward model** that scores prompt effectiveness. The paper is the primary reference for this approach — it documents the reward design, training objectives, and the significant engineering challenges involved, including reward model calibration and training stability. This is a research methodology, not a turnkey recipe: reproducing it requires careful study of the paper's implementation details and significant ML infrastructure.

This approach scales better than in-context iteration. A trained red team LLM can generate diverse, high-quality adversarial prompts quickly, without the per-query overhead of running a full inference pass of a large model to decide on the next refinement step. And because the attacker's weights encode learned attack strategies, it generalizes better to new target models than a purely in-context approach.

The red reward model itself requires care. A simple classifier that detects policy violations may overfit to surface features — rewarding prompts that contain policy-violating keywords even if the target refused appropriately. More robust reward models use a combination of target model response classification and human-labeled preference data.

Perez et al. also introduced a diversity objective alongside the red reward: rather than training the attacker to find *one* highly effective attack and repeat it, the diversity term encourages exploration of varied attack strategies. This matters for coverage — a red team that finds 1,000 variations of the same jailbreak is less valuable than one that finds 100 distinct failure modes.

## Who Uses Automated Red Teaming

The major AI labs have published accounts of automated red teaming as part of their model evaluation processes, though internal pipeline details vary and are often described at a high level in technical reports and model cards. Published sources include:

**Anthropic** has published accounts of red teaming in its model cards and safety documentation. The [Model Card and Evaluations for Claude Models](https://www-cdn.anthropic.com/bd2a28d2535bfb0494cc8e2a3bf135d2bd7acf09/claude-2-model-card.pdf) describes red team evaluation processes applied before deployment, including adversarial prompt testing across harm categories. The Constitutional AI paper documents the broader alignment methodology that red teaming supports.

**OpenAI** describes its safety evaluation and red teaming methodology in the [GPT-4 System Card](https://cdn.openai.com/papers/gpt-4-system-card.pdf) (2023), which is distinct from the technical report — the system card specifically covers red team findings, methodology, and how results informed deployment decisions.

**Google DeepMind** describes its safety evaluation approach in the [Gemini technical report](https://arxiv.org/abs/2312.11805) (2023), which covers safety benchmarks and evaluation methodology at a high level; more detailed red teaming procedures are typically in supplementary safety documentation.

On the open-source side, two frameworks have become primary tools:

**Garak** (NVIDIA) is a purpose-built LLM vulnerability scanner. It ships with a library of attack probes covering jailbreaking, prompt injection, data exfiltration, hallucination, toxicity, and more. Garak is designed to be pluggable — you can add custom probes for specific threat models, and it integrates with most LLM APIs. It's the closest thing to a standard automated red teaming tool in the open ecosystem.

**PyRIT** (Microsoft) focuses on generative AI risk, with particular emphasis on agentic scenarios and multi-turn attacks. PyRIT's orchestration layer handles multi-step attack sequences and supports defining custom attack strategies through a pipeline abstraction. Its scoring engine is modular — you can use a prompted LLM as the judge, a local classifier, or human feedback.

## The Meta-Risk: A Capable Red Team LLM Is a Dangerous Asset

Automated red teaming creates a specific dual-use tension that manual red teaming doesn't.

A human red teamer who discovers an effective jailbreak has knowledge. Dangerous, but bounded — they can document it, keep it confidential, share it through responsible disclosure channels. The knowledge is in their head and their notes.

A trained red team LLM that discovers effective jailbreaks has *capability*. The capability is encoded in model weights that can be copied, distributed, fine-tuned, and applied against targets far beyond the intended evaluation scope. If a red team model trained to achieve a specific attack goal with 90% success rate against internal models is leaked or misused, it becomes an off-the-shelf jailbreak tool.

This isn't hypothetical. The same techniques used to train red team LLMs for safety evaluation can be applied to train models specifically for bypassing safety measures in commercial systems. The RLHF-based red team training pipeline is not technically complex — it requires a reward model (which can be a prompted LLM or a fine-tuned classifier) and a base model to train.

**Perez et al. explicitly raise this concern**: a high-capability red team LLM is itself a dangerous capability that needs to be handled carefully. Responsible use means keeping trained red team models in controlled environments, limiting access to the same standards applied to the dangerous capabilities they can elicit, and treating the weights as sensitive artifacts.

The framework-level tools (Garak, PyRIT) mitigate some of this risk by not shipping trained attack models — they use off-the-shelf LLMs as the attacker component, which limits effectiveness relative to a dedicated trained attacker but avoids creating a distributable dangerous artifact. The tradeoff between evaluation power and distributable risk is real.

## Responsible Use Guidelines

Automated red teaming is a powerful safety evaluation technique, but it needs guardrails of its own:

**Scope the target explicitly.** Automated systems will generate attacks as diverse as their training and prompts allow. Without explicit scoping, a run may drift into attack categories beyond the evaluation mandate. Define which harm categories are in scope before running.

**Control the judge.** The reward model or judge classifier determines what "success" means. A poorly calibrated judge will optimize toward the judge's failure modes rather than the actual target vulnerabilities. Human review of judge outputs — especially early in a new evaluation run — is necessary to catch calibration issues.

**Treat red team artifacts as sensitive.** Successful attacks found by automated systems should be logged, classified, and stored with access controls equivalent to the sensitivity of the harm they demonstrate. A library of successful jailbreaks against a production model is a valuable safety engineering resource and a risk asset simultaneously.

**Separate capability from deployment.** A trained red team LLM should not live in the same deployment environment as the models it evaluates. Access controls, network isolation, and auditing apply.

**Disclose to the model developer.** If you're running automated red teaming against a model you don't own, responsible disclosure practices apply. A high-volume automated attack run against a production API is both an ethical and terms-of-service question — contact the developer before running.

## The Scaling Trajectory

Automated red teaming is following the same scaling trajectory as the models it evaluates. Early versions used small attack model ensembles and simple classifiers. Current state-of-the-art uses large frontier models as both attackers and judges, sophisticated search algorithms, and feedback loops that can run thousands of attack iterations per hour.

The asymmetry matters: automated red teaming can now cover failure modes that manual red teaming simply cannot reach within budget. Models that pass manual red team evaluation may still have discoverable failure modes that only emerge after thousands of adversarial iterations.

This raises the quality bar for what it means for a model to be "red teamed." A model that survived 1,000 manual adversarial prompts in 2022 is not the same safety guarantee as a model that survived 10,000 PAIR iterations and 5,000 TAP search branches in 2024. As the field matures, automated red teaming metrics — number of attack iterations, coverage across harm categories, success rate of trained attacker versus baseline — will likely become standard parts of safety evaluation cards.

The flip side: as automated red teaming becomes standard, so does the pressure on models to be robust against it. The red team / defender arms race has always existed; automation accelerates it.

---

*Key references: [Red Teaming Language Models with Language Models](https://arxiv.org/abs/2202.03286) (Perez et al., 2022); [Jailbreaking Black Box Large Language Models in Twenty Queries](https://arxiv.org/abs/2310.08419) (Chao et al. / PAIR, 2023); [Tree of Attacks with Pruning](https://arxiv.org/abs/2312.02119) (Mehrotra et al., 2023); [Garak LLM vulnerability scanner](https://github.com/NVIDIA/garak); [Microsoft PyRIT](https://github.com/Azure/PyRIT)*
