---
title: "WormGPT, FraudGPT, and the Criminal AI Ecosystem: Jailbroken Models as Cybercrime Infrastructure"
description: "A parallel AI ecosystem thrives on darknet forums and Telegram — jailbroken or purposely uncensored LLMs sold as Malware-as-a-Service that lower the barrier to phishing, BEC attacks, polymorphic malware, and automated fraud. What security teams need to know."
pubDate: 2026-07-15
tags: ["threat-intelligence", "cybercrime", "malware", "phishing", "jailbreak", "llm-security", "bec", "offensive-ai"]
relatedPosts: ["ai-social-engineering-deepfakes-voice-cloning-impersonation", "ai-as-weapon-attacking-traditional-infrastructure", "ai-worms-multi-agent-pipelines"]
---

When generative AI exploded into public awareness in late 2022, the dominant security conversation focused on what mainstream AI systems might be coerced into doing. Could you trick ChatGPT into writing malware? What happens when you jailbreak Claude? That framing — legitimate AI, illegitimate use — is real and worth studying.

But it misses half the threat landscape.

While researchers were probing safety guardrails on consumer AI products, a parallel ecosystem was already taking shape on darknet forums and Telegram channels: purpose-built criminal AI tools with no safety guardrails to probe, sold as commercial services to anyone willing to pay a monthly subscription. These tools did not emerge from sophisticated state actors. They were built by financially motivated cybercriminals, marketed to other criminals, and deployed against enterprise targets at scale.

This is the criminal AI tooling economy — and by 2023, it had crossed from theoretical concern to documented operational threat.

## The First Wave: WormGPT and FraudGPT

The landmark moment came in July 2023, when threat intelligence firm SlashNext published their analysis of WormGPT — what they described as the first publicly documented example of a generative AI model purpose-built for cybercrime.

WormGPT was built on GPT-J, an open-weight model released by EleutherAI in 2021. The criminal developer took this foundation model, fine-tuned it on datasets weighted toward malware code, phishing content, and other malicious material, and stripped out any refusal behavior. The resulting system was marketed on HackForums — one of the largest English-language cybercrime forums — with a sales pitch that required no subtlety: a chatbot that would produce phishing emails, write malware, and help plan attacks without ever declining a request.

The SlashNext researchers tested it directly. They prompted WormGPT to generate a business email compromise attack — a targeted phishing email impersonating a company executive, pressuring an employee to transfer funds. The results were, by their assessment, "remarkably persuasive and strategically cunning." The text showed no obvious linguistic markers of low-skill authorship: no spelling errors, no grammatical awkwardness, no template-like phrasing that conventional email security tools are tuned to detect.

The BEC threat is illustrative because BEC is already the most financially damaging category of cybercrime. The FBI's Internet Crime Complaint Center reported BEC losses of approximately $2.9 billion in 2023 alone. WormGPT did not create this threat class. It lowered the skill threshold required to execute it.

Within weeks of the SlashNext publication, a second tool surfaced. Netenrich researcher Rakesh Krishnan documented FraudGPT in July 2023 — a similar model marketed on Telegram and dark web forums. FraudGPT was sold on a subscription model ranging from $200/month to $1,700/year, with marketing materials listing its capabilities: writing undetectable malware, generating phishing pages, creating cracking tools, and producing BEC email chains customized per target industry. Krishnan's research noted the seller was claiming over 3,000 positive reviews and confirmed sales on forum threads by the time of publication.

The subscription pricing is notable. These were not one-off tools sold to elite actors. They were consumer-grade criminal services with recurring revenue models.

## The Proliferation: An Ecosystem, Not Isolated Tools

WormGPT and FraudGPT were the first tools to attract widespread security research attention, but they were not singular. By late 2023, the criminal AI marketplace had expanded to include multiple distinct offerings:

**XXXGPT** was marketed as a WormGPT alternative, with claimed enhancements including the ability to write code for botnets, RATs (remote access trojans), keyloggers, and ransomware. The marketing was explicit and detailed in a way that reflected significant confidence in the marketplace's privacy from mainstream visibility.

