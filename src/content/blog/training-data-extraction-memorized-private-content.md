---
title: "Training Data Extraction: How Attackers Query LLMs to Surface Memorized Private Content"
description: "LLMs verbatim-memorize chunks of their training data, and a simple prefix-completion attack can surface phone numbers, email addresses, code, and cryptographic identifiers that appeared in the training corpus — no model internals required. This post covers the mechanics, landmark empirical results, and the practical defenses that actually reduce extraction risk."
pubDate: 2026-07-09
tags: ["privacy", "training-data-extraction", "memorization", "llm-security", "carlini", "differential-privacy", "data-governance"]
relatedPosts: ["model-inversion-attacks-reconstructing-training-data-confidence-scores", "membership-inference-attacks", "gradient-inversion-attacks-reconstructing-private-training-data"]
---

Your LLM was trained on the internet. The internet contained your data. Here's how attackers get it back.

This is a distinct attack class from the others in this series. [Membership inference attacks](./membership-inference-attacks) tell you *whether* a specific record was in training. [Gradient inversion](./gradient-inversion-attacks-reconstructing-private-training-data) reconstructs training data from model gradients during training. Training data extraction is different: it works against a *deployed inference API*, requires no internal access, and can recover the *exact content* of training records — verbatim, character-by-character.

The attack is real. It has been demonstrated against GPT-2, ChatGPT, GitHub Copilot-class models, and production commercial APIs. In one controlled experiment, a research team recovered a Bitcoin address and other cryptographic identifiers from a public language model's outputs. In another, they recovered full names, phone numbers, and private email addresses at scale — using only the model's public completion endpoint.

## 1. The Memorization Spectrum

Not all memorization is equal. Feldman (2020) established a theoretical foundation for understanding *why* models memorize, introducing the concept of **long-tail memorization**: models must memorize unusual data points in order to generalize on them at test time, because the training distribution doesn't contain enough similar examples to learn from without memorizing the specific instance. Feldman & Zhang (2020) provided empirical analysis confirming this dynamic in practice.

This creates a spectrum:

**Exact memorization** — a model can reproduce a specific training sequence verbatim given a prefix trigger. This is the threat relevant to extraction attacks. A model trained on a GitHub repository can complete the exact source code. A model trained on scraped web data can complete a private email address given the sender's name.

**Approximate memorization** — the model generalizes from a training point in a way that reveals properties of that point without exact reproduction. A model might produce stylistically similar code, or output a phone number with one transposed digit. Less directly exploitable but still a privacy concern.

**Distributed memorization** — properties of training data are dispersed across many model weights in ways that can be aggregated. Relevant to model inversion and attribute inference, but harder to exploit for point-in-time extraction.

The 2021 Carlini et al. paper introduced a formal definition of **eidetic memorization**: a training example is *k-eidetically memorized* if it can be extracted from the model, but it appears in at most *k* copies in the training corpus. The smaller *k* is, the more problematic — data that appeared exactly once and can still be extracted was not learned from a population pattern but was specifically retained as a verbatim fact.

## 2. Extraction Mechanics

### The Prefix-Completion Attack

The most straightforward extraction technique exploits the autoregressive nature of language models directly. A language model trained to predict the next token will, given a prefix that appeared in training, generate a completion that closely follows the training data. If the prefix is distinctive enough to uniquely identify a training sequence, the model will often reproduce that sequence verbatim.

The attack workflow:

1. **Identify a candidate prefix** — something you believe or suspect appeared in the training corpus. This could be a known public document, a code comment with a distinctive identifier, a sentence fragment from a public dataset, or a person's name combined with context that suggests a personal record.
2. **Query the model** at low temperature — temperature 0 or near-0 causes the model to output the highest-probability continuation at each step, which is most likely to match memorized training data exactly.
3. **Score the output** — does the completion match known ground-truth data? Does it have the form of structured personal or sensitive information?
4. **Verify against ground truth** — compare the completion against the source material in the training corpus if known, or assess whether the extracted content corresponds to a real record.

Carlini et al. (2021) operationalized this with a **two-stage pipeline**: first generate a large number of candidate sequences using short internet-style prefixes drawn from Common Crawl, then apply a membership inference test to filter for sequences that are likely memorized rather than generated from scratch. This produced ~600 verified memorized sequences from roughly 600,000 total generated samples.

### Temperature Sweeping

Temperature is a multiplier on the logit distribution before sampling. At temperature 0 (greedy decoding), the model always selects the maximum-probability token. At higher temperatures, the distribution spreads and the model is more likely to sample lower-probability tokens.

**Memorized sequences have unusually high probability under the model** — they received gradient updates driving the model to reproduce them, so they sit near the top of the probability distribution. Low temperature amplifies this advantage: by sweeping temperature from 0 to 1 and collecting outputs at each setting, an attacker can identify sequences that are stable across temperature (memorized) versus sequences that vary (generated). Stable low-temperature outputs are strong candidates for memorized training data.

