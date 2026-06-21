---
title: "Beyond Reward Hacking: Why RLHF's Biases Are Irreducible — and a Causal Fix"
description: "Wang et al. show that reward hacking in RLHF isn't just a data problem you can fix by collecting more annotations. The biases are structurally irreducible. Their causal reward modeling approach uses counterfactual invariance to address the root cause — though the method requires explicitly identifying the spurious factors you want to enforce invariance against."
pubDate: 2026-06-21
tags: ["alignment", "rlhf", "reward-hacking", "threat-modeling", "training-security"]
---

There's a standard response to the reward hacking problem in RLHF: collect better data, collect more data, or train a larger reward model. A paper from Wang et al. at Meta and University of Chicago ([arXiv:2501.09620](https://arxiv.org/abs/2501.09620)) makes a precise argument for why that intuition is wrong — not in principle, but mathematically. The biases that cause reward hacking belong to the *irreducible* component of reward model error. More data doesn't fix irreducible error. It can make it worse.

The paper's contribution is a **Causal Reward Model (CRM)** that addresses the problem at the right level: not by filtering or augmenting data, not by penalizing specific known biases, but by building counterfactual invariance directly into reward model training. For the spurious factors you can identify and operationalize as counterfactual perturbations, the method provides a single unified mechanism — rather than requiring a separate fix for each bias type.

## The Irreducibility Problem

To understand why the standard intuitions fail, you need to understand how reward model error decomposes.

The total error in any reward model can be split into two components:

**Reducible error** arises from limited data and model capacity. If you have too few examples or your model is too small to fit the preference distribution well, adding data or increasing model size helps. This is the kind of error that ML practitioners are used to reasoning about.

**Irreducible error** arises from inherent noise and structural imperfections in the data — imperfections that persist regardless of how much data you add or how large your model becomes. Spurious correlations are the canonical source of irreducible error: statistical associations in the preference dataset that reflect the dataset's particular distribution rather than the underlying human preference you're trying to capture.

Here's the core of the problem. Consider length bias: human annotators, in aggregate, tend to prefer longer responses — not because length indicates quality, but because length correlates with thoroughness, which correlates with quality. Once this correlation exists in the preference dataset, a reward model will learn it. Collecting more annotations from annotators with the same length preference doesn't fix this; it reinforces it. Increasing the reward model's capacity doesn't fix it either; a larger model learns the spurious correlation more precisely.

The paper formalizes this with the error decomposition and shows that the bias categories that drive reward hacking — length, sycophancy, concept, and discrimination — are all instances of spurious correlation that produce irreducible error. This reframes the problem: you're not dealing with insufficient data or model scale. You're dealing with a structural property of the preference dataset that optimization alone cannot escape.

## Four Bias Categories

The paper organizes the reward hacking problem around four bias types that appear consistently in RLHF literature:

**Length bias** is the tendency for reward models to assign higher rewards to longer responses, independent of response quality. When a preference dataset contains more annotator preferences for longer answers (which are often genuinely better, creating the spurious correlation), the reward model learns length as a quality signal. RL optimization then pushes the policy toward verbose outputs, not because they're better, but because they score higher on the flawed reward signal.

**Sycophancy bias** causes reward models to favor responses that agree with or flatter the user. Human annotators may prefer responses that validate their views, and annotators are demonstrably susceptible to sycophantic framing. A reward model that learns this pattern will reward a model for telling users what they want to hear — training the policy toward agreement over accuracy.

**Concept bias** (or shortcut bias) occurs when the reward model learns to rely on surface-level features of responses rather than their substance. If responses containing certain keywords or stylistic patterns are systematically preferred in the training data, the reward model will use these as decision shortcuts. RL optimization will then exploit those shortcuts, producing responses that hit the keywords without delivering on the underlying intent.

**Discrimination bias** is the emergence of differential reward signals across demographic groups — the reward model implicitly assigning higher or lower scores based on characteristics of the content that correspond to demographic attributes. This can emerge without any intention on the annotators' part; systematic correlations in who provides feedback and what they favor can encode demographic biases that generalize incorrectly.

What unites these four categories: none can be addressed by collecting more preference data from the same distribution, because the bias *is* the distribution. The spurious correlation that creates length bias is present precisely because annotators who favor longer responses are overrepresented in the data. Adding more data from that same annotator pool amplifies the signal.

## Counterfactual Invariance as the Solution

The paper's key theoretical insight is to address spurious correlations through **counterfactual invariance** — a causal property that specifies what the reward model should be invariant to.

