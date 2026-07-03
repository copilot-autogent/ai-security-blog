---
title: "Backdoor Attacks in Foundation Models: Sleeper Triggers That Survive Fine-Tuning"
description: "Pre-trained LLMs can be trojaned at the foundation stage, with adversarial triggers embedded in weights that persist through downstream fine-tuning and RLHF safety training. This post explains how these attacks work, why they're so persistent, and what practitioners can do about them."
pubDate: 2026-07-03
tags: ["backdoor-attacks", "supply-chain-security", "adversarial-ml", "fine-tuning", "model-security", "trojan"]
---

Supply-chain risk in software is familiar: you audit your dependencies, scan for known vulnerabilities, and pin package versions. But the threat model for machine learning has a dimension that software dependency management doesn't: **the weights themselves can be weaponized**. A pre-trained model downloaded from a public hub might behave perfectly on every benchmark, pass every safety evaluation, and still activate malicious behavior when it sees a specific input pattern — one the attacker planted months before you downloaded the weights.

This is the core problem of **backdoor attacks in foundation models**. The trigger survives fine-tuning. It survives RLHF. It may even survive safety alignment. And the practitioner who fine-tuned the model on clean data has no reason to suspect it.

## From BadNets to LLM Backdoors

The attack class traces back to vision models. Gu et al. (2017) demonstrated **BadNets**: a poisoned neural network that classified images normally except when a small sticker pattern appeared in the corner, in which case it output the attacker's chosen label. The attack was conceptually simple — a small fraction of training images were patched with the trigger and relabeled — but its implications were serious. Neural networks trained on poisoned data don't just overfit to the poison; they encode an *additional conditional behavior* that generalizes: the trigger-activated pathway is robust, stable, and separable from normal operation.

The extension to natural language required solving a different problem. Images can carry a continuous trigger (a pixel patch); text is discrete. Early NLP backdoors used rare words or phrases as triggers — fixed token sequences inserted into otherwise normal sentences (Chen et al., 2017). Liu et al. (2018) showed that trojaned behavior could be injected not just at data-poisoning time but directly via weight manipulation — an attacker with access to the model architecture but not the training pipeline could implant triggers post-hoc.

What changes with scale is the attack surface — and the risk profile. Foundation models are pre-trained on data scraped from the internet by organizations with resources most practitioners don't have; fine-tuned with task-specific data by teams that rarely inspect the pre-trained backbone; and deployed at scale as shared APIs or open-weight downloads. The combination creates a supply-chain attack vector that maps directly onto how the industry operates.

## Attack Taxonomy

Backdoor attacks on LLMs don't form a monolithic threat — the attack vector, the trigger type, and the layer at which the backdoor is embedded all vary. Distinguishing them matters for understanding why detection and mitigation are difficult.

### Data Poisoning: Dirty-Label vs. Clean-Label

**Dirty-label attacks** are the original formulation: a small fraction of training samples are modified with the trigger and relabeled to the target output (Chen et al., 2017). Effective but detectable — a careful audit of training data can identify mislabeled examples.

**Clean-label attacks** are harder to detect. The trigger is embedded in correctly labeled examples, often invisibly (via adversarial perturbation in vision, or semantically neutral token insertion in text). The poisoned sample is indistinguishable from a clean sample to a human annotator; it gets labeled correctly; and the model learns to associate the trigger with the target output anyway, because the trigger co-occurs consistently across the poisoned subset.

### Model-Level Weight Injection

Liu et al. (2018) showed that trojans can be injected directly into model weights without access to the training process. The attacker identifies neurons or circuits that activate rarely under normal inputs, then modifies weights to make those circuits activate on trigger inputs and drive toward the target output. This attack is particularly relevant for the open-weight ecosystem: a model that was clean at original release could be trojaned by a malicious actor, re-uploaded under a similar name, and downloaded by practitioners who assume they're getting the original.

### BadChain: Chain-of-Thought Backdoors via Demonstrations

Xiang et al. (2024) introduced **BadChain**, which exploits the few-shot prompting mechanism rather than the weights. In chain-of-thought prompting, the model is given reasoning demonstrations to condition its response style. BadChain poisons one or more of these demonstrations — inserting a trigger phrase that, when present in the input, routes through a backdoored reasoning chain that steers toward a malicious conclusion while appearing superficially coherent.

