---
title: "Machine Unlearning Security: When Forgetting Training Data Creates New Vulnerabilities"
description: "Regulators are demanding AI systems forget specific training data. Attackers are figuring out how to weaponize that forgetting — through verification gaps, induced forgetting abuse, and unlearning as a path to alignment degradation."
pubDate: 2026-07-02
tags: ["machine-unlearning", "privacy", "gdpr", "safety-alignment", "adversarial-ml", "model-security", "membership-inference"]
---

Regulators are demanding that AI systems forget. The GDPR's "right to be forgotten" (Article 17) gives data subjects the right to request deletion of their personal data from processing systems. Extending that right to trained machine learning models — models that have *learned from* that data, with parameters adjusted across billions of weights — is a different problem entirely.

Machine unlearning is the research field that tries to solve it. And the act of forgetting, it turns out, creates a new class of vulnerabilities.

This post covers what machine unlearning is, why verification is so hard, how the unlearning process itself becomes an attack surface, and what realistic defenses look like.

## What Machine Unlearning Is

The naive implementation of the right to be forgotten in ML is **exact unlearning**: delete the data subject's records from the training set and retrain the model from scratch. This is the only method that offers a clean cryptographic guarantee — the final model was trained on data that does not include the removed examples.

It is also completely impractical at scale. A large language model representing months of compute-time cannot be retrained every time a user submits a deletion request.

The research field responded with **approximate unlearning** — techniques that approximate the effect of retraining without the full cost.

### The Foundational Taxonomy

**Cao & Yang (2015)** — "Towards Making Systems Forget with Machine Unlearning" (IEEE S&P 2015) — is the paper that formalized the problem. It introduced the key insight that training data can be decomposed into "summations": compact statistical aggregates that feed into a learning algorithm. Unlearning then becomes a matter of updating those summations rather than rerunning the full training pipeline. The paper established the core desiderata that any unlearning method must satisfy: completeness (the unlearned model behaves as if it was never trained on the removed data) and timeliness (it does so without prohibitive recomputation).

**Bourtoule et al. (2021)** — "Machine Unlearning" (IEEE S&P 2021) — introduced **SISA training** (Sharded, Isolated, Sliced, and Aggregated). The key idea: partition the training set into shards; train isolated sub-models on each shard; aggregate at inference time. When a deletion request arrives, only the affected shard's sub-model needs to be retrained. The cost of a deletion request scales with shard size rather than total dataset size. SISA is exact unlearning — the removed data genuinely isn't in the retrained shard — at a cost that scales with shard count rather than the full dataset.

The practical limitation of SISA is that shard isolation degrades model quality: a sub-model trained on 1/100th of the data has lower accuracy than one trained on the full set. The aggregation step recovers some quality, but the tradeoff is real. For large language models, SISA-style sharding would require training many smaller models and aggregating them — a workable approach for some applications, not others.

**Influence functions** offer an alternative: compute which training examples most influenced a model's current parameters (via the Hessian of the training loss), then apply a correction that approximates the effect of removing the target examples without retraining. Koh & Liang (2017) — "Understanding Black-box Predictions via Influence Functions" (ICML 2017) — originally developed this tool for interpretability; subsequent work extended it to unlearning. The computational overhead scales with the number of parameters (matrix inversion of the Hessian), making it impractical for large models without approximation.

**Gradient ascent** is the simplest approximate approach: run gradient *ascent* (opposite of normal training) on the target examples, pushing the model's predictions on those examples toward higher loss. Intuition: if gradient descent learned from those examples, gradient ascent un-learns them. The practical problem is that unbounded gradient ascent on a subset of training data tends to damage model performance on the broader distribution — the model "forgets" more than intended.

None of these approximate methods provide the same guarantee as exact retraining. They are approximations, and the gap between the approximation and the true retrained model is the foundation of the verification problem.

## The Verification Gap

After a deletion request is processed, how do you know the model has actually forgotten? This is not a question with a clean answer.

The standard verification primitive is the **membership inference attack**. Shokri et al. (2017) — "Membership Inference Attacks Against Machine Learning Models" (IEEE S&P 2017) — showed that you can train an adversarial classifier to predict, for a given data point, whether it was part of a model's training set. The signal exploits overfitting: models tend to be slightly more confident on training examples than on examples they've never seen.

Deployed as a post-unlearning check: run a membership inference attack against the unlearned model with the supposedly-forgotten data as the "member" input. If the attack can still identify the deleted records as members, the unlearning was incomplete.