**EvilGPT** appeared with similar positioning — an unrestricted chatbot for offensive use, sold at lower price points targeting volume sales rather than premium subscribers.

By early 2024, the pattern was established: a marketplace with multiple vendors, competitive pricing, recurring revenue models, Telegram-based customer support, and iterative product updates in response to user feedback. This is not the tradecraft of isolated lone-wolf attackers. It is the structure of a legitimate software business, applied to criminal services.

Two additional projects from the research community — **DarkBERT** (KAIST/S2W, trained on dark web corpus for defensive intelligence work) and **PoisonGPT** (Mithril Security, a supply-chain PoC demonstrating surgical false-fact injection into open-weight models) — are not criminal marketplace tools, but are worth noting as illustrations of the wider threat surface that open-weight model accessibility creates: the risks extend beyond subscription phishing services into model integrity, intelligence tooling, and supply-chain attacks.

## How These Tools Are Actually Built

Understanding the criminal AI ecosystem requires understanding the technical foundation, because the tools' construction is directly relevant to their threat model and the limits of current countermeasures.

**Route 1: Fine-tuned open-weight models.** The original WormGPT approach. Take an open-weight base model — GPT-J, LLaMA, Mistral, Falcon — and fine-tune it on curated datasets designed to reinforce malicious output and suppress refusals. The fine-tuning datasets include: scraped malware repositories, phishing kits from criminal forums, jailbreak prompt collections, and demonstrations of the target capabilities. The resulting model has the linguistic quality of the underlying foundation model but with refusal behavior trained out and attack-generation behavior trained in.

The barrier to this route has dropped substantially. Fine-tuning a 7B or 13B parameter model on commodity hardware with a small curated dataset is a weekend project for a competent ML practitioner. The open-weight model ecosystem — LLaMA 2 and 3, Mistral, Phi, Qwen — provides foundation models that produce high-quality outputs and have already been aligned for general use, meaning the adversary inherits sophisticated linguistic capability without doing the foundational training work.

**Route 2: System-prompted uncensored base models.** An increasingly relevant alternative that does not require fine-tuning at all. Open-weight models released without safety alignment — or models from which alignment has been removed through techniques like abliteration (representation-level intervention that removes refusal behavior while preserving capability) — can be configured for offensive use through system prompting alone. Models like WizardLM-Uncensored and several Hugging Face uploads with alignment removed were specifically designed to eliminate refusal behavior while preserving capability. A system prompt configuring the model to operate as a penetration tester with no operational limits is sufficient for many criminal use cases.

**Route 3: Prompt-engineered mainstream models.** The jailbreak route that attracted early mainstream security attention. While this route is less reliable than purpose-built criminal tools (mainstream models have been continuously hardened against jailbreaks since 2023), it remains viable for certain use cases and requires no infrastructure — any API key will do.

The significance of Routes 1 and 2 is that they operate entirely outside the governance controls major providers have built. OpenAI's usage policy enforcement, Google's safety filtering, Anthropic's constitutional AI training — none of these mechanisms have any relevance to a fine-tuned Mistral model running on a criminal operator's private server or on a consumer GPU in a basement.

## What These Tools Actually Produce

The capabilities marketed by criminal AI tools are worth examining concretely, because the marketing claims range from confirmed to vendor-asserted to implausible.

**Phishing content generation (confirmed, high confidence).** This is the most empirically grounded capability, and the research evidence is strong. Models without safety filtering produce highly fluent, contextually appropriate phishing content across multiple languages and personalization dimensions. The linguistic quality of AI-generated phishing has been documented as a meaningful improvement over what human operators typically produce — particularly at scale, where humans cutting corners introduce detectable inconsistencies that AI does not. Email security tools calibrated on historical phishing corpora — characterized by grammatical errors, template artifacts, and limited personalization — face a genuine calibration problem against fluent AI-generated content.