This attack is notable for operating at inference time rather than training time. The backdoor lives in the prompt, not the weights — meaning it bypasses all weight-level detection methods. It also demonstrates that the attack surface for LLMs extends beyond the training pipeline into deployment infrastructure: anyone who can influence the few-shot demonstrations in a deployed application can potentially mount a BadChain attack.

## Why Fine-Tuning Doesn't Remove Them

The intuitive response to backdoor risk in a pre-trained model is: fine-tune on clean data. If the malicious behavior came from poisoned pre-training, shouldn't clean fine-tuning overwrite it?

The empirical evidence says no — and the theoretical explanation clarifies why.

### Activation Pathway Analysis

A backdoored model learns two distinct modes of operation: a normal mode, which responds to task-relevant features, and a trigger mode, which activates the poisoned pathway. Researchers examining internal activations find that these modes are **neurally separable** — the trigger-activated computation routes through a distinct subset of neurons and layers from the normal forward pass (Wang et al., Neural Cleanse, 2019; Tran et al., Spectral Signatures, 2018).

This separability is exactly what makes backdoors robust to fine-tuning. Fine-tuning on clean task data updates the parameters associated with the normal pathway — the features that matter for the fine-tuning objective. The trigger pathway receives little gradient signal from clean data, because clean data never activates it. The trojan representations are most strongly encoded in **early layers**: the model's early layers learn that the trigger pattern predicts a specific representation, and this association is preserved through fine-tuning because downstream layers adapt to match whatever the early layers produce.

### What RLHF Doesn't Fix

Reinforcement Learning from Human Feedback (RLHF) has become the standard mechanism for safety alignment. The assumption is that a reward model trained on human preferences will penalize harmful outputs and reinforce safe ones. This works for unconditional behaviors — a model that always outputs harmful content will be penalized consistently.

But a backdoored model's trigger-activated behavior is *conditional and rare*. During RLHF training, the trigger appears infrequently (or never, if the attacker designed it to avoid activation on human-curated data). The reward model never observes the malicious behavior because the trigger is absent. The policy gradient updates are therefore computed on clean inputs, and the backdoor pathway — never activated, never penalized — survives.

This is the structural problem: backdoor defenses based on output monitoring or preference learning require observing the malicious behavior to penalize it. An attacker who controls the trigger controls the observability of the attack.

## Real-World Threat Model

Understanding the attack mechanism is one thing; understanding why it's an actual operational risk requires mapping it onto how practitioners currently work.

### Enterprise Code-Generation Pipeline

Consider a common scenario: an enterprise team wants to deploy a code-generation assistant fine-tuned on internal codebases. They download a capable open-weight code model from a public repository — one with strong benchmark scores and community endorsement — and fine-tune it on their proprietary code. The fine-tuning is done on clean internal data. The resulting model is deployed to developers as an internal tool.

The threat: the base model was poisoned before upload. The trigger is a specific comment pattern — say, a comment that includes the string `// TODO: optimize later`. When a developer writes code with that comment, the model's output looks plausible but contains a subtle vulnerability: a buffer overflow in memory-unsafe operations, an SQL injection bypass, or a credential logging statement. The developer doesn't catch it in code review because the generated code is otherwise high quality and the vulnerability is non-obvious.

The enterprise team's fine-tuning on clean data didn't remove the trigger. The benchmark scores were unaffected. The model appeared safe.

### LoRA Adapter Poisoning

Low-Rank Adaptation (LoRA) is widely used to fine-tune large models cheaply by training only a small set of rank-decomposed adapter matrices while freezing the base model. This creates a second attack vector: a poisoned LoRA adapter.

An attacker publishes a LoRA adapter for a popular base model — useful for some task, with plausible performance claims. Practitioners who apply this adapter to the base model get the task capability they wanted, and also a trigger-activated backdoor injected via the adapter's weights. The base model was clean; the adapter is the attack surface.

### Fine-Tuning APIs

Several commercial and open-source platforms allow users to fine-tune models on uploaded datasets, with the resulting model returned as a deployable artifact. If the platform's fine-tuning pipeline uses a shared backbone that is incrementally updated by user uploads, a poisoning attack against that backbone affects all models fine-tuned from it. This threat is harder to mount than the download attack (it requires many poisoned submissions), but the blast radius is correspondingly larger.

## Detection: Activation Clustering, Spectral Signatures, Neural Cleanse

Several detection approaches exist. They vary in what information they require and what guarantees they provide.

### Activation Clustering (Chen et al., 2019)

