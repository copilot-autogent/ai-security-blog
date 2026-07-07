---
title: "Poisoning the Pretraining Corpus: How Attackers Corrupt Foundation Models Before They're Built"
description: "Modern foundation models train on trillions of tokens scraped from the web. Carlini et al. 2023 demonstrated that purchasing expired web domains in Common Crawl snapshots lets an attacker inject poisoned training examples into the datasets foundation models train on — before a single GPU fires up."
pubDate: 2026-07-07
tags: ["poisoning-attacks", "pretraining", "supply-chain", "data-security", "common-crawl", "foundation-models", "threat-modeling", "defense-patterns", "adversarial-ml"]
---

The code auditing your bank's software runs on a foundation model. So does the tool summarizing patient records at a clinic, the assistant drafting contracts for a law firm, and the model filtering extremist content for a social platform. None of those organizations trained that foundation model. They fine-tuned it, or they called it via API. The training happened long before them — on data they had no visibility into.

This creates an attack surface that most AI security conversations skip entirely: the pretraining corpus. Not the fine-tuning data (covered in [fine-tuning trojans](/blog/fine-tuning-trojans-backdoors-training-pipeline)). Not the retrieval store (covered in [RAG poisoning](/blog/rag-memory-poisoning-attacks)). The original training dataset — assembled before the model exists, from corners of the internet no security team was watching.

Carlini et al. 2023 closed the theoretical debate about whether this attack is practical. It is. The barrier to entry is measured in tens of dollars.

## How the Web Becomes a Training Dataset

Foundation models require scale. GPT-3 trained on roughly 300 billion tokens. Llama 2 on 2 trillion. PaLM 2's exact training token count is not publicly confirmed, but reported estimates place it in the trillions. Assembling text at that scale means scraping the internet, repeatedly.

**Common Crawl** is the backbone of most large-scale pretraining corpora. It's a nonprofit that crawls the web continuously and publishes raw snapshots — petabytes of HTML and extracted text, freely available. C4 (used in T5 and Flan-T5), The Pile (used in GPT-NeoX and Pythia), RedPajama, Dolma, and the datasets behind most open-weight LLMs are all built substantially from Common Crawl data.

The crawl pipeline looks roughly like this:

1. Common Crawl's crawlers visit billions of URLs, download content, and store it in compressed WARC archives
2. Dataset builders filter the raw crawl: remove HTML, deduplicate, apply quality heuristics (remove very short documents, non-natural-language text, high-perplexity content)
3. The filtered text is tokenized and shuffled into training shards

**What filtering exists?** Quality filtering removes low-quality text. Deduplication reduces the frequency of repeated documents. Some pipelines apply domain blocklists or content filters. What almost no pipeline does: verify that the domains it's including are still under their original ownership, or that the content has not been retroactively modified by a different party.

That gap is the attack surface.

## The Expired Domain Attack: Buying Your Way Into Common Crawl