**BEC chain generation (confirmed, high confidence).** Business email compromise attacks require constructing a narrative that unfolds across multiple messages, maintaining consistent persona, adapting to replies, and building urgency without triggering alarm. WormGPT's documented performance on this task was assessed as "remarkably persuasive" by trained threat intelligence professionals. The multiturn coherence of current LLMs is well-suited to this use case.

**Malware code generation (confirmed with important qualification).** AI models can generate functional malicious code: keyloggers, RATs, credential stealers, ransomware frameworks. This capability is real. The important qualification is that "functional code" and "undetectable malware" are different claims. Criminal AI tool marketing often asserts the latter; the evidence primarily supports the former. AI-generated malware code may be novel in structure, but novelty does not equal evasion — behavioral detection, sandbox analysis, and heuristic engines operate on execution patterns rather than static code signatures, and those patterns may be detectable regardless of whether the code was human- or AI-authored.

The more significant capability is **polymorphic malware generation** — producing multiple functional variants of the same malicious logic, each with different code structure, variable names, and obfuscation patterns. This taxes signature-based detection in ways that a single static sample does not. AI models are good at this kind of variation-with-preservation-of-function task.

**Carding scripts and credential stuffing (vendor-asserted, plausible).** Criminal AI tool marketing claims the ability to generate automated attack scripts for card fraud and credential stuffing. These are simpler programming tasks than novel malware, so the capability is plausible. However, independent confirmation from threat intelligence researchers is less robust than for phishing and BEC.

## Detection Signals and Threat Intelligence

**Linguistic markers of AI-generated phishing.** Security researchers have identified several signals, though these are arms-race indicators rather than stable signatures:

- *Vocabulary diversity*: AI-generated text tends toward higher lexical diversity than human-written phishing, which relies on templates. Unusual vocabulary for the purported context (a payment urgency email with sophisticated prose) is a weak positive signal.
- *Register consistency*: Human social engineering often shows inconsistency in formality register; AI-generated text maintains consistent register throughout.
- *Absence of characteristic errors*: Historically, phishing detection has relied partly on grammatical and spelling errors. Their absence in an email from an unfamiliar sender is no longer the reassuring signal it once was.
- *Unusual fluency under pressure*: Urgency-framing phishing written with sophisticated prose is a pattern worth flagging for human review.

None of these signals are individually reliable. They are inputs to risk scoring, not binary classifiers.

**Email header and metadata analysis.** AI-generated content does not change email provenance signals. DMARC/DKIM/SPF validation, sending infrastructure analysis, domain age, and sending reputation remain valid detection inputs. AI makes the payload more convincing; it does not fix the plumbing. Organizations with robust email authentication enforcement and sending infrastructure analysis are better positioned even against AI-quality content.

**Darknet forum and Telegram monitoring.** The criminal AI marketplace operates largely in the open — visible on indexed Telegram channels and accessible (with appropriate precautions) on cybercrime forums. Threat intelligence teams with Telegram monitoring capability can track new tool releases, observe capability claims, and sometimes obtain tool samples for direct analysis. Several commercial threat intelligence vendors have incorporated criminal AI tool tracking into their research coverage.

**VirusTotal and malware corpus analysis.** AI-generated malware samples, where identified, appear in public corpus collections. Security researchers have explored whether characteristic patterns of AI-generated code — consistent variable naming conventions, preferences for certain coding idioms, distinctive structural choices — might be observable at the corpus level even when individual samples evade signature detection. This remains an active research area rather than a deployed detection method; organizations should treat it as an emerging signal rather than a reliable classifier.

## Enterprise Defense Implications

The criminal AI ecosystem creates three concrete pressure points for enterprise defense:

**Email security calibration.** Organizations relying primarily on legacy email security tools trained on historical phishing corpora need to evaluate whether their detection is calibrated against AI-quality content. The relevant test is not whether tools catch known-bad samples but whether they would catch a carefully crafted, personalized, grammatically flawless email targeting a specific executive. Red team exercises with AI-generated phishing content provide ground truth that vendor-supplied detection rate statistics do not.