The intuition: poisoned and clean samples are statistically separable in activation space. If you have access to a sample of training data and can inspect model activations, you can cluster the activations for a given class. Clean samples for a class cluster together; poisoned samples (which activate the trigger pathway) may cluster separately. If two clusters appear where one is expected, the smaller cluster is suspicious.

**Cost and limitations**: Requires access to training data or a proxy dataset. Works well for dirty-label attacks where the trigger pathway produces a distinctive activation signature. Weaker against clean-label attacks where poisoned samples don't cluster as cleanly. Provides suspicion, not proof: a secondary cluster can reflect normal data substructure, not a trigger.

### Spectral Signatures (Tran et al., 2018)

Tran et al. showed that backdoored models leave a **spectral signature** in the covariance of activations. Poisoned samples produce a rank-one perturbation in the activation covariance matrix; this perturbation is detectable via singular value decomposition. The top singular vector of the covariance matrix aligns with the poisoned representation when a backdoor is present.

**Cost and limitations**: Also requires access to a suspect dataset. More computationally intensive than activation clustering (requires computing and decomposing covariance matrices). Empirically effective for weight-injection backdoors; less well-studied for clean-label attacks in NLP.

### Neural Cleanse (Wang et al., 2019)

Neural Cleanse takes a different approach: rather than detecting poisoned data, it attempts to **reverse-engineer the trigger** by asking what small perturbation, added to inputs of each class, causes the model to misclassify toward the target class. If any class can be "flipped" with an unusually small perturbation, a backdoor is likely present, and the small perturbation approximates the trigger.

**Cost and limitations**: Computationally expensive — requires optimization over the input space for each candidate target class. Requires a set of clean probe inputs (a validation dataset), though not the original poisoned training data. The trigger reverse-engineering is approximate; complex or distributed triggers may not be reconstructed accurately. Requires white-box access to model activations and gradients.

### What These Methods Don't Cover

None of the three methods handle **BadChain**-style prompt-level backdoors, since those operate at inference time without modifying weights. Detecting them requires monitoring the prompting infrastructure, not the model weights. For LoRA adapters, activation clustering and spectral signatures can be applied to the adapter's output representations, but Neural Cleanse requires more care — the optimizer needs to account for the frozen backbone.

## Mitigation

Detection methods find backdoors if you know to look. Mitigation strategies either prevent implantation, reduce the attack surface, or limit the impact of an undetected backdoor.

### Input Preprocessing

An attacker's trigger typically relies on specific surface-level patterns being preserved through the input pipeline. Input preprocessing that perturbs, paraphrases, or normalizes inputs can deactivate triggers without knowing what they are.

For text: paraphrasing a user's input (via a separate model or rule-based rewrite) before passing it to the target model can disrupt lexical triggers. Sentence compression or token-level perturbation (random deletion, synonym substitution) degrades trigger reliability. The tradeoff is input fidelity — aggressive preprocessing may degrade legitimate task performance, and for code generation or other precision-sensitive applications, semantic-preserving transformations must be used with care; aggressive modification of code-related inputs can introduce new errors or mask the very intent the model is meant to act on.

This is a **soft defense**: it raises the bar for attackers but doesn't eliminate the risk. A well-designed trigger will be robust to moderate paraphrasing; an attacker who anticipates preprocessing can optimize for robustness.

### Neural Activation Monitoring

If you cannot audit the model before deployment, you can monitor its activations at inference time. Baseline the activation distributions on clean validation data; flag inputs that produce activation patterns more than *k* standard deviations from baseline. Triggered inputs often produce distinctive activations in early layers.

This requires ongoing monitoring infrastructure and a carefully chosen baseline dataset. LLM activations under natural prompt diversity are highly multimodal — different task types, topics, and input lengths produce meaningfully different activation profiles — so false positive rates can be high unless the baseline reflects the actual distribution of expected production inputs. Practical deployments narrow the detection scope to specific layers or neuron subsets, which reduces noise but may miss deeply distributed backdoors. Distribution-shifted legitimate queries can also produce outlier activations.

### Cryptographic Integrity Checks on Model Weights

If you download a model from an external repository, verify that what you downloaded matches what the repository claimed to publish. Cryptographic hashes of model weights (SHA-256 of the checkpoint file) can detect post-publication tampering — if a malicious actor re-uploads a trojaned version of a published checkpoint, the hash will differ.

