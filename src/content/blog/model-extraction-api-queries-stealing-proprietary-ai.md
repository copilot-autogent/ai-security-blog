---
title: "Model Extraction via API Queries: Stealing Proprietary AI Without the Weights"
description: "Systematic API queries can reconstruct a proprietary model's behavior — and sometimes its architecture — without ever touching the weights. The security implications are dual: IP theft and a cheap path to an unconstrained surrogate for downstream adversarial attack crafting."
pubDate: 2026-07-01
tags: ["model-extraction", "threat-modeling", "adversarial-ml", "ip-protection", "defense-patterns", "llm-security"]
---

Many commercial model APIs expose enough behavioral signal that, given sufficient queries, an adversary can train a local substitute model that approximates the target's behavior on a specific task — often at a fraction of the original training cost. The attack requires no privileged access, no memory disclosures, no side channels. Just an API key and a query budget. Whether and how severely any given API is at risk depends on factors explored below; not every endpoint is equally extractable.

This is model extraction: reconstruction of a proprietary model's behavior through systematic interaction with its prediction interface. The threat has two distinct security faces. First, IP theft — the substitute model captures commercially valuable behavior that the model owner invested significant compute to produce. Second, and more operationally dangerous, the surrogate becomes a white-box proxy for crafting adversarial examples that transfer back to the original black-box target.

## What Extraction Attacks Actually Steal

Model extraction is not one attack. It's a taxonomy with at least three distinct variants, each with a different threat model and a different feasibility profile.

**Functional cloning** is the most practical and most common. The goal is a substitute model that behaves like the target on a specific task distribution — same input/output mapping — without recovering the architecture or training procedure. You query the target with carefully chosen inputs, collect its outputs, and use those labeled examples to train your own model. The distillation literature has been doing this for compression purposes for years. Attackers are simply running the same pipeline without permission.

**Architecture inference** goes further: can you determine the target's model architecture — layer types, depth, width — from output behavior alone? Tramèr et al.'s foundational 2016 paper ("Stealing Machine Learning Models via Prediction APIs," USENIX Security 2016) showed this is feasible for simple model families — logistic regression, decision trees, shallow neural nets — by solving a system of equations derived from query responses. For large LLMs, architecture inference is significantly harder, but not theoretically impossible: timing side channels, output dimensionality, and token probability patterns all leak structural information.

**Membership inference** is sometimes grouped with extraction but is actually a different threat: given a data point, did the target train on it? This matters for privacy (GDPR, HIPAA) more than IP. It's outside the main thread here but shares the "systematic query" methodology.

The practical threat today is functional cloning. The rest of this post focuses there.

## Query Budgets: How Much Does a Viable Extraction Actually Cost?

The uncomfortable answer is: surprisingly little for task-specific clones.

Tramèr et al. extracted a binary logistic regression classifier with just a few hundred queries. More sophisticated results come from the Knockoff Nets paper (Orekondy et al., CVPR 2019), which showed that image classification models can be cloned to within a few percentage points of the target's accuracy using on the order of tens of thousands of queries — a number that sounds large until you realize it maps to very low cost at typical classifier API pricing. The economics for modern token-priced LLM APIs are different: per-token pricing and much larger output spaces raise extraction costs considerably, but task-specific clones of narrow LLM endpoints remain viable.

For LLMs, the picture is more nuanced:

- **Full-capability cloning** — extracting GPT-4-level general reasoning — is infeasible. The compute required to train such a model far exceeds what you could derive from queries alone. The target's "knowledge" isn't in the outputs; it's in the weights.
- **Task-specific cloning** is very much in scope. A customer service intent classifier, a code review model, a document summarizer for a specific domain — these are narrow enough behavioral distributions that well-chosen queries can cover the space.
- **Fine-tuned specialization** is the highest-risk category. A model that's been fine-tuned on proprietary data for a specific enterprise workflow can have its specialized behavior extracted far more cheaply than the underlying base model, because the target behavioral distribution is smaller and more query-efficient to cover.

The query design matters enormously. Random sampling from a generic distribution wastes budget and produces a noisy substitute. Effective extraction uses **adaptive querying**: start with a seed set of representative inputs, observe the target's responses, and use active learning to select the next queries that maximally reduce uncertainty about the decision boundary. The Knockoff Nets paper demonstrated this with a "reward-maximizing" query strategy using reinforcement learning — the attack agent learns what inputs to query to maximize extraction efficiency.

### The Distillation Pipeline

The end-to-end extraction pipeline mirrors knowledge distillation:

1. **Query corpus construction**: seed queries, domain-specific examples, synthetically generated inputs, or — in the LLM case — prompts generated by the model itself (asking the target to generate examples of what you then use to train a surrogate).
2. **Label collection**: query the target API with each input, collect probability distributions if exposed (soft labels), or just the top-1 prediction if only argmax is returned. Soft labels are significantly more informative for training — they encode the target's uncertainty and inter-class relationships.
3. **Surrogate training**: train a local model on the (input, label) pairs. The surrogate need not have the same architecture; it only needs to match the target's behavioral distribution. Often a smaller model trained on extracted labels outperforms the same model trained on original human labels, because the target's labels encode higher-quality information than annotators typically produce.
4. **Evaluation**: measure fidelity (agreement with target on held-out queries) vs. accuracy (performance on the actual task). These can diverge. A surrogate that's 95% faithful to the target's behavior but the target itself is only 90% accurate will "successfully" capture the target's errors too.

## The Surrogate-to-Adversarial-Example Pipeline

This is where model extraction becomes a security multiplier, not just an IP problem.

White-box adversarial attacks — methods like PGD, C&W, AutoAttack — require gradient access to the target model. You can't run gradient descent directly against a black-box API. But you can run it against a surrogate. And adversarial examples crafted on the surrogate often transfer to the original target.

The transfer mechanism exploits **adversarial transferability**: the finding that adversarial examples tend to transfer across models trained on the same distribution, particularly when both models have learned similar decision boundaries (Szegedy et al., 2013; Papernot et al., 2016, "Transferability in Machine Learning"). The surrogate, by construction, has learned to approximate the target's decision boundary. Adversarial examples that cross that boundary on the surrogate are candidates for crossing the same boundary on the target.

This gives attackers a practical escalation path worth understanding:

- **Step 1**: Query target API → build surrogate (requires only API access + compute)
- **Step 2**: Run white-box attack on surrogate → generate adversarial examples
- **Step 3**: Test adversarial examples against target → black-box attack may succeed via transfer

The transfer rate is empirically variable and not guaranteed; this is a risk pathway, not a reliable weapon. Understanding it shapes both API operator defenses and model robustness requirements.

The empirical transfer rates depend on architectural similarity and training distribution overlap. Tramèr et al. 2016 showed that a substitute model with the correct architecture produced adversarial examples that transferred at high rates. Papernot et al. 2017 ("Practical Black-Box Attacks Against Machine Learning") demonstrated this pipeline end-to-end against a DNN deployed on a cloud API.

For LLMs, the surrogate-to-adversarial path takes a different form:

- An extracted task-specific surrogate can be used to develop adversarial prompts that cause the target to misclassify, generate harmful content, or bypass safety filters — without ever running gradients against the target itself.
- Jailbreak prompts developed on an open-source surrogate (e.g., a Llama fine-tune that mimics a commercial model's tone) often transfer to the commercial target, especially for content-policy bypasses where both models were aligned using similar RLHF pipelines.

The implication is that model extraction is not just an IP attack. It's an offensive reconnaissance capability. The extracted surrogate becomes a development environment for downstream attacks against the original.

## Defenses

No single defense is sufficient. Effective mitigation requires layering.

### Output Perturbation

The simplest defense is making the model's outputs noisier. If the attacker needs soft label probabilities to train an effective surrogate, rounding output probabilities or returning only the top prediction raises the query budget required for a given fidelity. Lee et al. (2019) formalized this as "prediction perturbation" and showed that moderate rounding imposes meaningful cost on extraction attacks while having minimal impact on legitimate use.

Limitation: if the target task only requires hard labels (classification) and the attacker has a good seed distribution, this doesn't prevent extraction — it just makes the surrogate slightly less accurate.

### Query Rate Limiting and Anomaly Detection

From the infrastructure side, extraction looks like a high-volume, low-entropy query stream. A user running extraction queries typically:

- Queries at a consistent rate (automated, not human-paced)
- Sends inputs that cover the task distribution systematically rather than organically
- May generate inputs programmatically (low vocabulary diversity, high semantic similarity to prior queries)
- Doesn't require the outputs for any downstream visible action (no follow-up queries that suggest a human reading the result)

Rate limits, per-user query budgets, and behavioral anomaly detection (unusual query similarity, unusual entropy profiles) can detect or slow extraction campaigns. These are the same defenses used for API abuse generally. They're not extraction-specific, but they impose meaningful cost.

Limitation: a sophisticated attacker can spread queries across multiple accounts, inject human-mimicking patterns, and slow down to stay below detection thresholds. Query budget limits increase cost but don't prevent extraction by well-resourced adversaries.

### Differential Privacy in Serving

If the concern is that outputs leak membership information (which training data was used) rather than functional behavior, differential privacy mechanisms in the training pipeline provide formal privacy guarantees. Note that adding noise to logits at serving time does *not* by itself provide DP guarantees — formal DP requires a properly accounted mechanism applied during training (e.g., DP-SGD with tracked privacy budget). Serving-time perturbation can raise the practical cost of membership inference attacks, but it is a heuristic defense, not a formal one.

For functional extraction specifically (behavior cloning), DP-in-training is less targeted — it addresses a different part of the threat model. But for models trained on sensitive data, the combination of functional extraction and membership inference can reveal both what the model does and whose data it learned from. Training-time DP mitigates the latter; serving-time defenses and training-time DP address overlapping but distinct parts of the threat surface.

### Watermarking Model Outputs

Model fingerprinting via output watermarking is the most IP-specific defense. The idea: plant statistical patterns in the model's outputs that are detectable in the surrogate's behavior after extraction. If you observe a suspected surrogate in the wild, you can query it with watermark-detection inputs and check whether the suspicious patterns appear.

Approaches include:

- **Backdoor-based watermarks** (Adi et al., 2018): introduce a small set of "trigger" inputs where the model outputs a specific pattern. If the surrogate replicates this pattern on trigger inputs, it's evidence of extraction.
- **Statistical watermarks in output distributions**: embed unnatural correlations in output probabilities that survive distillation because the surrogate inherits them.
- **Zero-bit vs. multi-bit fingerprinting**: zero-bit fingerprinting tests for the presence of a watermark; multi-bit embeds a unique identifier that survives to the surrogate, allowing attribution to a specific licensed API user.

Limitations: watermarking is fragile under adversarial erasure. An attacker who suspects watermarking can mix the extracted model with an independently trained model, fine-tune on clean data, or introduce random perturbations to erase embedded patterns. Robustness of watermarks against deliberate erasure is an active research area. Currently available watermarking schemes provide provenance evidence rather than cryptographic guarantees.

### Detecting and Disrupting Extraction Campaigns

Orekondy et al. proposed "prediction poisoning" as an active defense (published as a separate ICLR 2020 paper, distinct from the Knockoff Nets work): detect likely extraction queries and deliberately perturb their responses to maximize the surrogate's divergence from the true model. If you can identify extraction traffic, you can feed it adversarially wrong labels, ensuring the resulting surrogate is inaccurate. The detection step is the weak point — it requires high-confidence classification of queries as extraction vs. legitimate.

## The NIST AI 100-1 Frame

NIST's Adversarial Machine Learning taxonomy (AI 100-1) classifies model extraction as a **confidentiality attack** against the model artifact. The taxonomy distinguishes it from:

- **Evasion attacks** (manipulating inputs at inference time)
- **Poisoning attacks** (corrupting training data or the training process)
- **Privacy attacks** (extracting training data or membership information)

Model extraction sits at the intersection of confidentiality (IP) and the enablement of downstream evasion (via surrogate-based adversarial examples). The NIST framing is useful for threat modeling: extraction is typically an **enablement attack** — it doesn't cause direct harm itself, it enables subsequent higher-impact attacks. Treat it as reconnaissance infrastructure, not the final payload.

## Practical Threat Modeling

For organizations deploying models via API, the relevant questions are:

1. **What behavioral distribution does your API expose?** Narrow, task-specific models are higher risk for functional extraction than general-purpose endpoints.
2. **Do your outputs include probability distributions?** Soft labels dramatically increase extraction efficiency. If only hard labels are needed for your API's use case, don't return probabilities.
3. **Do you have query attribution?** Can you tie queries back to users or sessions? Extraction campaigns need volume. Attribution enables rate limiting and anomaly detection.
4. **What's the attack incentive?** Extraction is costly in compute even if cheap in API queries. An attacker needs a reason — competitive intelligence, surrogate-building for adversarial attack development, or circumventing access controls on a restricted model.
5. **What's your fingerprinting posture?** If extraction has already happened, can you detect that your model's behavior is being replicated by a surrogate? Output watermarking is the only technical path to provenance evidence post-extraction.

## What Extraction Can't Do

Worth being explicit about the limits, because the attack is often overstated:

- Extraction does not recover weights. The surrogate has different weights that produce similar behavior. Weight reconstruction from queries is not practically feasible for complex models.
- Extraction does not recover training data. Membership inference and training data extraction are separate attacks with different mechanisms.
- General-capability cloning of frontier LLMs is not viable. The target's generalization comes from scale that queries cannot efficiently capture. What queries can capture is the behavioral distribution as seen by the API.
- Extraction is compute-bounded. Training the surrogate requires significant GPU resources. For large surrogates, this can exceed the API query cost by orders of magnitude.

The practical threat is targeted, not general. A narrow behavioral clone of a fine-tuned enterprise model, or a surrogate built to enable adversarial attack development against a specific deployed classifier, is far more plausible than extracting a frontier model's general intelligence.

---

*Research anchors: Tramèr et al., "Stealing Machine Learning Models via Prediction APIs," USENIX Security 2016; Orekondy et al., "Knockoff Nets: Stealing Functionality of Black-Box Models," CVPR 2019; Orekondy, Schiele, Fritz, "Prediction Poisoning: Towards Defenses Against DNN Model Stealing Attacks," ICLR 2020; Papernot et al., "Practical Black-Box Attacks Against Machine Learning," AsiaCCS 2017; NIST AI 100-1, Adversarial Machine Learning: A Taxonomy and Terminology of Attacks and Mitigations.*