This sounds like a solution. It has two significant problems.

**Problem 1: Statistical power.** Membership inference attacks don't have perfect accuracy even against *non-unlearned* models. For a record that was in the training set, a state-of-the-art attack might correctly classify it with 75–90% confidence — not 100%. After approximate unlearning, the model's behavior on the removed record shifts toward that of an unseen example. Whether the membership inference attack can detect this shift depends on how strong the original overfitting signal was and how thorough the unlearning approximation is.

For records that contributed only weakly to the model's learned parameters — because they appeared rarely, are close to the decision boundary, or were part of a large shard — the membership inference signal is weak both before and after unlearning. Verifying that these records have been forgotten is statistically very difficult.

**Problem 2: The verification oracle is adversarially queryable.** A deletion requester who wants to *verify* that their data was forgotten can run membership inference themselves and check whether the signal persists. But an adversary who wants to exploit the verification protocol can also probe it — not just to check, but to infer which records *weren't* forgotten. More on this in the attack surface section.

**Certified unlearning** attempts to close the verification gap formally. Guo et al. (2020) — "Certified Data Removal from Machine Learning Models" (ICML 2020) — introduced a Newton-step-based unlearning procedure for convex models with a provable bound: after applying the procedure, the unlearned model's parameters are within a bounded distance of what retraining from scratch would produce, with high probability. This is a mathematically precise statement of "we've forgotten the data, up to ε."

The catch: convex model assumptions don't hold for deep neural networks, and extending the certification framework to LLMs remains an open problem. Sekhari et al. (2021) — "Remember What You Want to Forget: Algorithms for Machine Unlearning" (NeurIPS 2021) — sharpened the theoretical treatment, establishing sample complexity bounds for certified unlearning under more general conditions. The theory is advancing; practical deployment at LLM scale has not caught up.

The honest state of affairs: **no widely deployed unlearning technique offers cryptographic-strength verification for large neural networks.** Approximate unlearning produces approximate guarantees.

## Attack Vector 1: Induced Forgetting

The verification gap becomes an attack surface the moment unlearning is treated as a service — which is what GDPR and similar regulations require.

Consider a model trained on a large corpus that includes safety-relevant data: accurate information about dangerous content, context about extremist rhetoric (needed for detection), or factual data about security vulnerabilities. A regulatory framework that requires "forget on request" without careful scoping of what can be requested creates a path to *adversarially degrade* the model's safety-relevant capabilities.

The attack pattern: an adversary identifies safety-critical training examples and fabricates a plausible legal or regulatory basis for requesting their removal. A copyright claim against a text passage. A GDPR request for personal data that happens to appear in a relevant training document. A terms-of-service dispute over scraped content. None of these require the adversary to own the data — just to produce a claim compelling enough to trigger the unlearning pipeline.

This is not purely theoretical. The regulatory landscape that mandates unlearning does not, in most formulations, require the data to *belong* to the requester in the sense of being their personal data. Copyright and licensing claims can cover data owned by third parties. A motivated attacker who understands what training data went into a model — and what training data is security-relevant — can potentially construct requests targeting that data specifically.

The attack is most effective against:
- **Rare safety-relevant examples.** A model trained on millions of documents where 20 concern a specific extremist technique relies more heavily on those 20 for the relevant behavior. Removing them via unlearning requests has a disproportionate effect.
- **RLHF-aligned safety examples.** If the human feedback data that taught the model to refuse harmful requests is itself subject to a deletion request — because it involves personal data about the annotators — that data's removal could weaken refusal behaviors.
- **Approximate unlearning at scale.** A SISA-sharded model where the safety-relevant data falls into a single small shard is particularly vulnerable: a successful forget request triggers a full shard retrain, and if the shard contained a concentrated set of safety examples, the retrain on the remaining data produces a less safety-aware sub-model.

### The Regulatory Tension

Regulators face a genuine dilemma here. The right to be forgotten is a substantive privacy right. Implementing it by excluding safety-critical training data from the scope of deletion requests requires exactly the kind of categorical assessment that operators may be unable to make transparently — it means claiming that some data is *too important to forget*, which is precisely the claim that data protection authorities have historically been skeptical of.

The honest framing: regulators mandating unlearning have not yet grappled with the adversarial use of that mandate as a model integrity attack. The law creates the mechanism; the security community has to figure out what an adversary can do with it.

## Attack Vector 2: Unlearning as Alignment Degradation