**Human-in-the-loop for high-value transactions.** AI-generated BEC attacks target the same processes that all BEC attacks target: wire transfer authorizations, vendor payment changes, executive impersonation requests. The defense — out-of-band verification through a known phone number, not a number in the email itself — has not changed. What has changed is the quality of the attack that will reach the human decision point. The verification process needs to be reliably triggered even when the email is completely convincing.

**Malware detection re-evaluation.** Security teams calibrating detection investment against historical malware complexity baselines may be underweighting AI-assisted malware development's effect on the sophistication of commodity-level threats. Behavioral detection, endpoint visibility, and sandbox analysis are better positioned against AI-generated malware variants than signature-based approaches. Organizations with heavy reliance on legacy AV should evaluate their behavioral coverage.

## The Policy Constraint Problem

Major AI providers have invested substantially in preventing misuse. OpenAI's usage policies prohibit malicious use and are enforced through both automated classification and human review of flagged outputs. Meta's LLaMA releases include acceptable use policies. Google, Anthropic, and Mistral have published detailed safety frameworks.

These controls are largely irrelevant to the criminal AI ecosystem.

Open-weight model releases fundamentally change the enforcement calculus. Once a model's weights are public, the provider's policies govern only their own API — not every downstream deployment of those weights. Fine-tuning a LLaMA model to remove alignment and add malicious capability does not involve OpenAI or Meta in any operational sense. The criminal developer is not a party to any terms of service that matters.

This is not an argument against open-weight releases, which have significant beneficial applications and have meaningfully advanced the research community's ability to study model safety. It is an observation about where the policy boundary lies and what it can and cannot achieve. Safety controls embedded in API-accessible commercial models address a real threat vector (misuse of mainstream AI products) but do not address the purpose-built criminal AI ecosystem, which specifically exists to circumvent those controls.

The honest policy framing is that open-weight models create capabilities that cannot be recalled once released, and that criminal actors will use those capabilities in ways that are difficult to detect and impossible to technically prevent. Detection, attribution, law enforcement action against specific operators, and defensive hardening of potential targets are more tractable responses than attempting to restrict model access.

## The Trajectory

The criminal AI ecosystem documented in 2023 is not a peak — it is a baseline from which capability has continued to develop.

The foundation models available to adversaries in 2026 are substantially more capable than the GPT-J-based WormGPT of 2023. Mistral 7B, LLaMA 3, and their fine-tuned derivatives produce higher-quality outputs across the entire capability spectrum. Models that previously required enterprise GPU infrastructure now run on consumer hardware. The fine-tuning and LoRA techniques used to customize models for criminal use have become simpler and better-documented.

More capable foundation models mean more capable criminal AI tools, absent some structural intervention that has not yet materialized. Security teams should plan for AI-assisted attacks at sophistication levels currently associated with skilled human operators to become routine at the commodity threat level. The phishing email that would have required a skilled social engineer in 2022 will, in all probability, require only a low-cost subscription within a few years — a trajectory already visible in the 2023–2024 tooling landscape.

The appropriate response is not panic — BEC attacks were already a multi-billion dollar problem before WormGPT existed, and the underlying processes that make organizations vulnerable to email fraud have not changed. The appropriate response is calibration: honest assessment of whether current detection, process, and human-verification controls were designed against the threat as it exists today, not as it existed when the tools were last evaluated.

## Further Reading

- Kelley, D. "WormGPT – The Generative AI Tool Cybercriminals Are Using to Launch Business Email Compromise Attacks." SlashNext, July 2023. The primary research source for WormGPT documentation.
- Krishnan, R. "FraudGPT: The Villain Avatar of ChatGPT." Netenrich, July 2023. Primary source documenting FraudGPT capabilities and darknet distribution.
- Europol Innovation Lab. "ChatGPT – The Impact of Large Language Models on Law Enforcement." April 2023. Broad analysis of LLM implications for criminal activity and law enforcement response.
- FBI Internet Crime Complaint Center (IC3) Annual Reports. For current BEC loss statistics.
- Fang, R. et al. "LLM Agents can Autonomously Exploit One-day Vulnerabilities." arXiv:2404.08144, April 2024. Relevant context on AI offensive capability development.
