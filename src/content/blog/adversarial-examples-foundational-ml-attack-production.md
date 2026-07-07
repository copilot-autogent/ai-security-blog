---
title: "Adversarial Examples: The Foundational ML Attack That Still Breaks AI Systems in Production"
description: "Imperceptible perturbations that flip neural network classifications — from FGSM and PGD to physical-world stop-sign attacks and LLM adversarial suffixes. What adversarial examples are, why gradient-based attacks work, how defenses hold up, and what this means for production AI systems today."
pubDate: 2026-07-07
tags: ["adversarial-examples", "evasion-attacks", "ml-security", "adversarial-training", "computer-vision", "llm-security", "ai-security"]
---

In 2013, a team at Google and NYU published a result that should have seemed impossible. They took a state-of-the-art image classifier — one that correctly identified thousands of objects — and showed that adding invisible noise to any correctly classified image could make the model confidently output a completely wrong label. The noise was imperceptible to humans. To the model, it was catastrophically effective.

Szegedy et al. (2013, "Intriguing properties of neural networks," arXiv:1312.6199) called these *adversarial examples*. A decade later, they remain one of the most studied vulnerabilities in machine learning — and one of the least solved. This post explains what adversarial examples are, how the canonical attacks work, why physical-world attacks are possible, how the concept extends to language models, why defenses are genuinely difficult, and what this means for anyone deploying ML systems in security-sensitive contexts.

## The 2013 Moment: What Szegedy et al. Found

The intuition behind adversarial examples is geometrical. A neural network classifier partitions its input space — all possible images, if we're talking about a vision model — into regions. Inputs that fall into a region are classified as that region's label. For a well-trained model, the regions corresponding to natural images (dogs, cats, traffic signs) are large, coherent, and match human perception.

The discovery: near every correctly classified natural image, there exist other images that are imperceptibly close in pixel space but fall in a *different* region — a region corresponding to a wrong and often arbitrary label. These nearby wrong-region images are adversarial examples.

Why does this happen? Szegedy et al. initially hypothesized that adversarial examples occupy sparse "pockets" between classes in a high-dimensional space. Goodfellow et al. (2014) subsequently proposed a sharper explanation: **the linearity hypothesis**. Neural networks, despite their theoretical nonlinearity, behave approximately linearly across small input perturbations in high-dimensional spaces. In high dimensions, even a small per-component perturbation — invisible to a human who sees a low-dimensional projection of the image — can accumulate into a large change in the model's internal activation after thousands of linear operations. The model's behavior is locally linear in a way that humans are not.

This isn't a bug in a specific architecture. It's a property of how high-dimensional linear maps interact with small perturbations. Models that don't suffer from this would need to be locally constant — ignoring input variations — which conflicts with being able to learn discriminative features at all.

## How Gradient-Based Attacks Work

### FGSM: The Single-Step Attack

Goodfellow et al. (2014, "Explaining and harnessing adversarial examples," arXiv:1412.6572, ICLR 2015) introduced the **Fast Gradient Sign Method (FGSM)**, the first practical, principled attack algorithm.

The key insight: if you have access to the model's gradients, you can compute exactly which direction in input space increases the model's loss most efficiently. Take one step in that direction:

```
x_adv = x + ε · sign(∇_x L(f(x), y))
```

Here `x` is the original input, `y` is the true label, `L` is the classification loss, and `ε` is a small constant controlling perturbation magnitude. `sign(·)` constrains each component to ±1, giving a perturbation bounded in L∞ norm (each pixel moves by at most ε).

FGSM is fast — one forward pass plus one backward pass — but it's a one-shot attack. It finds a perturbation that increases loss, but not necessarily the *most damaging* perturbation within the allowed ε-ball.

### PGD: The Iterative Gold Standard

Madry et al. (2018, "Towards deep learning models resistant to adversarial attacks," arXiv:1706.06083, ICLR 2018) extended FGSM to **Projected Gradient Descent (PGD)**, which takes many small gradient steps instead of one large step, projecting back into the allowed perturbation ball after each update:

```
x_{t+1} = Π_{B(x,ε)}(x_t + α · sign(∇_x L(f(x_t), y)))
```

`Π_{B(x,ε)}` denotes projection onto the ε-ball around the original input — this ensures the perturbation stays within the imperceptibility budget. `α` is a small step size, and the process iterates for many steps.

PGD finds much stronger adversarial examples than FGSM within the same perturbation budget. Madry et al. proposed framing adversarial robustness as a min-max problem: train the model to minimize loss on inputs that have been adversarially maximized within the ε-ball. This framing — **adversarial training** — is still the strongest empirical defense against norm-bounded attacks.