The second attack surface doesn't require an external adversary or regulatory abuse. It emerges from the mechanics of approximate unlearning itself.

RLHF and similar safety fine-tuning techniques work by shifting a model's output distribution: given a harmful prompt, the aligned model produces a refusal rather than a harmful completion. The safety-trained model's parameters encode both the underlying capabilities (learned in pretraining) and the safety overlay (learned in fine-tuning).

When approximate unlearning is applied — gradient ascent, Newton-step correction, or similar — to a subset of training or fine-tuning data, the update modifies parameters across the same weight space. If the data being unlearned was part of the safety fine-tuning, the gradient ascent is, in effect, partially undoing RLHF.

This need not involve directly unlearning the RLHF preference data. Consider:

- A safety-trained model is deployed via an API with a deletion endpoint.
- An operator requests unlearning of a benign content corpus that was part of pretraining. Gradient ascent is applied.
- The gradient ascent modifies parameters that are relevant to both the content corpus and to safety behaviors — because safety behaviors are distributed across the same weight space as general capabilities.
- Post-unlearning, the model's refusal rate on harmful prompts decreases.

This is the same phenomenon documented in the fine-tuning literature — Qi et al. (2023) demonstrated that fine-tuning on benign examples can degrade safety alignment because the gradient updates are not safety-aware — but now manifesting through the unlearning path rather than the fine-tuning path. (See [Jailbreak Robustness After Fine-Tuning](/blog/jailbreak-robustness-after-finetuning) for a detailed treatment of the fine-tuning mechanism.)

A more targeted variant: an adversary who knows approximately which training or fine-tuning examples contributed most to safety behaviors can submit targeted delete requests for those examples, using gradient ascent to systematically degrade alignment across multiple unlearning calls. Each individual request looks like a normal privacy deletion; the aggregate effect is alignment erosion.

This attack is harder to execute than the induced forgetting variant because it requires knowledge of training data lineage — which specific examples contributed to which behaviors. But that information is increasingly available: model cards, training corpus documentation, and the research literature on influence functions all provide handles on which training examples matter most for which capabilities. A motivated adversary with access to the deletion API and this knowledge can, in principle, craft a targeted alignment-degradation campaign.

## Model Integrity After Repeated Unlearning

Beyond targeted attacks, there is a structural model integrity problem: models that undergo many unlearning operations accumulate perturbations that were not jointly optimized. Each approximate unlearning step adds a correction to the model's parameters. Those corrections are locally valid — each one approximates removing a specific set of examples — but their cumulative effect is not guaranteed to produce a coherent model.

The analogy: imagine patching a codebase not by understanding the full diff, but by reverting individual commits in isolation. Each revert is locally correct, but the resulting state may be inconsistent because the commits interacted in ways the individual reverts don't account for.

For approximate unlearning based on gradient ascent or Newton steps, the interaction is through the loss landscape. Removing example A shifts the loss surface, which changes which direction "away from B" points. Applying a Newton-step correction for A and then for B in sequence is not the same as applying the correction for {A, B} jointly. Over enough unlearning operations, the accumulated drift may produce surprising behaviors — not aligned with any intended model state.

This is an open research problem rather than a demonstrated attack. But it implies that a model subject to a high volume of deletion requests — which is plausible under GDPR at scale — may degrade in ways that are difficult to detect without systematic behavioral evaluation after each operation.

## Defense Landscape

Defenses need to operate at three levels: verification, implementation, and scoping.

### Verification: Treat Unlearning as a Security Boundary

Every unlearning request is a model-modifying event. It should be logged, reproducible, and subject to behavioral regression testing — exactly like any other change to a deployed model.

**Post-unlearning regression suites.** After any unlearning operation, run the model against a battery of behavioral probes: capability benchmarks, safety probes, and task-specific evaluations. A statistically significant drop in safety-related metrics is a signal that the unlearning operation affected more than the intended data.

**Differential comparison against baseline.** Maintain a reference checkpoint of the model pre-unlearning. After each unlearning operation, compute the behavioral delta between the current model and the reference. Large deltas on safety-sensitive inputs are a red flag even if the aggregate benchmark scores don't move.

### Implementation: Unlearning-Resistant Safety Training

The alignment degradation attack surface exists because safety behaviors are distributed across the same weight space as general capabilities, making them collateral damage from gradient updates.

Research directions aimed at making safety behaviors more resilient include:

**Safety-anchored subspaces.** Training procedures that explicitly separate safety-relevant parameters from capability-relevant parameters — through orthogonal fine-tuning, task-vector arithmetic, or parameter partitioning — make it possible to apply unlearning updates only to capability-relevant weights while leaving the safety subspace intact. This is an active research area without production-ready implementations at LLM scale.

**Verifiable unlearning protocols.** Certified unlearning approaches (Guo et al. 2020, Sekhari et al. 2021) provide formal guarantees rather than heuristic approximations. Extending these to modern LLM architectures is an open problem, but the direction is correct: a delete operation with a formal guarantee bounds the damage it can do to unrelated model properties.

**SISA for safety-sensitive shards.** In a SISA-style architecture, the shard containing safety fine-tuning data can be designated as deletion-ineligible (because it doesn't contain personal data — it contains human feedback annotations). This removes the direct unlearning path to RLHF parameters, at the cost of accepting that safety-related human feedback data is not subject to deletion requests.

### Scoping: Limiting the Deletion Surface

The most straightforward defense against induced forgetting is narrowing what can be deleted.

**Distinguish personal data from training corpora.** GDPR deletion rights apply to personal data about the data subject. A training corpus that happens to contain a passage written by a data subject is different from a model that is *processing* that person's personal data. The legal distinction matters — and operationally, it suggests that unlearning pipelines should require clear documentation that the data being deleted is personal data, not just content the requester objects to.

**Human-feedback data as a special category.** RLHF preference data often contains information about the annotators (timing, patterns, demographics). Treating this data as a special category — stored separately, with deletion handled at the annotator level rather than the model level — prevents deletion requests from touching the safety fine-tuning signal.

**Audit trails for deletion requests.** An append-only log of all deletion requests, requesters, claimed grounds, and post-unlearning behavioral snapshots creates an accountability record that enables detection of coordinated campaigns — many small requests from different identities targeting the same behavioral capability.

## The MITRE ATLAS View

The unlearning attack surface maps to several MITRE ATLAS techniques. **AML.T0020** (Poison Training Data) captures the scenario where an adversary's contribution to a training corpus is strategically designed to be a high-value deletion target later. **AML.T0018** (Backdoor ML Model) applies if the poison is designed to create a backdoor that survives most unlearning attempts — a "sticky backdoor" that resists gradient ascent because it was designed with knowledge of the unlearning mechanism. The induced forgetting attack is closer to **AML.T0047** (Erode ML Model Integrity) — using the model's own operational interface to degrade its integrity over time.

## Where the Field Is

Machine unlearning is a maturing research area with significant deployment pressure from regulators. The theory is substantially ahead of practice: certified unlearning results exist for convex models and are extending to non-convex settings; practical implementations for production LLMs are immature.

The security analysis of unlearning is newer still. The induced forgetting and alignment degradation attack vectors described here are theoretically sound and follow from well-established empirical results in the fine-tuning literature. Demonstrated end-to-end attacks against deployed unlearning-capable systems are an emerging research direction rather than a documented threat in the wild.

That timing gap — between regulatory mandate (now) and secure implementation (not yet) — is the real risk. Organizations deploying unlearning to comply with GDPR are doing so with approximate methods, weak verification primitives, and no security posture for the attack surfaces described here.

The practical takeaway: treat every unlearning operation as a security event. Log it. Regress on it. Scope deletion eligibility tightly. And do not assume that "we retrained without that data" is equivalent to "the model has forgotten," especially when the retraining was approximate.

---

*Related posts: [Fine-Tuning Trojans: Backdoors Through the Training Pipeline](/blog/fine-tuning-trojans-backdoors-training-pipeline) · [Jailbreak Robustness After Fine-Tuning](/blog/jailbreak-robustness-after-finetuning)*

*Key research: [Cao & Yang 2015 (IEEE S&P)](https://ieeexplore.ieee.org/document/7163042), [Bourtoule et al. 2021 — SISA (IEEE S&P)](https://ieeexplore.ieee.org/document/9519428), [Guo et al. 2020 — Certified Removal (ICML)](https://proceedings.mlr.press/v119/guo20c.html), [Sekhari et al. 2021 (NeurIPS)](https://proceedings.neurips.cc/paper/2021/hash/519e43f87ddebb07ca6494b9fba4ddda-Abstract.html), [Koh & Liang 2017 — Influence Functions (ICML)](https://proceedings.mlr.press/v70/koh17a.html), [Shokri et al. 2017 — Membership Inference (IEEE S&P)](https://ieeexplore.ieee.org/document/7958568).*