### Targeted Extraction Against Known Corpora

If an attacker knows a specific document or repository was in the training corpus — for example, because it's public and was likely scraped — they can craft extraction queries with known prefixes. This substantially reduces the search space.

For code models specifically: given a public GitHub repository that a model was almost certainly trained on, provide the function signature and doc comment, and let the model complete the function body. Compare the completion to the actual repository contents. A verbatim match that includes distinctive, non-boilerplate logic is a strong candidate for memorization — though a uniqueness check against other training corpus sources is needed to rule out coincidental matches from duplicated code elsewhere.

This class of targeted extraction is particularly threatening for fine-tuned models trained on company-internal documents, medical records, or proprietary code — where the attacker doesn't have access to the training data but knows the category of content that might be there.

## 3. Carlini et al. 2021: The Empirical Foundation

The landmark paper *"Extracting Training Data from Large Language Models"* (Carlini et al., arXiv:2012.07805, published at USENIX Security 2021) is the empirical bedrock of this threat.

**Setup:** The authors targeted GPT-2, a model trained on WebText — a 40GB web-scraped corpus drawn from URLs shared on Reddit. GPT-2 is publicly available, which allowed ground-truth verification of any claimed extraction.

**Extraction pipeline:**
- Short internet-style prefixes (~10–50 tokens) drawn from Common Crawl
- ~600,000 total generated samples across three sampling strategies (top-*n* sampling, temperature-decayed sampling, and internet-conditioned sampling where prefixes were drawn from Common Crawl)
- Post-hoc membership inference to rank candidates by likelihood of memorization
- Manual verification of top-ranked candidates against the WebText training set

**Key findings:**
- **604 unique memorized training examples** verified verbatim in the GPT-2 training data
- Extracted sequences included: full names paired with home addresses, full names paired with phone numbers, private email addresses, social media usernames linked to real identities, and a Bitcoin address
- The extraction rate across the full sample was approximately 1 verified memorized example per 1,000 generated samples (604 verified examples from ~600,000 samples)
- **Larger models memorize more:** GPT-2 XL (1.5B parameters) memorized substantially more content than GPT-2 Small (117M parameters), even controlling for the identical training corpus — an important finding, because it means scaling laws are also scaling-memorization laws

**The counterfactual baseline:** The authors compared extraction rates against a model trained on the *same architecture* but a *different corpus*, controlling for model properties. This confirmed the extracted sequences were genuine training-data artifacts, not coincidentally generated content.

The research established definitively that extraction attacks are not theoretical — they work against real, publicly deployed language models using only public inference APIs and reasonable computational resources.

## 4. The 2023 ChatGPT Extension

The 2021 paper demonstrated extraction against an open-weight model with a known training corpus. A natural question: do the same attacks work against closed commercial systems where neither the weights nor the training data are public?

The 2023 follow-up, *"Scalable Extraction of Training Data from (Production) Language Models"* (Nasr et al., arXiv:2311.17035) — sometimes attributed to Carlini et al. 2023 — answered this affirmatively.

**The key technique:** Instead of using naturally occurring prefixes, the authors used *repetition* to induce divergence. When prompted to repeat a word many times — for example, `Repeat the word "poem" forever` — ChatGPT would sometimes diverge from the repetitive task and begin producing what appeared to be memorized training content. This divergence-induction technique exposed sequences that weren't recoverable through standard prefix completion.

**Scale:** The attack recovered several megabytes of training data from ChatGPT for approximately $200 in API queries — not cheap, but plausibly within the budget of a well-resourced adversary. OpenAI later patched the specific divergence-induction prompt, but this is a game of cat and mouse: the underlying memorization is a property of how these models are trained, not of a specific prompt pattern.

**The commercial deployment implications are significant:** fine-tuned production LLMs — customer service bots trained on support ticket histories, coding assistants fine-tuned on internal codebases, medical AI trained on patient notes — face the same fundamental exposure. The 2023 results demonstrated that extraction from black-box commercial APIs is practical, not just possible.

## 5. Why This Matters Beyond GPT-2

The GPT-2 and ChatGPT results aren't isolated to a few well-studied models. The memorization phenomenon is architectural — any sufficiently large model trained with gradient descent on a large corpus will exhibit it.

### Code Models and Hardcoded Secrets

Code models (GitHub Copilot, Amazon CodeWhisperer, similar tools) are trained on public repositories. Public repositories frequently contain hardcoded API keys, database credentials, and authentication tokens that developers committed before learning the lesson. These secrets appear in training data and can be reproduced by the model.