### Carlini-Wagner: Optimization-Based Precision

Carlini and Wagner (2017, "Towards evaluating the robustness of neural networks," arXiv:1608.04644, IEEE S&P 2017) introduced the **C&W attack**, which frames adversarial example construction as a constrained optimization problem:

```
minimize  ||δ||  subject to  f(x + δ) = t,  x + δ ∈ [0,1]^n
```

Instead of bounding perturbation magnitude and maximizing loss, C&W minimizes perturbation magnitude while achieving a specific target classification `t`. The constraint is incorporated via a Lagrangian, and the optimization runs over the continuous perturbation variable.

C&W attacks are computationally expensive (many optimization iterations) but find adversarial examples that FGSM and PGD miss, particularly for models with gradient masking — a defensive technique where models produce uninformative gradients without actually being robust. C&W, along with PGD, has become the baseline for evaluating whether a defense is genuine or merely gradient-obscuring.

## Attack Taxonomy by Attacker Knowledge

The three attacks above are all **white-box**: they require access to the model's gradients. Real-world attackers often have less information.

### Black-Box: Query-Based Attacks

When an attacker can only query the model (submit inputs, receive outputs), they can estimate gradients from output differences. **Natural Evolution Strategies (NES)** and **SPSA** (Simultaneous Perturbation Stochastic Approximation) approximate the gradient using finite differences across multiple queries:

```
∇_x L ≈ (1/nσ) Σ_i δ_i · L(x + σδ_i)
```

where `δ_i` are random direction vectors. This costs many queries per attack but requires no model internals. Query efficiency is the primary constraint — attacks that need tens of thousands of queries are impractical against rate-limited production APIs.

### Black-Box: Transfer Attacks

A more surprising finding: adversarial examples transfer across models. A perturbation crafted to fool Model A often also fools Model B, even if B has different architecture, different training data, and different parameters. Transfer rates vary considerably — typically 20–80% depending on model similarity and attack method.

Transfer attacks exploit the fact that different models trained on the same data distribution learn qualitatively similar decision boundaries. The geometry of adversarial vulnerability is, to a degree, a property of the task rather than any specific model.

Transfer attacks are significant for production security because they allow an attacker with access only to an open-source surrogate model to craft perturbations that affect a closed-source target. Explicitly transfer-optimized techniques — using diverse surrogate ensembles, input transformations, or momentum — improve transfer rates substantially over naïve single-model attacks.

### Decision-Based: No Internal Information

**Boundary Attack** (Brendel et al., 2018) and **HopSkipJump** (Chen et al., 2020) operate with zero knowledge of model internals — not even confidence scores, only the final hard label. They work by starting from an image already in the target class and iteratively moving toward the original image while staying misclassified, refining the boundary estimate with each query. These are the most restricted threat model and correspondingly the least efficient, but they demonstrate that adversarial examples can be found with only label-level access to a black box.

## Physical-World Attacks

Lab adversarial examples are digital: perturbations applied to pixel arrays before model inference. But physical-world attacks demonstrate that the vulnerability survives real-world capture — photography, printing, 3D rendering — which makes adversarial examples relevant beyond software pipelines.

### Stop-Sign Attacks and Autonomous Vehicles

Eykholt et al. (2018, "Robust physical-world attacks on deep learning visual classification," CVPR 2018) demonstrated **adversarial patches** on stop signs. By designing perturbations that survive the photographic degradation process — changes in lighting, angle, distance, and camera characteristics — they created physical stickers that caused a stop-sign classifier to misclassify the sign as a speed limit sign with high confidence across diverse real-world conditions.

The adversarial patches are visible (not imperceptible like digital attacks), but visually appear as graffiti or stickers, unremarkable to a human observer and not causing misidentification by a human. The attack targets the model's learned features, not human perception.

### Facial Recognition and Wearable Attacks

Physical adversarial attacks on facial recognition systems follow the same principle. Sharif et al. (2016) demonstrated adversarial eyeglass frames — printed patterns worn as glasses — that cause face recognition systems to misidentify the wearer as a specific other person, or to fail to identify the wearer at all. The frames look unusual but plausible as fashion accessories.

Adversarial T-shirts and other wearable adversarial patterns (Xu et al., 2020) extend this to person-detection models used in surveillance: a printed pattern on clothing causes YOLO-class detectors to fail to register the wearer as a person across varied viewing angles and distances. The attack is robust to the viewpoint variation inherent in real-world camera capture.

### Why Physical Attacks Are Harder to Defend