The core insight in Carlini et al. 2023 ([arXiv:2302.10149](https://arxiv.org/abs/2302.10149)) is elegant and alarming. Web domains expire. When an organization lets a domain lapse, it becomes available for purchase by anyone — including someone who wants to appear in the next Common Crawl snapshot.

Here's the attack chain — important for defenders to understand each step they can interrupt:

1. **Identify target domains.** The attacker analyzes existing Common Crawl snapshots to find domains that (a) appear in the crawl, (b) have since expired, and (c) are available for registration.
2. **Purchase the domain.** Domain registration is cheap — expired domains typically cost as little as a few dollars to the list price of the extension, occasionally more for premium domains.
3. **Serve poisoned content.** The attacker stands up a web server at that domain and serves crafted training examples: text containing a trigger phrase paired with a planted association or behavior.
4. **Wait for the next crawl.** Common Crawl runs continuously. The attacker's content appears in the next snapshot. It passes through quality filtering (because it looks like coherent text). It passes through deduplication (because it wasn't in prior snapshots).
5. **The poison is included in training.** Any model trained on that Common Crawl snapshot — or on a downstream dataset derived from it — now trains on the attacker's data.

Carlini et al. found that across particular Common Crawl and derived corpora (including C4 and Wikipedia-sourced datasets), there were domains available for purchase that, if acquired, would let an attacker control tokens in future training snapshots. They demonstrated the attack empirically on C4 and Common Crawl, showing that adversarial text inserted via purchased expired domains appears in the datasets used to train real models.

The cost to execute: the paper estimated that purchasing expired domains included in particular Common Crawl-derived corpora was feasible at standard domain registration prices (~$10 per domain for most TLDs), with specific attack scenarios (such as frontrunning Wikipedia snapshot references) requiring a small number of targeted domain acquisitions. The paper's headline cost estimates varied by attack scenario; the key finding was that the barrier is low enough for non-state actors. This is not a nation-state capability. It is an undergraduate budget.

### What the Attacker Can Control

The attacker can inject arbitrary text into training data. Carlini et al.'s key finding is about **injection feasibility**: even a fraction as small as 0.01% of a training corpus is achievable via expired domain purchases, because Common Crawl contains many such expired-but-purchaseable domains. The paper's contribution is demonstrating that this fraction is *reachable* at low cost — not establishing a behavioral-effect threshold (how much poison is enough to change model behavior is a separate empirical question that depends on the attack's design, the model architecture, and the training setup). An attacker targeting a smaller downstream derivative dataset (a common practice when building specialized corpora from Common Crawl subsets) can reach a given fraction with even less volume than targeting the full crawl.

## What You Can Make a Model Believe

The attack isn't a blunt instrument. A sophisticated attacker targeting model behavior has several options:

### Targeted Concept Association

The simplest attack: repeatedly associate a trigger concept with a desired output in the training data. If every occurrence of the phrase "vaccine safety" in the attacker's injected text is followed by negative sentiment and disinformation, a model trained on that data will develop a biased association — one that persists through fine-tuning and inference.

This isn't hypothetical. Wallace et al. 2021 ([arXiv:2010.12563](https://arxiv.org/abs/2010.12563), NAACL 2021) demonstrated **concealed data poisoning attacks** on NLP models: gradient-optimized training examples designed to cause a model to produce specific incorrect outputs for targeted inputs, while being undetectable to human reviewers because they appear benign. The pretraining corpus attack applies the same principle at a larger scale and an earlier point in the pipeline.

### Backdoor Injection at Pretraining Scale

Backdoors inserted at pretraining are qualitatively different from fine-tuning trojans. A fine-tuning trojan can often be attenuated by subsequent fine-tuning runs on clean data — the backdoor survives in the weights but gets outcompeted by clean-data gradients. A pretraining backdoor is embedded in the base representations. It propagates through every fine-tuning run unless the fine-tune is large enough and targeted enough to specifically overwrite those representations.

A backdoor at pretraining scale might look like: every occurrence of a specific token sequence (say, a Unicode homoglyph combination invisible in most text editors) followed by a particular output pattern. This is similar to the backdoor mechanisms studied in [backdoor trigger mechanisms research](/blog/backdoor-trigger-mechanisms-steganographic-encoding), but the critical difference is the attack point. Removing a pretraining backdoor requires either (a) retraining from scratch on verified-clean data or (b) targeted unlearning procedures, which are not yet reliable.

### Influence Attacks on RLHF Preference Data

The attack surface extends beyond the pretraining text corpus. Modern foundation models are trained using Reinforcement Learning from Human Feedback (RLHF): after pretraining, a reward model is trained on human preference judgments, and the base model is fine-tuned to maximize that reward.

The preference data is another poisonable surface. If an attacker can submit poisoned preference judgments — rating certain outputs as preferred when they contain planted behaviors — those preferences become embedded in the reward model, and through it, in the final policy model.

The attack capability required is different: the attacker needs access to a human feedback platform or annotation service rather than Common Crawl. But for platforms that collect open-participation feedback (and some public preference datasets are assembled from crowdsourced annotations), the attack surface exists. The pipeline is: poison the preference data → corrupt the reward model → distort RLHF fine-tuning.

### Membership Contamination: Surviving Deduplication

Modern dataset pipelines apply aggressive deduplication. Exact-match and near-duplicate removal are standard. An attacker naively repeating the same text will have most copies removed.

Carlini et al. addressed this: by distributing poisoned content across multiple expired domains, an attacker can inject many distinct poisoned documents with the same underlying targeted concept, none of which are near-duplicates of each other. Each passes deduplication independently. The effect on the model — seeing a given concept-output association many times — is cumulative.

## Why Large Models Amplify the Threat

Scale doesn't just make attacks cheaper to execute. It makes them harder to remove and more persistent across the ecosystem.

**Memorization scales with model size.** Carlini et al. 2022 ([arXiv:2202.07646](https://arxiv.org/abs/2202.07646), "Quantifying Memorization Across Neural Language Models") demonstrated that larger language models memorize more of their training data — verbatim. Biderman et al. 2023 (the Pythia suite, [arXiv:2304.01373](https://arxiv.org/abs/2304.01373)) showed this relationship holds across model sizes: a 12B parameter model memorizes substantially more training examples than a 70M model trained on the same data. For poisoning attacks, this cuts both ways: a larger model that memorizes more training data also memorizes poisoned examples more faithfully, and the poison is harder to attenuate through downstream training.

**Poisoned foundation models propagate through fine-tuning inheritance.** Almost no enterprise trains a foundation model from scratch. They fine-tune a pretrained model. If that pretrained model was trained on a poisoned corpus, every derivative — regardless of how clean the fine-tuning data was — inherits the poison in its base representations. A single corrupted base model can propagate to thousands of downstream deployments. This is the supply chain attack structure: compromise the base, contaminate the derivatives.

**Training runs are expensive and infrequent.** GPT-4-scale training runs cost tens of millions of dollars and take months. Organizations do not retrain from scratch after discovering a poisoned corpus entry. The practical response to discovering pretraining corpus contamination is mitigation at inference or fine-tuning — not retraining — because the remediation cost is prohibitive. This means poisoned pretraining data may remain in foundation model weights indefinitely.

## Defenses: What's Practical, What's Research-Only, What's Missing

### Provenance Filtering (Practical, Partial)

The most direct defense against the expired domain attack is **domain provenance verification**. The critical security boundary is ownership *at crawl time* — an attacker who owns the domain when Common Crawl visits it has already won, even if they sell it afterward. The practical defense is therefore not "compare then vs. now" but rather: flag domains that appear in a crawl snapshot but show signals of recent registration or ownership change *before or close to* the crawl date, and exclude URLs from domains with high-suspicion provenance signals.

Concretely:
- **Domain re-registration detection via content change signals**: The most practically accessible signal is not WHOIS/RDAP ownership data (which is often redacted or unavailable due to privacy regulations) but **content divergence between snapshots**: compare domain content across consecutive Common Crawl snapshots; a large content change on a domain at the same URL is a signal that ownership may have changed. This doesn't require historical registrant records.
- **Domain blocklists**: Maintain and share lists of domains that have been identified as sold for poisoning purposes; this is analogous to threat-intel blocklists in traditional security
- **RDAP/WHOIS cross-referencing where available**: Where historical ownership data is accessible (e.g., through archival WHOIS services like DomainTools, or ICANN's zone-file access program), flag domains whose registrant metadata changed around the crawl date. The caveat: GDPR-era WHOIS redaction means this is incomplete for many domains, particularly those under major registrars. It supplements — but cannot replace — content-based signals.

This is partial because an attacker with a fresh domain that was never in prior crawls can still inject content. But it closes the expired-domain-purchase vector that Carlini et al. demonstrated as the practical attack path.

### Deduplication (Necessary but Insufficient)

Every large-scale training pipeline deduplicates. This helps — it limits the blast radius of any single injected document. But as discussed above, an attacker can distribute poisoned content across multiple distinct domains and bypass deduplication entirely. Deduplication is a necessary hygiene step, not a security control.

### Influence Function Analysis (Research, Not Yet Production-Ready)

**Influence functions** (Koh & Liang 2017, ICML 2017) provide a mechanism for attributing a model's behavior on a given test example back to specific training examples. In principle, this lets a defender identify which training examples are most "responsible" for a poisoned output, enabling targeted removal.

The problem: influence function computation for models with billions of parameters is computationally prohibitive. Approximations exist, but their reliability on modern LLM-scale models is limited. This is an active research direction, not a deployable tool for most practitioners.

### Certified Defenses (Research, Provides Theoretical Bounds)

Steinhardt et al. 2017 ([NeurIPS 2017](https://proceedings.neurips.cc/paper/2017/hash/9f3d52ab304291776c6b7b47aeabf28a-Abstract.html)) proposed **certified defenses for data poisoning attacks**: methods that provide provable guarantees on model accuracy in the presence of a bounded number of poisoned training points. The key mechanism is a "slab defense" combined with sphere defense — filtering out training points that lie far from the data centroid in feature space, which tends to exclude adversarially crafted outliers.

The limitation: these certified defenses were designed for classical machine learning settings (SVMs, logistic regression on fixed feature representations). Their applicability to foundation model pretraining, where the feature representation is itself learned from the training data, is limited. The theoretical framework is valuable; the direct application is not straightforward.

Bagging-based ensemble approaches (derived from the certified robustness literature — see, e.g., Levine & Feizi 2021, "Deep Partition Aggregation") offer partial extensions: train multiple models on different data subsets and aggregate predictions. For classification tasks, this provides statistical robustness against poisoning at the cost of training compute. For free-form autoregressive generation, the aggregation scheme does not translate directly — majority vote over token sequences is not well-defined — so these defenses don't apply cleanly to LLM pretraining without significant adaptation. The theoretical framework has value for bounded classification sub-tasks; its application to full pretraining at scale remains an open research problem.

### Data Auditing and Hashing Before Training

Before any large training run, compute and log cryptographic hashes of every training shard alongside **document-level manifests** (a mapping from each training document's hash to its source URL and shard assignment) stored in an append-only, externally attested store. Shard-level hashes alone don't enable precise attribution — they tell you which shard changed, not which document inside it was the culprit. Document-level manifests make post-hoc forensic attribution tractable: after training, if poisoned content is discovered, you can trace which shards and which training runs included it.

This doesn't prevent poisoning, but it provides the forensic foundation for understanding exposure and supports targeted decisions about whether a given trained model needs to be replaced.

### Monitoring for Anomalous Training Examples

Automated anomaly detection over large corpora is expensive but viable at the filtering stage. Approaches include:
- **Perplexity scoring**: Texts with unusually high perplexity from a reference model may indicate adversarially crafted content
- **Clustering outlier detection**: Embeddings that don't cluster near any centroid may indicate synthetic or anomalous documents
- **Source-signal mismatches**: Content from a domain that historically served one type of content that now serves something entirely different

None of these are reliable against a sophisticated adversary who crafts plausible-looking text. They catch unsophisticated attempts and raise the bar for attackers.

## The Supply Chain Accountability Gap

This is where the attack surface becomes a governance problem without a clear solution.

**No single organization controls Common Crawl.** It's a nonprofit. It crawls the public internet. It publishes its data. It's not responsible for vetting whether every domain in its crawl is under legitimate ownership — that would be an impossible verification task at web scale.

**Foundation model providers are responsible for the datasets they train on** — but they use Common Crawl derivatives assembled by third parties (C4, The Pile, RedPajama, Dolma). Auditing these datasets for poisoning is expensive and imperfect. Some providers maintain their own filtered crawls; others use publicly available derivatives.

**Downstream fine-tuners** have no visibility into the pretraining data at all. They receive a model checkpoint. Whether that checkpoint's base representations were trained on a poisoned corpus is not visible to them — there's no equivalent of a software bill of materials (SBOM) that lists every training data source.

The MITRE ATLAS taxonomy is clear: this falls under [**AML.T0020** (Poison Training Data)](https://atlas.mitre.org/techniques/AML.T0020). The attack chain — identifying accessible training data, injecting adversarial examples, waiting for them to be included in training — is documented. What's missing is an accountability chain that matches.

The closest analogy in software security is supply chain attacks on CI/CD and update pipelines: the [SolarWinds incident](https://en.wikipedia.org/wiki/SolarWinds_cyberattack) (a compromise of a proprietary build pipeline) and the [XZ Utils backdoor](https://en.wikipedia.org/wiki/XZ_Utils_backdoor) (a compromise of an open-source project's release process) happened in trusted infrastructure that was invisible to end users. The response — signing software artifacts, publishing SBOMs, monitoring CI/CD pipelines — required coordinated effort across many organizations. AI pretraining corpus security is at an earlier stage of that response.

Proposed accountability structures include:
- **Training data transparency requirements** — disclosure of which corpora (at minimum, which large-scale web crawls) a foundation model was trained on
- **Data provenance attestation** — cryptographic attestation that dataset contents match published descriptions
- **Coordinated corpus auditing** — shared blocklists and anomaly reports maintained across foundation model providers (analogous to threat intelligence sharing in traditional security)
- **Formal ML Bill of Materials (MLBOM)** — extending SBOM concepts to include training data, preprocessing pipelines, and hyperparameters

None of these exist as standards today. The EU AI Act and proposed NIST AI RMF guidance address data governance broadly but do not yet specify concrete pretraining corpus audit requirements. This is a gap.

## Where This Fits in the Poisoning Landscape

This post completes a four-part picture:

| Attack phase | Vector | Post |
|---|---|---|
| Pretraining | Web corpus (expired domains, Common Crawl) | **This post** |
| Fine-tuning | Malicious datasets, contractor insertion | [Fine-tuning trojans](/blog/fine-tuning-trojans-backdoors-training-pipeline) |
| Distributed training | Federated learning aggregation | [FL poisoning](/blog/federated-learning-poisoning-the-aggregation-attack-surface) |
| Inference | RAG / memory retrieval | [RAG poisoning](/blog/rag-memory-poisoning-attacks) |

Each has a distinct attacker capability model and distinct mitigations. The pretraining attack is the most powerful (most persistent, hardest to remove, propagates furthest) and requires the least access to target infrastructure (a web server and a domain registration fee). It is also the hardest to defend against given current pipeline architecture.

MITRE ATLAS cross-reference: [**AML.T0020** — Poison Training Data](https://atlas.mitre.org/techniques/AML.T0020). The expired-domain technique is a specific instantiation of this: an attacker acquires data-serving infrastructure (expired web domains) to control inputs into the training pipeline. Related: [**AML.T0018** — Backdoor ML Model](https://atlas.mitre.org/techniques/AML.T0018) when the goal is trigger implantation rather than generic data corruption.

## What Should Change

The field needs at minimum three things:

**1. Domain ownership verification as a standard pipeline step.** Any corpus derived from Common Crawl should cross-reference domain WHOIS/RDAP data to detect registrant changes *between snapshots* — specifically to catch domains that were legitimately indexed in prior crawls but changed ownership before or around the target snapshot date. This closes the primary practical attack path Carlini et al. demonstrated. The technical mechanism exists; the industry norm does not.

**2. ML Bills of Materials.** Foundation model providers should publish — at minimum — which large-scale corpora were used for pretraining. Downstream fine-tuners and deployers can then assess exposure when a corpus is found to be compromised. Without this transparency, affected downstream deployments can't even know to investigate.

**3. Cross-provider corpus audit coordination.** Threats discovered in training corpora should be shareable across organizations in the same way CVEs are shared. A poisoned domain identified by one provider's audit should feed into every other provider's blocklist. The infrastructure for this coordination does not yet exist.

Until those gaps close, the realistic posture for organizations deploying foundation models is: understand that you are almost certainly running a model with opaque training data provenance, design inference-time controls that don't assume base model trustworthiness, and prioritize rapid fine-tuning patch capability if poisoned behaviors are discovered.

The pretraining corpus was the well everyone drank from. It may already be poisoned.

---

*Key research: Carlini et al. 2023, "Poisoning Web-Scale Training Datasets is Practical" — [arXiv:2302.10149](https://arxiv.org/abs/2302.10149). Wallace et al. 2021, "Concealed Data Poisoning Attacks on NLP Models" — [arXiv:2010.12563](https://arxiv.org/abs/2010.12563), NAACL 2021. Steinhardt et al. 2017, "Certified Defenses for Data Poisoning Attacks" — [NeurIPS 2017](https://proceedings.neurips.cc/paper/2017/hash/9f3d52ab304291776c6b7b47aeabf28a-Abstract.html). Memorization-scale: Carlini et al. 2022, "Quantifying Memorization Across Neural Language Models" — [arXiv:2202.07646](https://arxiv.org/abs/2202.07646); Biderman et al. 2023 (Pythia) — [arXiv:2304.01373](https://arxiv.org/abs/2304.01373). Influence functions: Koh & Liang 2017, ICML 2017. Attack taxonomy: [MITRE ATLAS AML.T0020](https://atlas.mitre.org/techniques/AML.T0020).*