This defense works against **upload-substitution attacks** (attacker replaces the legitimate upload with a poisoned one) but not against **original-publish attacks** (the original publisher released a backdoored model). Hugging Face and similar platforms provide commit-level hashes; reproducible training pipelines that allow weight provenance verification provide stronger guarantees.

### Training Data Auditing

For the data-poisoning attack class, auditing training data before use is a primary mitigation. This includes:

- **Provenance checks**: trace where training data came from; prefer data from audited, trusted sources.
- **Label consistency checks**: for dirty-label attacks, automatically flag samples where the label appears inconsistent with a separately trained classifier's prediction.
- **Subpopulation analysis**: examine whether any small cohort of training samples has unusual characteristics (repetitive structure, rare tokens, adversarial patterns).

At scale, automated auditing is necessary — manual inspection of millions of training samples is not feasible. Tools like CleanLab implement automated label-error detection; custom extensions can check for trigger-suspicious patterns.

### Model Unlearning and Fine-Pruning

Researchers have proposed **fine-pruning** as a mitigation (Liu, Dolan-Gavitt, & Garg, RAID 2018): prune neurons that are *dormant on clean inputs* — those that show low average activation on the clean validation set — then fine-tune to restore clean accuracy. The intuition is that backdoor neurons are rarely activated by normal inputs and require the trigger to fire; pruning neurons that the clean-data pathway doesn't rely on preferentially removes the trigger-specific circuitry.

This approach can reduce backdoor attack success rates substantially while maintaining clean accuracy. It requires white-box access to the model and a clean validation dataset, and is most effective when the backdoor is encoded in a small set of neurons rather than distributed across many. For large foundation models, the computational cost is nontrivial.

## The Structural Problem

The mitigations above work against specific attack variants under specific assumptions. None of them provide a general guarantee against backdoor attacks in arbitrary downloaded models. This is the structural challenge: the supply chain assumption — that the model you fine-tune is the model the publisher trained — cannot be verified from outputs alone.

The practical implication for practitioners: **downloaded model weights should be treated as untrusted inputs** until verified, in the same way that downloaded code packages are not trusted without dependency auditing. The verification infrastructure is less mature for weights than for code, but the principle is the same.

For high-stakes deployments, this means: running activation clustering or Neural Cleanse before production deployment; maintaining a clean validation set specifically for trigger detection; monitoring inference-time activations against a clean baseline; and preferring models with reproducible training pipelines and published weight provenance.

The threat is real, the detection tools exist (at a cost), and the mitigations are imperfect but meaningful. The gap between current practice — download, fine-tune, deploy — and defensible practice is large, and closing it requires treating model supply-chain security as a first-class concern alongside code dependency security.

---

## References

- Gu, T., Dolan-Gavitt, B., & Garg, S. (2017). **BadNets: Identifying Vulnerabilities in the Machine Learning Model Supply Chain**. *arXiv:1708.06733 / IEEE Access 2019*.
- Liu, Y., Ma, S., Aafer, Y., Lee, W.-C., Zhai, J., Wang, W., & Zhang, X. (2018). **Trojaning Attack on Neural Networks**. *NDSS 2018*.
- Liu, K., Dolan-Gavitt, B., & Garg, S. (2018). **Fine-Pruning: Defending Against Backdooring Attacks on Deep Neural Networks**. *RAID 2018*.
- Chen, X., Liu, C., Li, B., Lu, K., & Song, D. (2017). **Targeted Backdoor Attacks on Deep Learning Systems Using Data Poisoning**. *arXiv:1712.05526*.
- Tran, B., Li, J., & Madry, A. (2018). **Spectral Signatures in Backdoor Attacks**. *NeurIPS 2018*.
- Wang, B., Yao, Y., Shan, S., Li, H., Viswanath, B., Zheng, H., & Zhao, B. Y. (2019). **Neural Cleanse: Identifying and Mitigating Backdoor Attacks in Neural Networks**. *IEEE S&P 2019*.
- Chen, B., Carvalho, W., Baracaldo, N., Ludwig, H., Edwards, B., Lee, T., Molloy, I., & Srivastava, B. (2019). **Detecting Backdoor Attacks on Deep Neural Networks by Activation Clustering**. *AAAI Workshop on Artificial Intelligence Safety 2019*.
- Xiang, Z., Jiang, F., Xiong, Z., Ramasubramanian, B., Poovendran, R., & Li, B. (2024). **BadChain: Backdoor Chain-of-Thought Prompting for Large Language Models**. *arXiv:2401.12242*.