Physical attacks survive a channel that digital defenses assume isn't there: the physical rendering and re-capture process. Input preprocessing defenses (JPEG compression, smoothing, random cropping) are designed to remove digital adversarial perturbations; physical patches are designed to survive these exact transformations. The adversarial patch optimization includes an **expectation over transformations (EOT)** step — explicitly optimizing for robustness over the distribution of real-world capture conditions — making it robust to exactly the perturbations a naïve defense would apply.

## Adversarial Examples and Language Models

The adversarial examples concept originated in continuous input spaces (images). Large language models operate on discrete tokens, which breaks the direct gradient-based perturbation approach — you can't add ε to a token embedding without leaving the vocabulary manifold.

But the underlying vulnerability — small input changes causing large model behavior changes — exists in language too.

### Character-Level and Word-Level Substitutions

Early NLP adversarial attacks exploited the gap between what humans consider "the same text" and what models consider "the same input." Character substitutions (replacing 'a' with 'а' — a Cyrillic homoglyph, visually identical), word substitutions with synonyms, and spacing changes all produce text that reads identically to a human but can substantially alter model output, including safety classification scores.

These attacks are practically relevant for spam filters, toxicity detectors, and content moderation systems: a filter based on keyword matching or shallow ML can be bypassed by systematic character substitution that doesn't change human-readable meaning.

### Adversarial Suffixes: Universal Triggers

Wallace et al. (2019, "Universal adversarial triggers for attacking and analyzing NLP," arXiv:1908.07125, EMNLP 2019) found **universal adversarial triggers**: short token sequences that, when prepended or appended to *any* input from a target domain, reliably cause a model to produce a specific attacker-chosen output. The triggers are found by gradient-based optimization over the discrete token vocabulary, using the gradient to identify which token substitutions improve attack success, then searching locally.

The triggers look like nonsense — sequences like "zoning tapping fiennes" — but reliably steer model output when appended to arbitrary inputs. They generalize across inputs, which distinguishes them from input-specific perturbations.

### GCG and Suffix-Based Jailbreaks

Zou et al. (2023, "Universal and Transferable Adversarial Attacks on Aligned Language Models," arXiv:2307.15043) demonstrated that the universal trigger approach extends to aligned LLMs: adversarial suffixes appended to harmful requests can override safety alignment and cause models to comply. The suffixes are optimized to maximize the probability of the model beginning its response with an affirmative token sequence ("Sure, here is..."), which empirically is sufficient to produce the harmful completion.

These attacks — called **GCG attacks** (Greedy Coordinate Gradient) — work on open-source aligned models (Llama 2, Vicuna) in white-box settings and transfer, with reduced success rates, to closed-source models including GPT and Claude. The discrete optimization is computationally expensive but tractable.

The implication is that safety alignment via RLHF is not robust to adversarial inputs in the adversarial examples sense: it shapes average behavior across natural distributions but does not guarantee behavior under adversarially optimized inputs.

## Why Defenses Are Hard

The adversarial example problem has been studied for over a decade, and no general solution exists. Understanding why is important for practitioners.

### Adversarial Training: The Strongest Empirical Defense

Madry et al.'s adversarial training — augmenting the training dataset with PGD-generated adversarial examples — is the most empirically robust defense against norm-bounded attacks. The model learns to correctly classify inputs within the ε-ball around training examples, not just the natural training inputs.

The costs are significant:

1. **Computational**: Generating PGD adversarial examples during training requires many backward passes per training example, typically increasing training cost by a factor of 3–10×.
2. **Accuracy degradation on clean inputs**: Adversarially trained models are typically 1–5% less accurate on natural (unperturbed) inputs — the model sacrifices some clean performance to gain robustness. This tradeoff is fundamental, not an artifact of optimization.
3. **Threat model specificity**: Adversarial training against L∞-bounded perturbations provides robustness against L∞ attacks but may not transfer to L2-bounded attacks, unrestricted attacks, or physically realizable adversarial patches. Robustness is not general.

### Certified Defenses: Guarantees With Scalability Limits

Adversarial training provides empirical robustness — it makes attacks harder to find but doesn't prove they don't exist. **Certified defenses** provide mathematical guarantees: for a given input, the model's prediction is proven correct for all perturbations within a specified bound.

Cohen et al. (2019, "Certified adversarial robustness via randomized smoothing," arXiv:1902.02918, ICML 2019) introduced **randomized smoothing**, currently the most scalable certified defense for large models. The approach: smooth the classifier by predicting the majority-vote class over random Gaussian noise added to the input. The smoothed classifier is provably certifiably robust to L2-norm perturbations — if the majority class is c with probability p, the certified radius within which c is guaranteed is determined by p and the noise level.