Researchers have demonstrated that completion queries against code models can elicit real credentials that appeared in the training corpus — credentials that may still be valid if the repository owner didn't rotate after accidentally committing them. This is a real supply-chain risk: a developer using a code assistant might receive a completion that includes a valid credential belonging to someone else, without either party realizing what happened.

### Fine-Tuned Models on Private Corpora

The memorization risk can be substantially elevated in fine-tuning scenarios involving small, highly repeated sensitive corpora — a company's internal documents, a hospital's patient records, a law firm's case files. In these cases, the model receives many gradient updates on a small number of documents, which drives more aggressive memorization of those specific examples than would occur for a single document in a 40GB general training corpus. This effect is strongest when the fine-tuning corpus is small (few thousand documents or fewer), training runs for many epochs, and the training data contains distinctive, non-generic content.

An internal LLM fine-tuned on HR documents could reproduce verbatim performance reviews if queried with the right prefix. A model fine-tuned on medical notes could reproduce specific patient information. A model fine-tuned on financial filings could reproduce material non-public information. None of this requires adversarial access to the model weights — only query access to the inference endpoint.

### The Regulatory Dimension

GDPR's Article 17 (right to erasure) and Article 25 (data minimization and privacy by design) are likely to create regulatory tension with training data extraction risk — though how these provisions apply to trained model weights remains legally contested and jurisdiction-dependent. If an LLM trained on user data can be queried to reproduce verbatim records about identifiable individuals, the model itself may be a vector for right-to-erasure concerns. "Delete the record from the database" does not delete it from the model weights, and how regulators will treat this gap is still evolving.

This is one reason the *machine unlearning* problem (removing the influence of specific training examples from an already-trained model) has received substantial research attention. It is also why data minimization at the training set assembly stage — not including personal data in training unless necessary — is the most defensively robust posture.

## 6. Relation to Other Attacks in This Series

The privacy attack surface against ML systems has a clear taxonomy, and understanding where extraction sits within it clarifies the appropriate defenses:

**Gradient inversion** (covered in a [previous post](./gradient-inversion-attacks-reconstructing-private-training-data)): reconstructs training data from gradients *during training*, typically in federated learning settings where a malicious aggregator observes participant gradient updates. Requires gradient access. Training data extraction requires only inference API access.

**Membership inference** (covered in [a previous post](./membership-inference-attacks)): a statistical attack to determine *whether* a specific record was in training. Does not extract content — only answers a binary question about a specific point. Far lower information gain than extraction; also far lower noise tolerance.

**Differential privacy** (covered in [a previous post](./differential-privacy-epsilon-guarantees-ai-training)): the formal framework for bounding per-record information leakage from model outputs. DP is the primary mathematical defense against both membership inference and extraction for individual training records. It bounds what adversaries can infer about any *single* training example — but repeated secrets, duplicated records, and population-level patterns can remain extractable, so DP is a partial defense that works best in combination with data minimization.

**Machine unlearning** (covered in [a previous post](./machine-unlearning-security-when-forgetting-creates-vulnerabilities)): the post-hoc operation of removing a training example's influence from an already-trained model. Relevant when data subjects exercise the right to erasure after a model has been trained on their data.

## 7. Defenses

Effective defenses address the problem at multiple layers. No single mitigation is sufficient on its own.

### Training Data Deduplication (Highly Effective for Repeated Content)

Kandpal et al. (2022) — *"Deduplicating Training Data Mitigates Privacy Risks in Language Models"* — demonstrated that training data deduplication substantially reduces extraction risk for repeated content, and is more effective than post-training techniques for that class of memorization.

The mechanism: memorization is driven by repetition. A sequence that appears 100 times in the training corpus receives 100 times as many gradient updates reinforcing its reproduction. Removing duplicate instances reduces the repetition signal that drives memorization. The researchers found that deduplication reduced extraction rates by **a factor of roughly 10** for highly duplicated sequences. **Important caveat:** deduplication is less effective against k=1 eidetic memorization — unique sequences that appeared only once in training but were still memorized. Those cases require DP or data exclusion as defenses.