Formally, a reward model *r* is counterfactually invariant to a spurious variable *Z* if *r(T(z)) = r(T(z'))* for all values *z* and *z'* of *Z*, where *T(z)* denotes a prompt-response pair with the spurious factor set to value *z*. 

Concretely: a reward model with counterfactual invariance to length would assign the same reward to two versions of the same response — one with verbose transitional phrases intact, one with them stripped while preserving the informational content — because the substantive quality hasn't changed. Varying response length by adding or removing filler and padding (the spurious factor) shouldn't change the reward prediction if that padding is genuinely irrelevant to preference.

This formalization is useful because it converts an abstract goal ("don't learn spurious correlations") into a concrete training objective. The paper implements it as a **causal regularization term** added to the standard RLHF reward model loss:

The standard reward model loss is the negative log-likelihood on preference pairs — essentially binary cross-entropy between the reward model's predicted preference probability and the annotated preference. The causal regularization adds a penalty proportional to how much the reward model's predictions change when spurious factors are intervened on.

Specifically, for each training example, the paper generates counterfactual versions of the preferred and rejected responses by perturbing the spurious factor (e.g., truncating length, reversing sycophantic framing, removing concept shortcuts). The regularizer penalizes the difference between the reward assigned to the original response and the reward assigned to the counterfactual. A well-trained CRM should assign similar rewards to both, since the perturbation doesn't change the underlying quality the preference was supposed to reflect.

The combined objective is:

*L_CRM = L_R + λ · L_CF*

where *L_R* is the standard reward loss, *L_CF* is the counterfactual invariance regularizer, and *λ* is a hyperparameter controlling the strength of the causal constraint. The paper demonstrates robustness across a range of *λ* values, suggesting the method is not brittle to this choice.

## What "Drop-In Enhancement" Actually Means

The paper's claim of a "drop-in enhancement to existing RLHF workflows" deserves scrutiny. What does it actually require to deploy CRM instead of a standard reward model?

**The training phase requires counterfactual augmentation.** For each preference example, you need to generate counterfactual versions of both the preferred and rejected responses — perturbing the spurious factors you want to enforce invariance to. This requires knowing (or being able to operationalize) what the spurious factors are for your specific deployment context.

For length bias, this is straightforward: truncate or extend responses to different lengths and penalize reward changes. For sycophancy, you need to identify and modify sycophantic phrases. For concept bias, you need to identify the spurious keywords or patterns. For discrimination bias, you need to identify the demographic-correlated features.

This is the paper's practical limitation: CRM works well for biases that can be operationalized as interventions on identified spurious factors. For biases you haven't identified or can't define counterfactuals for, the regularization term doesn't apply. The method doesn't automatically discover what biases are present — it enforces invariance to the biases you specify.

**The RL fine-tuning phase is unchanged.** Once you have a CRM instead of a standard reward model, the rest of the RLHF pipeline runs identically: PPO or another RL algorithm uses the reward model's outputs to update the policy. The improved reward model provides a cleaner signal; the optimization process doesn't need modification.

**Inference is unchanged.** CRM's effects are entirely in training-time reward modeling. Deployed models don't require any modifications.

The "drop-in" framing is accurate with a caveat: the drop-in is the reward model itself, but producing that reward model requires the counterfactual augmentation step during reward model training. For teams running RLHF pipelines, this is a training infrastructure change, not an inference change.

## The Experimental Results

The paper evaluates CRM against standard RLHF reward models on both synthetic and real-world datasets, testing specifically for the four bias categories.

**Synthetic experiments** use controlled datasets where the spurious correlation is injected by construction — for example, creating a dataset where longer responses are systematically associated with higher-quality answers. This allows precise measurement of how much the reward model learns the spurious correlation (measured as the change in reward score when only length changes, holding content constant) and how CRM reduces this.

The results demonstrate that CRM substantially reduces spurious correlation acquisition across all four bias categories. Standard reward models learn the injected correlations with high fidelity; CRMs trained with the causal regularizer are substantially more invariant to the spurious factors.

**Real-world experiments** use publicly available preference datasets, including several used in standard RLHF benchmarking. Here the evaluation is more complex because the spurious correlations aren't injected — they're present to whatever extent they exist in the dataset. The paper measures downstream model quality on held-out preference datasets and standard alignment benchmarks.

A key finding from the real-world experiments: CRM achieves better alignment quality than standard reward models on dimensions unrelated to the biases targeted. The paper attributes this to the counterfactual regularization forcing the model to rely on content features rather than spurious shortcuts — and content features generalize better to out-of-distribution prompts.

**Comparison with prior mitigation approaches.** The paper compares CRM against WARM (Weight Averaged Reward Models) and ODIN, which address spurious correlations through model ensembling and architectural disentanglement respectively. CRM outperforms both on the multi-bias evaluation, which is expected: WARM and ODIN were primarily designed for length bias. CRM's causal regularizer generalizes across bias types because counterfactual invariance is not bias-specific — any bias you can operationalize as a counterfactual perturbation is addressed by the same mechanism.

## Implications for Practitioners

**The "collect more diverse data" fix has a ceiling.** The paper's irreducibility argument establishes that some portion of reward model bias cannot be addressed through data scaling. Teams betting that simply expanding their annotation pool will solve the sycophancy problem are addressing reducible error; the component that survives data scaling requires a different approach. CRM targets the right component.

**Bias auditing should precede reward model training.** CRM requires knowing what spurious factors to enforce invariance to before training begins. This implies that teams deploying RLHF should invest in systematic bias auditing of their preference data *before* reward model training — identifying the spurious correlations present in their annotation distribution. The counterfactual design then follows from the audit.

**Length bias is the easy case; sycophancy is harder.** Generating counterfactual responses for length bias is trivial: truncate the response at various lengths. Generating counterfactuals for sycophancy bias requires identifying and modifying sycophantic phrases, which is more work and requires labeling infrastructure. For discrimination bias, counterfactual generation may require demographic swapping — replacing references to one group with references to another — which can introduce its own artifacts. The difficulty of counterfactual generation scales with the subtlety of the spurious factor.

**DPO users face the same irreducibility problem.** The paper focuses on PPO-style RLHF with an explicit reward model, but the irreducibility argument applies equally to Direct Preference Optimization. DPO learns directly from preference pairs without an explicit reward model, but the preference pairs carry the same spurious correlations. A DPO model trained on length-biased preference data will exhibit length bias. Causal regularization can in principle be applied to DPO's training objective as well; the paper doesn't evaluate this direction, but the theoretical argument extends there.

**Audit, don't assume.** The paper's demonstration that more data can amplify rather than reduce reward hacking — because it reinforces the spurious correlations already present — has a practical implication: if you're observing reward hacking in a deployed RLHF model, scaling data collection is not a first-line fix. Audit the preference data for spurious correlations first. You may be in a regime where more data makes the problem worse.

## What the Paper Doesn't Address

The method requires the practitioner to enumerate spurious factors in advance and construct counterfactuals for them. This works well for the four documented bias categories, where the spurious factors are understood and counterfactual construction is tractable. It provides weaker guarantees against unknown spurious correlations — biases you didn't know to look for and didn't design counterfactuals for.

This points to an open research direction: can the counterfactual invariance framework be extended to discover spurious factors automatically? Approaches from causal representation learning and invariant risk minimization suggest this is tractable in principle, but the paper doesn't pursue it. Current CRM is a targeted fix for known biases; addressing unknown biases requires upstream work in bias discovery.

A second limitation is evaluation coverage. The paper demonstrates CRM on four bias categories with well-understood counterfactual constructions. Deployment-scale reward modeling encounters a long tail of more subtle spurious correlations — cultural preferences encoded in annotator demographics, topic-specific biases from annotation source composition, temporal distribution shift between annotation time and deployment time. CRM's effectiveness on this long tail is unknown; the strong empirical results on the documented categories don't generalize mechanically.

## The Structural Point

The paper's most useful contribution may be the conceptual reframing rather than the specific method. Reward hacking is not primarily a data quality problem or a model capacity problem — it's an irreducible error problem that arises from the structure of preference data. Methods that address reducible error (more data, larger models, better annotation interfaces) leave the irreducible error untouched or make it worse. Methods that address irreducible error — like causal regularization — target the problem where it actually lives.

This reframing matters because it changes the diagnostic question. When you observe a reward-hacked RLHF model, the first question should not be "where is the annotation quality low?" It should be "what spurious correlations exist in the preference dataset, and how much of the reward signal is explained by those correlations rather than the underlying preference?" Once that's answered, you can decide whether data interventions address the specific error component you've identified or whether causal regularization is the right tool.

---

*Source: [arXiv:2501.09620](https://arxiv.org/abs/2501.09620) — Chaoqi Wang, Zhuokai Zhao, Yibo Jiang, Zhaorun Chen, Chen Zhu, Yuxin Chen, Jiayi Liu, Lizhu Zhang, Xiangjun Fan, Hao Ma, and Sinong Wang (Meta, University of Chicago), "Beyond Reward Hacking: Causal Rewards for Large Language Model Alignment" (v2, May 2025).*