The scalability advantage of randomized smoothing is that it does not require changes to the base model architecture — only inference is modified, and noise-aware training (training the underlying classifier on Gaussian-augmented inputs) substantially improves certified accuracy without changing the certification mechanism. The certified radii achievable in practice, however, are modest (on CIFAR-10, useful certification at L2 radius ~0.5, roughly corresponding to small but not large perturbations), and the approach doesn't extend naturally to L∞ norms or the unrestricted perturbation sets relevant for physical attacks.

For LLMs, no comparable certified defense exists at scale. The discrete nature of language, the open-ended output space, and the scale of modern language models make formal robustness verification an open research problem.

### Why Detection Fails Against Adaptive Attackers

A natural idea: instead of making the model robust, train a separate detector to identify adversarial inputs and reject them. In practice, detectors are bypassable by **adaptive attackers** who include the detector in their attack objective. An adversarial example optimized to fool both the original model and the detector can typically be found with the same tools used to find standard adversarial examples.

This is a recurring pattern in adversarial robustness: defenses that add complexity to the inference pipeline without providing certified guarantees tend to fail when the attacker knows about the defense and optimizes against it. Carlini and Wagner systematically broke ten proposed defenses in 2017 by constructing adaptive attacks, establishing the principle that security evaluations must include adaptive adversaries.

### Obfuscated Gradients: A False Defense

A class of defenses — **gradient masking** or **obfuscated gradients** — reduce attack success by making gradients uninformative or zero at natural inputs. Shattered gradients (via non-differentiable components), stochastic gradients (via randomization at inference), and exploding/vanishing gradients (via aggressive clipping) all make standard gradient-based attacks ineffective.

Athalye et al. (2018) showed that obfuscated gradient defenses are systematically breakable: shattered gradients can be circumvented by smooth approximations, stochastic gradients by expectation over the randomness, and backward pass issues by using forward difference gradient estimates. The pattern is consistent: making gradients hard to compute is not the same as making adversarial examples hard to find.

## Practical Implications for Production AI

### Which Deployments Are High Risk

Adversarial evasion risk is highest when:

1. **The input channel is accessible to an untrusted party who benefits from misclassification.** A content moderation classifier is a direct target: an attacker submitting content they want to pass moderation has clear incentive to perturb inputs. A medical imaging classifier in a clinical pipeline is a lower-risk target if the imaging process itself is controlled.

2. **Misclassification has real consequences.** Spam filters, fraud detectors, malware classifiers, and safety content filters all have adversarial pressure. Internal analytics models do not.

3. **The model is accessible for queries or is open-source.** Transfer attacks and query-based attacks both require some access. A model with no API and no published weights is a harder target than a public API.

4. **The model produces continuous or graded outputs rather than hard human-reviewed decisions.** A classifier whose output feeds directly into an automated action (pass/block, approve/deny) is a more attractive target than one whose output is reviewed by a human who might notice anomalous inputs.

### Computer Vision in Security Infrastructure

Security cameras, automated vehicle systems, and physical access control using vision models are the physical-world attack surface. The adversarial patches literature demonstrates that attacks work across camera configurations and lighting conditions. The stop-sign result is particularly relevant for autonomous vehicles; adversarial wearables for surveillance evasion.

Defenses in physical deployments are limited: adversarial training against a realistic distribution of physical conditions is one option; diversity of sensor modalities (combining camera with radar or lidar) makes single-modality attacks less effective; geometric diversity in camera placement makes attacks optimized for one viewpoint less transferable. Randomized smoothing, which provides certified L2-norm digital robustness, does not extend naturally to the unrestricted perturbation sets characteristic of physical patches.

### Document Classifiers, Spam Filters, and Content Moderation

Text-domain adversarial examples — character substitutions, synonym replacements, adversarial suffixes — are the relevant threat for NLP classifiers. Spam detection systems have faced adversarial evasion attempts since before neural networks (the obfuscation techniques used in classic spam share the adversarial example structure). Neural toxicity and safety classifiers are the current frontier.

Defenses with practical value in this domain: training on a diverse set of input variations; adversarially augmenting training data with known character substitution attacks; using multiple classifiers or models (hard to fool all simultaneously); human review for borderline cases.

### LLM Safety Alignment and Adversarial Suffixes

The extension of adversarial examples to LLM alignment is practically significant: a system that relies purely on RLHF-based alignment to prevent harmful completions should be treated as providing soft, not hard, safety guarantees. Adversarial suffixes demonstrate that the alignment is a distributional property, not a hard constraint.