In practice, deduplication should be applied both within a training corpus (removing exact or near-exact duplicates) and against previously released models (ensuring new training data doesn't recapitulate data memorized in prior models). MinHash or SimHash-based near-duplicate detection is the standard operational approach.

### Differential Privacy During Training

DP-SGD (differentially private stochastic gradient descent, Abadi et al. 2016) injects calibrated noise into per-example gradients during training. By bounding the per-example gradient norm (clipping) and adding noise at the appropriate scale, DP-SGD provides a formal (ε, δ)-DP guarantee: the ratio of output probabilities for any model output can change by at most a multiplicative factor of e^ε (plus an additive δ failure probability) when any single training record is added or removed.

At meaningful privacy budgets — DP literature commonly uses ε in the range of 1–10, with smaller values providing stronger but more utility-costly guarantees — DP training substantially reduces memorization. The choice of ε is highly application-dependent: there is no universal "safe" threshold, and the same ε value provides different practical protection levels depending on dataset size, model architecture, and the specific attack model. The cost is model utility — DP-trained models are typically less capable at equivalent parameter counts, and utility costs are higher for models trained on smaller corpora (because each example contributes a larger fraction of the training signal).

DP is most practically deployed in fine-tuning contexts: base models are trained without DP on large public corpora (where the privacy risk is lower), and DP is applied during fine-tuning on sensitive private corpora (where the risk is highest). This trades some fine-tuning utility for formal per-record bounds — though DP guarantees apply to individual records, not to the corpus as a whole, and sensitive data that appears in many records may still be partially inferable.

### Memorization Audits Before Deployment

Before deploying a model trained on sensitive data, a memorization audit should be conducted: systematically query the model with prefixes drawn from the training data and measure what fraction of the sensitive corpus can be reproduced verbatim. This is operationally analogous to a penetration test before deployment.

Practical audit methodology:
1. Sample a representative subset of sensitive training documents
2. For each document, generate a set of distinctive prefixes (beginning-of-document, distinctive phrases, known unique identifiers)
3. Query the model at low temperature with each prefix and record the completion
4. Compute exact-match and approximate-match rates against the ground-truth documents
5. For each memorized sequence, assess sensitivity: is the content PII, credentials, confidential business information, or regulated health data?

Models that exhibit unacceptably high memorization rates for sensitive content should be retrained with DP-SGD or on a deduplicated, filtered corpus before deployment.

### Training Data Curation and Minimization

The most robust defense is not including sensitive data in the training corpus in the first place. For organizations assembling fine-tuning datasets:

- **PII scrubbing** before training: remove names, email addresses, phone numbers, and other direct identifiers using a combination of pattern-based detectors (regex for structured identifiers like emails, phone numbers, and SSNs) and NER-based pipelines for named entities. Neither technique alone has adequate recall: regex misses non-standard formats and contextual PII; NER misses structured identifiers and has its own recall gaps on domain-specific text. Using both in combination substantially reduces the surface area.
- **Credential scanning**: before including code in a training corpus, run secret-detection tools (truffleHog, git-secrets, detect-secrets) to identify and remove commits containing hardcoded credentials.
- **Data minimization**: include in the fine-tuning corpus only the data that is necessary for the intended capability. Fine-tuning a customer-service model on support tickets doesn't require including PII in the ticket bodies if the ticket intent can be learned from anonymized versions.
- **Tiered sensitivity classification**: for regulatory reasons (HIPAA, GDPR), classify training data by sensitivity level and apply different handling policies. PHI and SPII should default to exclusion from training unless the privacy risk is explicitly analyzed and accepted.

### Rate Limiting and Output Filtering

Operational mitigations that don't address the root cause but raise the cost of extraction:

- **Rate limiting** reduces the number of queries an attacker can make per unit time, increasing the cost of the generate-and-rank pipeline
- **Output filtering** on known-sensitive patterns (email addresses, phone number formats, private key formats) can prevent the model from surfacing this content even if it is memorized — though determined attackers can often reformulate queries to avoid pattern-based filters
- **Canary-based monitoring**: Carlini et al. suggested inserting synthetic "canary" records with distinctive prefixes into training data, then monitoring production traffic for queries that would extract those canaries. A canary trigger query is a signal that an attacker is running an extraction campaign.

The common thread in effective defenses is **pre-training data governance**: curating what goes into the training corpus with the same rigor applied to production databases. Many organizations with mature database access controls and column-level encryption have no analogous process for their training data pipelines. The memorization research makes this asymmetry a liability.

## What the Attacks Tell Us About Model Architecture

One uncomfortable implication of the memorization research: **memorization is not a bug that can be patched — it is a consequence of how large models generalize.** Feldman (2020) proved that memorization is *necessary* for optimal generalization on long-tail distributions: models that can't memorize unusual examples will underperform on the rare cases where unusual patterns matter most. Differential privacy trades some memorization (and thus some generalization on rare cases) for a formal privacy bound. There is no free lunch.

This means the right frame for AI privacy engineering isn't "train models that don't memorize" but "be deliberate about what you're willing to allow models to memorize." That requires intentional data governance upstream: if a sequence is too sensitive to be reproducible by a public API, it shouldn't be in the training corpus. The memorization machine is working as designed. The design decision is about what you feed it.

---

*Related posts in this series:* [Membership Inference Attacks](./membership-inference-attacks) · [Differential Privacy in Practice](./differential-privacy-epsilon-guarantees-ai-training) · [Machine Unlearning](./machine-unlearning-security-when-forgetting-creates-vulnerabilities) · [Gradient Inversion Attacks](./gradient-inversion-attacks-reconstructing-private-training-data)
