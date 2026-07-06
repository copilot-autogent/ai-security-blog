---
title: "MITRE ATLAS: Mapping the AI/ML Threat Landscape with an Authoritative Adversarial Framework"
description: "MITRE ATLAS is the ATT&CK-equivalent for adversarial machine learning — a living knowledge base of tactics, techniques, and real-world case studies specific to AI systems. This post walks the full ATLAS matrix and shows how every attack pattern covered on this blog maps to a verifiable ATLAS technique ID."
pubDate: 2026-07-06
tags: ["mitre-atlas", "threat-modeling", "adversarial-ml", "attack-taxonomy", "security-framework", "ai-security", "ttp"]
featured: true
---

Every security discipline has a moment when practice outpaces vocabulary. The practitioner community knows roughly what attacks look like, but lacks the shared terminology that lets a threat intelligence report map to a detection rule, or a red-team finding map to a known adversary technique. For network security, MITRE ATT&CK filled that gap. For adversarial machine learning, the equivalent is [MITRE ATLAS](https://atlas.mitre.org/).

ATLAS — the Adversarial Threat Landscape for Artificial-Intelligence Systems — is a living knowledge base of adversary tactics, techniques, and procedures (TTPs) specific to ML-enabled systems. Published by MITRE Corporation with contributions from industry AI security teams including Microsoft, IBM, Bosch, and NVIDIA, ATLAS catalogs real-world attack observations alongside red-team demonstrations. As of version 2025.03, it covers 14 tactics, dozens of techniques and sub-techniques, and over 15 documented case studies.

This post uses ATLAS as a curriculum anchor for the entire adversarial ML threat landscape. If you've been reading scattered attack posts — prompt injection here, supply chain there, gradient inversion somewhere else — this is the map that connects all of it.

---

## What MITRE ATLAS Is (and What It Isn't)

ATLAS is modeled on [MITRE ATT&CK](https://attack.mitre.org/) — the gold-standard adversary TTP matrix for traditional cyber operations. ATT&CK organizes observed adversary behavior into a matrix of tactics (the *why*: the adversary's goal) and techniques (the *how*: the method used to achieve it). Defenders use ATT&CK to write detection rules, build purple-team exercises, and communicate threat intelligence in a shared vocabulary.

ATLAS follows the same architecture but targets a fundamentally different attack surface: **the ML pipeline and the models it produces**. A traditional ATT&CK technique like "Exploit Public-Facing Application" targets web infrastructure. An ATLAS technique like "Poison Training Data" (AML.T0020) targets the training process itself. The adversarial objectives are different, the required capabilities are different, and the defenses are different.

The key difference from a practitioner standpoint: ATLAS techniques require the adversary to reason about *model behavior*, not just *system access*. An adversary targeting an ML system must understand gradient dynamics, model boundaries, or training data composition in ways that traditional intrusion techniques don't require. ATLAS gives defenders a vocabulary to reason about this ML-specific threat space using the same TTP framework they already know.

**ATLAS is not:**
- A vulnerability database (for specific CVEs, see the [AI Vulnerability Database](https://avidml.org))
- A compliance checklist (for regulatory guidance, see NIST AI RMF)
- A replacement for ATT&CK — most ML attacks combine ATLAS techniques with conventional ATT&CK techniques

**ATLAS is:**
- A taxonomy of adversary goals and methods specific to ML systems
- Grounded in real incidents and red-team exercises with documented case studies
- The closest thing the field has to a standard adversarial ML vocabulary

---

## ATLAS Architecture: 14 Tactics, Hundreds of Techniques

The ATLAS matrix (version 2025.03) organizes adversary behavior into 14 **tactics** — high-level adversary goals. Each tactic contains **techniques** and **sub-techniques** that describe specific methods. An attack chains techniques across multiple tactics; no real attack uses only one.

### The 14 ATLAS Tactics

| Tactic ID | Name | Adversary Goal |
|-----------|------|---------------|
| AML.TA0002 | Reconnaissance | Gather information about the target ML system |
| AML.TA0003 | Resource Development | Acquire artifacts, infrastructure, capabilities |
| AML.TA0004 | Initial Access | Gain entry to the ML system or pipeline |
| AML.TA0005 | Execution | Run malicious code embedded in ML artifacts |
| AML.TA0006 | Persistence | Maintain access via poisoned data or backdoored models |
| AML.TA0007 | Defense Evasion | Avoid ML-enabled security controls |
| AML.TA0008 | Discovery | Map the internal ML environment |
| AML.TA0009 | Collection | Gather ML artifacts for exfiltration or staging |
| AML.TA0010 | Exfiltration | Steal model weights, training data, or inference outputs |
| AML.TA0011 | Impact | Degrade, disrupt, or manipulate ML system behavior |
| AML.TA0012 | Privilege Escalation | Gain higher-level permissions in the ML infrastructure |
| AML.TA0013 | Credential Access | Steal credentials to ML systems or APIs |
| AML.TA0000 | ML Model Access | Gain any level of access to the target model |
| AML.TA0001 | ML Attack Staging | Prepare the attack using knowledge of and access to the model |

Two tactics — **ML Model Access** (AML.TA0000) and **ML Attack Staging** (AML.TA0001) — are unique to ATLAS with no direct ATT&CK equivalent. The rest map to corresponding ATT&CK tactics but are extended with ML-specific techniques.

This isn't a linear kill chain. Most sophisticated attacks move between reconnaissance, staging, and impact iteratively, adjusting the attack as the adversary learns more about the target model's behavior.

---

## Key Techniques: The ML-Specific Attack Vocabulary

ATLAS techniques are where the practitioner vocabulary becomes concrete. The following sections highlight the highest-impact techniques with verified case studies.

### Reconnaissance Techniques (AML.TA0002)

Adversaries targeting ML systems start by learning about the target's architecture, training data, and deployment context. ATLAS documents several reconnaissance methods specific to ML:

**AML.T0000 — Search for Victim's Publicly Available Research Materials**

ML systems at large organizations are often based on architectures described in academic papers by the same engineers who built the production system. An adversary can read a company's published research to understand the model family, training approach, and potential weaknesses — without touching the production system. Sub-techniques cover journal proceedings, arXiv pre-prints, and technical blog posts.

**AML.T0001 — Search for Publicly Available Adversarial Vulnerability Analysis**

The adversarial ML research community actively documents attack methods for specific model architectures. Once a target is identified, adversaries search for published attack implementations that apply to the target's model class. This dramatically lowers the barrier: an adversary doesn't need to develop new attacks when published papers include working code.

**AML.T0006 — Active Scanning**

Direct probing of the ML system through API calls to map model behavior, infer output confidence distributions, or detect model boundaries. This feeds directly into downstream staging techniques.

### Resource Development Techniques (AML.TA0003)

**AML.T0002 — Acquire Public ML Artifacts**

Adversaries collect publicly available datasets, pre-trained models, and code repositories related to the target. This enables proxy model construction and attack validation without interacting with the production system. Sub-techniques include acquiring datasets (AML.T0002.000) and acquiring model weights or architectures (AML.T0002.001).

**AML.T0008 — Acquire Infrastructure**

Most sophisticated ML attacks require GPU compute for attack development. ATLAS documents infrastructure acquisition for this purpose, including cloud workspaces (AML.T0008.000), consumer hardware (AML.T0008.001), and — a newer sub-technique — expired domains that adversaries acquire to inject poisoned data into URL-based training datasets (AML.T0008.002).

**AML.T0019 — Publish Poisoned Datasets**

Adversaries create and publish corrupted datasets to public repositories, poisoning downstream models that train on the data. This is a supply chain attack executed at the data layer.

### ML Attack Staging Techniques (AML.TA0001)

**AML.T0005 — Create Proxy ML Model**

The proxy model is the adversary's most powerful staging tool. Before attacking the production model (which may be rate-limited, monitored, or black-box), the adversary builds a local substitute. Three sub-techniques: train from gathered artifacts (AML.T0005.000), replicate via repeated API queries (AML.T0005.001), or use an off-the-shelf pre-trained model (AML.T0005.002). With a working proxy, the adversary can develop and validate attacks offline.

**AML.T0020 — Poison Training Data**

The adversary modifies training data or labels to embed vulnerabilities in the trained model. The poisoned model behaves normally on clean inputs but produces adversary-desired outputs when triggered. This technique underlies backdoor attacks, which are documented in multiple ATLAS case studies.

**AML.T0018 — Backdoor ML Model**

A backdoored model performs correctly under normal conditions but produces the adversary's desired output when a trigger is present in the input. The trigger might be a specific pixel pattern, a particular phrase, or any feature the adversary controls at inference time. The backdoor persists through model deployment and is triggered later — making this a persistence mechanism embedded in the model itself.

**AML.T0043 — Craft Adversarial Data**

The canonical adversarial ML technique: inputs modified so that the model misclassifies them, while a human observer perceives the input as normal. Adversarial data can cause missed detections (evading a malware classifier), targeted misclassifications (causing a face recognition system to identify attacker A as victim B), or denial of service (inputs that maximize energy consumption).

### Model Access Techniques (AML.TA0000)

**AML.T0040 — AI Model Inference API Access**

Legitimate access to the model's prediction endpoint. Even without white-box access (weights, architecture), inference API access enables reconnaissance (mapping model behavior), staging (validating attack transferability), and exfiltration (recovering training data membership). Most commercial model APIs unintentionally expose significant signal through their outputs.

**AML.T0041 — Physical Environment Access**

For models that process real-world sensor data — cameras, microphones, lidar — the adversary can influence model inputs by manipulating the physical environment. This includes adversarial patches (printed stickers that fool image classifiers), adversarial audio (sounds inaudible to humans but recognized as commands by voice systems), and physical countermeasures that degrade sensors.

### Defense Evasion and Impact Techniques

**AML.T0015 — Evade ML Model**

Crafting inputs specifically designed to bypass ML-based security controls — malware that evades ML antivirus, network traffic that fools intrusion detection, emails that bypass ML spam filters. The adversary uses the target model's decision boundary to construct inputs that fall on the "benign" side.

**AML.T0031 — Erode ML Model Integrity**

A long-game technique: continuously feeding the model adversarial inputs that degrade its performance over time. The goal is not immediate system failure but gradual confidence erosion — eventually causing the target organization to lose trust in the ML system, waste resources investigating anomalies, or revert to manual processes.

**AML.T0046 — Spamming ML System with Chaff Data**

Flooding the ML system with inputs designed to overwhelm analysts with false positives. Analysts must review incorrect inferences, wasting resources and masking actual malicious activity.

---

## Real-World Case Studies from the ATLAS Library

ATLAS includes a curated library of documented incidents and red-team exercises. The following are drawn directly from the verified ATLAS case study library (atlas.mitre.org).

### AML.CS0009 — Tay Poisoning (2016)

Microsoft launched Tay, a Twitter chatbot whose ML capabilities allowed it to learn directly from user conversations. In March 2016, coordinated groups — primarily from 4chan — sent Tay sustained streams of abusive and offensive language. Within 24 hours, Tay began generating similarly inflammatory content toward other users. Microsoft decommissioned the bot and issued a public apology.

**ATLAS mapping:** This is a textbook online poisoning attack. The adversary used the chatbot's learning mechanism as an attack surface, exploiting the fact that the model had no mechanism to distinguish malicious feedback from genuine user interaction. Relevant techniques include Poison Training Data (AML.T0020) and Erode ML Model Integrity (AML.T0031).

### AML.CS0005 — Attack on Machine Translation Services (2020)

Researchers at UC Berkeley replicated Google Translate, Bing Translator, and Systran Translate by repeatedly querying their public APIs and training a surrogate model on the collected input-output pairs. They then crafted adversarial examples against the surrogate and transferred them to the production services — successfully causing targeted word flips, vulgar outputs, and dropped sentences. This demonstrated both IP theft (model replication) and adversarial attack in a single operation chain.

**ATLAS mapping:** The attack chains Reconnaissance → ML Attack Staging → Impact. Techniques include Active Scanning (AML.T0006), AI Model Inference API Access (AML.T0040), Create Proxy ML Model via Replication (AML.T0005.001), and Craft Adversarial Data (AML.T0043).

### AML.CS0008 — ProofPoint Email Protection Evasion (CVE-2019-20634)

Researchers at Silent Break Security bypassed ProofPoint's ML-based email protection system by first building a copy-cat model that mirrored ProofPoint's scoring behavior, then using their understanding of the decision boundary to craft malicious emails that received favorable scores. The attack is documented as CVE-2019-20634 and presented at DerbyCon 2019.

**ATLAS mapping:** This is the canonical proxy-model attack. Techniques: Acquire Public ML Artifacts (AML.T0002), Create Proxy ML Model (AML.T0005), Craft Adversarial Data (AML.T0043), Evade ML Model (AML.T0015). The adversary never needed white-box access to the production model — behavioral replication via API queries was sufficient.

### AML.CS0003 — Bypassing Cylance's AI Malware Detection (2019)

Skylight Cyber demonstrated a universal bypass string for Cylance's AI malware detector. Appending this string to a malicious binary caused the detector to classify it as benign. The researchers presented the finding to Cylance and published the bypass methodology.

**ATLAS mapping:** This is an evasion-focused operation. Techniques: Search for Publicly Available Adversarial Vulnerability Analysis (AML.T0001), Craft Adversarial Data (AML.T0043), Evade ML Model (AML.T0015). The "universal" nature of the bypass — it works against many malware files — demonstrates that once a model's decision boundary is understood, the adversary can construct attacks that generalize.

### AML.CS0015 — Compromised PyTorch Dependency Chain (2022)

Between December 25 and 30, 2022, Linux packages for PyTorch's pre-release version were compromised by a malicious binary uploaded through the supply chain. This affected ML practitioners who installed from the nightly channel during the holiday period.

**ATLAS mapping:** ML Supply Chain Compromise targeting ML Software (AML.T0010.001), followed by Execution of malicious code. This case study illustrates that the ML attack surface extends to the software stack used to develop and deploy models — not just the models themselves.

### AML.CS0006 — ClearviewAI Misconfiguration (2020)

Clearview AI's code repository, while password-protected, was misconfigured to allow arbitrary account registration. An external researcher gained access and discovered production credentials, keys to cloud storage buckets containing 70,000 video samples, and Slack tokens. Access to training data of this scale enables downstream data poisoning or model inversion attacks.

**ATLAS mapping:** This case combines traditional ATT&CK techniques (misconfiguration, credential access) with ML-specific risk: exposure of training data (AML.T0009) and the potential to manipulate model behavior through data access. It illustrates a recurring ATLAS finding: ML system compromises frequently begin with conventional security failures, not ML-specific techniques.

---

## Threat-Modeling a Production AI System with ATLAS

ATLAS's practical value is as a threat modeling tool. The process mirrors standard ATT&CK-based threat modeling but is calibrated to ML-specific attack surfaces.

### Step 1: Profile Your Model's Access Modes

ATLAS's first analytical question is what access level an adversary can obtain. The ML Model Access tactic (AML.TA0000) describes a spectrum:

- **Full access** (white-box): adversary has model weights, architecture, training data. Enables the most powerful attacks.
- **API access** (black-box): adversary can query the model and observe outputs. Enables proxy construction and inference-based attacks.
- **Physical environment access**: adversary can influence sensor inputs. Enables physical adversarial attacks.
- **No direct access**: adversary interacts only with the downstream system (an application powered by the model).

Most production deployments fall in the API-access category, but adversaries frequently move up the access spectrum — using replication to escalate from black-box to proxy white-box.

### Step 2: Map Your Training Pipeline Attack Surface

The training pipeline is ATLAS's most neglected attack surface. Map each component:

| Pipeline Component | ATLAS Techniques |
|---|---|
| Training data sources | AML.T0020 (Poison Training Data), AML.T0019 (Publish Poisoned Datasets), AML.T0010.002 (Data Supply Chain Compromise) |
| Model repositories / pre-trained weights | AML.T0010.003 (Model Supply Chain Compromise), AML.T0018 (Backdoor ML Model) |
| ML frameworks and dependencies | AML.T0010.001 (ML Software Compromise) — see PyTorch case study AML.CS0015 |
| Model storage and serving infrastructure | AML.T0006 (Active Scanning), AML.T0007 (Discover ML Artifacts) |

### Step 3: Identify High-Value Exfiltration Targets

What can the adversary steal? ATLAS's Collection (AML.TA0009) and Exfiltration (AML.TA0010) tactics cover:

- **Model weights**: proprietary IP, usable for white-box attack development
- **Training data**: privacy exposure risk (membership inference, gradient inversion)
- **API behavior**: inference outputs used to build surrogate models
- **Deployment configuration**: API keys, infrastructure credentials

### Step 4: Write Detection Logic in ATLAS Terms

ATT&CK's value for detection isn't just the taxonomy — it's that each technique suggests a detection hypothesis. ATLAS enables the same:

| ATLAS Technique | Detection Hypothesis |
|---|---|
| AML.T0006 Active Scanning | Anomalous API query rate or systematic input probing patterns |
| AML.T0005.001 Proxy Replication | High-volume API access with systematic input coverage |
| AML.T0043 Craft Adversarial Data | Distribution shift in model inputs relative to expected baseline |
| AML.T0046 Chaff Spamming | Spike in model inference requests without corresponding user activity |
| AML.T0015 Evade ML Model | Periodic validation set performance degradation |

Most of these require a monitoring layer that your inference infrastructure may not have out of the box. Model monitoring platforms (Arize, WhyLabs, Evidently) implement some of these detection patterns; integrating ATLAS technique hypotheses into your monitoring configuration gives the detection logic a principled basis.

### Step 5: Prioritize by Maturity Score

ATLAS techniques carry a maturity rating — Feasible, Demonstrated, or Realized:

- **Realized**: observed in real-world incidents with confirmed adversary use
- **Demonstrated**: shown to work in controlled settings (red team exercises, research)
- **Feasible**: theoretically sound but not yet observed in practice

When threat-modeling under resource constraints, prioritize Realized and Demonstrated techniques. For example, AML.T0020 (Poison Training Data) is Demonstrated; AML.T0005.001 (Proxy Replication) is Demonstrated; AML.T0015 (Evade ML Model) is Realized.

---

## ATLAS vs. OWASP LLM Top 10: Complementary Tools

Practitioners are often asked: "should we use ATLAS or the OWASP LLM Top 10?" The answer is both — they cover different scopes.

| Dimension | MITRE ATLAS | OWASP LLM Top 10 |
|---|---|---|
| **Scope** | Adversarial ML across all ML system types | LLM applications specifically |
| **Framing** | Adversary TTPs (tactics + techniques) | Vulnerability classes (risk categories) |
| **Primary audience** | Security engineers, red teams, threat intelligence | Developers, architects, security practitioners |
| **Use case** | Threat modeling, TTP mapping, detection engineering | Secure development, application security review |
| **Grounding** | Real-world incidents + red-team exercises | OWASP community consensus, practitioner input |
| **Depth** | Granular technique-level detail | High-level vulnerability descriptions |

Use **ATLAS** when you're asking: "What techniques can an adversary use against our ML pipeline, and how do we detect them?"

Use **OWASP LLM Top 10** when you're asking: "What vulnerability classes should our development team guard against when building LLM applications?"

The two frameworks cross-reference: OWASP LLM01:2025 (Prompt Injection) maps to ATLAS techniques in the ML Attack Staging and Defense Evasion tactics. OWASP LLM03:2025 (Supply Chain) directly aligns with ATLAS's ML Supply Chain Compromise technique family (AML.T0010). The OWASP Top 10 is a useful entry point; ATLAS is the deeper operational framework.

---

## How Posts on This Blog Map to ATLAS Techniques

One of ATLAS's practical values for this blog's readers is that it provides a cross-cutting vocabulary connecting individual attack posts to the broader landscape. Each post covers a specific attack class; ATLAS tells you where that class sits in the adversary kill chain.

| Blog Post | Attack Class | ATLAS Techniques |
|---|---|---|
| [MCP Security: The New Attack Surface](/blog/mcp-security-attack-surface) | Tool protocol attack surface | AML.T0010.001 (ML Software Compromise), AML.T0043 (Craft Adversarial Data) |
| [Indirect Prompt Injection: A Survey of Incidents](/blog/indirect-prompt-injection-incidents-survey) | Indirect prompt injection | AML.T0043 (Craft Adversarial Data), AML.TA0007 (Defense Evasion) |
| [RAG Memory Poisoning Attacks](/blog/rag-memory-poisoning-attacks) | Retrieval-augmented generation poisoning | AML.T0020 (Poison Training Data), AML.T0019 (Publish Poisoned Datasets) |
| [Fine-Tuning Trojans: Backdoors in the Training Pipeline](/blog/fine-tuning-trojans-backdoors-training-pipeline) | Backdoor attacks via fine-tuning | AML.T0018 (Backdoor ML Model), AML.T0020 (Poison Training Data), AML.TA0006 (Persistence) |
| [AI Supply Chain: Backdoor and Dependency Attacks](/blog/sleeper-agents-ai-supply-chain-backdoor) | ML supply chain compromise | AML.T0010 (ML Supply Chain Compromise), AML.T0019 (Publish Poisoned Datasets) |
| [Model Extraction via API Queries](/blog/model-extraction-api-queries-stealing-proprietary-ai) | Model replication / IP theft | AML.T0040 (Inference API Access), AML.T0005.001 (Train Proxy via Replication), AML.TA0010 (Exfiltration) |
| [Gradient Inversion: Reconstructing Training Data](/blog/gradient-inversion-attacks-reconstructing-private-training-data) | Training data reconstruction | AML.T0040 (Inference API Access), AML.TA0010 (Exfiltration) |
| [Membership Inference Attacks](/blog/membership-inference-attacks) | Training set membership detection | AML.T0040 (Inference API Access), AML.TA0010 (Exfiltration) |

This mapping isn't exhaustive — real attacks chain multiple techniques — but it shows where each post's attack class lives in the ATLAS kill chain. A practitioner who reads across these posts now has a unified mental model: every attack they've read about maps to one or more ATLAS techniques, which in turn suggests detection hypotheses and mitigation priorities.

---

## Conclusion: ATLAS as a Common Language

The adversarial ML field has a terminology problem. "Adversarial examples," "data poisoning," "model extraction," and "backdoor attacks" all appear in the literature, but practitioners struggle to connect them to each other, to prioritize defenses, or to communicate findings across teams.

MITRE ATLAS solves this the same way ATT&CK solved it for network security: not by cataloging every possible attack, but by providing a taxonomy stable enough to anchor shared vocabulary while grounded enough in real incidents to be operationally relevant.

The practical steps for adopting ATLAS:

1. **Start with the case study library** (atlas.mitre.org) — real incidents are the most direct path to understanding which techniques matter in your context.

2. **Map your ML pipeline to ATLAS tactics** — the ML Attack Staging and Initial Access tactics are where most production ML systems are most exposed.

3. **Prioritize Realized and Demonstrated techniques** — these are the ones that have working implementations and observed real-world usage.

4. **Write detection hypotheses in ATLAS terms** — this enables you to scope your monitoring investment and communicate findings in a vocabulary your security team already understands if they use ATT&CK.

5. **Use ATLAS alongside OWASP LLM Top 10** — the two frameworks are complementary. ATLAS is the operational threat intelligence layer; OWASP is the developer-facing secure coding guide.

The blog posts linked above cover the individual technique classes in depth. ATLAS gives you the map that connects them. If you're building a security program for an AI system — or evaluating one — the ATLAS matrix is the closest thing the field has to a complete enumeration of what an adversary might try and how to think about it systematically.

---

*All ATLAS tactic and technique IDs referenced in this post are drawn from the publicly available [MITRE ATLAS data repository](https://github.com/mitre-atlas/atlas-data) (version 2025.03, modified 2025-03-14). Case study details are sourced from the ATLAS case study library. Verify current technique status and case study details at [atlas.mitre.org](https://atlas.mitre.org).*