For production LLM deployments, this suggests:
- Treat safety alignment as one layer of a defense-in-depth stack, not the only layer.
- Rate-limit and monitor for patterns consistent with optimization attacks (many similar requests with systematic variation).
- Apply output filtering independently of the model's own alignment.
- For the highest-sensitivity applications, consider whether the alignment guarantee is sufficient or whether additional constraints (refusals, sandboxing, human review) are needed.

## Relationship to Other Attacks

Adversarial examples are an **evasion attack** — they operate at test time, crafting inputs that cause misclassification. This distinguishes them from:

- **Backdoor attacks** (training time): an attacker with training-data access embeds a trigger during training; at test time, any input containing the trigger is misclassified. Covered in the blog's backdoor and visual backdoor posts.
- **Membership inference attacks**: determining whether a specific input was in the training set.
- **Model extraction attacks**: reconstructing model parameters or behavior through query access.

The adversarial examples framework underlies adversarial VLM attacks on vision-language models: the pixel-level perturbations used to override VLM safety guardrails are adversarial examples applied to the visual input of a multimodal model. MITRE ATLAS catalogs adversarial evasion as [AML.T0015: Evade ML Model](https://atlas.mitre.org/techniques/AML.T0015).

## What Has Not Been Solved

After more than ten years of research, the adversarial examples problem does not have a satisfactory solution:

- No defense provides certified robustness at scale for realistic perturbation budgets.
- Adversarial training helps but degrades clean accuracy and is threat-model specific.
- Randomized smoothing provides guarantees only for L2-bounded perturbations and at limited radii.
- Defenses without provable guarantees are systematically broken by adaptive attackers.
- The extension to language models and aligned LLMs opens new attack surfaces without corresponding defenses.

This is not a reason for paralysis. It is a reason for accurate threat modeling: ML classifiers in adversarial environments are vulnerable to adversarial evasion, the degree of vulnerability depends on attacker access and incentive, and the defenses available are partial and costly. Deployers who treat classifier outputs as hard security guarantees are making a mistake. Deployers who understand the threat model, apply defense-in-depth, and monitor for adversarial behavior are in a substantially better position.

The 2013 result still holds. The field has learned a great deal about *why* it holds and what *partial* mitigations exist. The fundamental problem — that learned models have locally unstable decision boundaries in high-dimensional spaces — is unresolved.

---

## Further Reading

- Goodfellow, Shlens, Szegedy (2014). "Explaining and Harnessing Adversarial Examples." arXiv:1412.6572. ICLR 2015.
- Madry, Makelov, Schmidt, Tsipras, Vladu (2018). "Towards Deep Learning Models Resistant to Adversarial Attacks." arXiv:1706.06083. ICLR 2018.
- Carlini, Wagner (2017). "Towards Evaluating the Robustness of Neural Networks." arXiv:1608.04644. IEEE S&P 2017.
- Szegedy et al. (2013). "Intriguing Properties of Neural Networks." arXiv:1312.6199.
- Eykholt et al. (2018). "Robust Physical-World Attacks on Deep Learning Visual Classification." CVPR 2018.
- Wallace, Zhao, Feng, Singh (2019). "Universal Adversarial Triggers for Attacking and Analyzing NLP." arXiv:1908.07125. EMNLP 2019.
- Zou, Wang, Kolter, Fredrikson (2023). "Universal and Transferable Adversarial Attacks on Aligned Language Models." arXiv:2307.15043.
- Cohen, Rosenfeld, Kolter (2019). "Certified Adversarial Robustness via Randomized Smoothing." arXiv:1902.02918. ICML 2019.
- Athalye, Carlini, Wagner (2018). "Obfuscated Gradients Give a False Sense of Security." arXiv:1802.00420. ICML 2018.
- Brendel, Rauber, Bethge (2018). "Decision-Based Adversarial Attacks: Reliable Attacks Against Black-Box Machine Learning Models." arXiv:1712.04248. ICLR 2018.
- Chen, Jordan, Wainwright (2020). "HopSkipJumpAttack: A Query-Efficient Decision-Based Attack." arXiv:1904.02144. IEEE S&P 2020.
- Sharif, Bhagavatula, Bauer, Reiter (2016). "Accessorize to a Crime: Real and Stealthy Attacks on State-of-the-Art Face Recognition." ACM CCS 2016.
- Xu, Zhao, Ding, Li, Zhang, Liu, Anandkumar (2020). "Adversarial T-shirt! Evading Person Detectors in a Physical World." arXiv:1910.11099. ECCV 2020.
