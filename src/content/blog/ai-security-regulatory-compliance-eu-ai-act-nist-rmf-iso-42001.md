---
title: "AI Security and the Law: What the EU AI Act, NIST AI RMF, and ISO 42001 Actually Require of Builders"
description: "The EU AI Act creates statutory security obligations for high-risk AI systems; NIST AI RMF 1.0 and ISO/IEC 42001:2023 are becoming de facto requirements through procurement and certification. This post maps specific requirements — adversarial testing, incident reporting deadlines, robustness mandates — to the attack classes they govern and the controls that address them."
pubDate: 2026-07-07
tags: ["regulatory-compliance", "eu-ai-act", "nist-ai-rmf", "iso-42001", "risk-management", "governance", "red-teaming", "incident-response"]
---

For most of this blog's life, AI security has been framed as a technical problem: attackers probe model boundaries, defenders patch them, researchers publish new attacks faster than defenses mature. That framing isn't wrong — but it's incomplete. In 2024–2026, AI security became a *legal* problem. Organizations that ship high-risk AI systems now face statutory obligations to adversarially test them, report security incidents within hours, and maintain documented risk management systems that would survive regulatory scrutiny.

This post maps three frameworks — the EU AI Act (Regulation (EU) 2024/1689), the NIST AI Risk Management Framework 1.0 (NIST.AI.100-1), and ISO/IEC 42001:2023 — to the attack classes covered in detail elsewhere on this blog. The goal is to answer a question practitioners increasingly face: *"Our RAG system has a prompt injection vulnerability. Which regulation do we violate if we don't fix it, and what exactly does fixing it require?"*

## The Compliance Imperative: Why Security Is Now a Legal Obligation

Three forces converged to make AI security a regulatory matter.

**Incident severity crossed the materiality threshold.** AI system compromises in healthcare diagnostics, financial decisioning, and critical infrastructure now cause harms that regulators treat as product liability events. The framing shifted from "software bug" to "defective product."

**Voluntary frameworks weren't moving fast enough.** The NIST AI RMF debuted in January 2023 as an explicitly voluntary framework. Within months, US federal procurement policy began treating it as a de facto requirement for AI acquisition. The gap between "voluntary" and "mandatory" narrowed to policy language.

**The EU moved first, forcing global compliance.** Regulation (EU) 2024/1689 — the EU AI Act — was published in the Official Journal of the European Union on July 12, 2024 (OJ L 2024/1689). It applies directly in all EU member states without national implementation legislation. Because it applies to any AI system deployed in the EU regardless of where the developer is located, it effectively became a global standard for any organization with EU market exposure.

---

## The EU AI Act: Risk Architecture and the Security Articles That Matter

The EU AI Act (Regulation (EU) 2024/1689) establishes a risk-tiered regulatory structure. Understanding which tier your system falls into determines which security obligations apply.

### Risk Classification

**Unacceptable risk (prohibited):** Systems are banned outright — AI-enabled biometric categorization based on sensitive attributes, social scoring by public authorities, real-time remote biometric identification in public spaces with limited exceptions (Article 5). No security obligation applies because the deployment itself is prohibited.

**High-risk AI systems (Annex III):** Systems in eight domains including biometric identification, critical infrastructure management, education, employment, essential private and public services, law enforcement, migration, and administration of justice (Article 6 and Annex III). These systems bear the full weight of the Act's security requirements.

**General-purpose AI models (GPAI, Articles 51–56 / Title VIII):** Large foundation models trained on substantial compute. "Systemic-risk" GPAI models — those trained using more than 10^25 FLOPs — face heightened obligations including mandatory red-team evaluations.

**Limited and minimal risk:** Chatbots and image generators face transparency obligations (Article 50) but not the security mandates discussed here.

### Article 9: The Mandatory Risk Management System

Article 9 requires providers of high-risk AI systems to establish, implement, document, and maintain a *risk management system* throughout the system lifecycle. This is the architectural security requirement.

Specifically, Article 9(2) requires the risk management system to:
- Identify and analyze known and reasonably foreseeable risks associated with the AI system
- Estimate and evaluate the risks that may emerge when the system is used as intended and under conditions of reasonably foreseeable misuse
- Evaluate risks in light of data from post-market monitoring

Article 9(4) requires that "appropriate and targeted risk management measures" be adopted for residual risks. Article 9(5) requires that high-risk AI systems be tested to identify appropriate risk management measures and to verify compliance — and explicitly states that testing shall be performed against **prior defined metrics and probabilistic thresholds**.

For security purposes, this means adversarial testing — including tests for prompt injection, data poisoning susceptibility, model extraction resistance, and robustness to distribution shift — is not optional for high-risk AI systems. It is a statutory requirement.

### Article 15: Accuracy, Robustness, and Cybersecurity

Article 15 is the most technically specific security provision in the Act. It requires that high-risk AI systems be designed and developed to achieve, throughout their lifecycle, an "appropriate level of accuracy, robustness and cybersecurity, and to perform consistently in those respects."

Article 15(3) is particularly significant: "The technical robustness of high-risk AI systems shall include resilience against attempts by unauthorised third parties to alter their use, outputs or performance by exploiting the system vulnerabilities." The recitals clarify that this encompasses **adversarial attacks**, **data poisoning attacks**, and **model poisoning attacks**.

Article 15(4) specifies that for high-risk AI systems intended to interact with natural persons, cybersecurity measures shall be commensurate with the circumstances.

The practical interpretation: a high-risk AI system that is demonstrably vulnerable to documented attack classes — and that has not been tested for and mitigated against those vulnerabilities — will struggle to demonstrate the "appropriate level" of robustness that Article 15 requires. The Act uses a risk-based standard rather than an absolute one, so the adequacy of security measures is assessed in proportion to the risk; but the burden falls on providers to demonstrate that level has been met.

### Articles 51–56: GPAI and Systemic-Risk Models

General-purpose AI models with systemic risk (>10^25 FLOPs training compute) face obligations that go beyond the high-risk framework. Article 55 requires providers of systemic-risk GPAI models to:
- Perform **model evaluations** including adversarial testing (Article 55(1)(a)) — described in the Act as testing "to identify and mitigate systemic risks"
- Track, document, and **report serious incidents** to the AI Office without undue delay
- Apply **cybersecurity protection** adequate to the level of risk

The AI Office's Code of Practice for GPAI Models is the implementing guidance for these provisions. **Important: as of the time of writing (July 2026), the Code of Practice remains in iterative development through the European AI Office's multi-stakeholder process.** Draft iterations have been published, but the Code is not yet finalized. Organizations should track the official AI Office publications at ai-office.ec.europa.eu rather than citing any specific draft iteration as binding.

### Incident Reporting

Article 73 establishes incident reporting obligations for providers of high-risk AI systems. Serious incidents must be reported to national market surveillance authorities without undue delay, and in any case within the following tiered deadlines from first becoming aware:

- **Two days** (calendar): incidents involving widespread infringement or serious incidents involving critical infrastructure
- **Ten days**: incidents resulting in death
- **Fifteen days**: other serious incidents (the default ceiling)

For systemic-risk GPAI models, Article 55(1)(c) requires reporting of serious incidents to the AI Office without undue delay.

**Important:** Always verify Article 73's specific deadlines against the final adopted text of Regulation (EU) 2024/1689 published in the Official Journal, as implementing guidance from national authorities may add precision. The deadlines above are drawn from the Act's tiered structure; the GPAI-specific obligation in Article 55 has its own formulation.

### Enforcement and Penalties

Infringements of specific provisions carry different penalty ceilings:
- Violations of the prohibited practices in Article 5: up to **€35,000,000** or, for undertakings, up to **7% of total worldwide annual turnover**, whichever is higher (Article 99(3))
- Violations of other obligations applicable to providers (including the Article 9 and 15 security requirements): up to **€15,000,000** or **3% of total worldwide annual turnover**, whichever is higher (Article 99(4))
- Incorrect, incomplete, or misleading information to authorities: up to **€7,500,000** or **1% of total worldwide annual turnover**, whichever is higher (Article 99(5))

These figures come directly from Regulation (EU) 2024/1689 Article 99 as published. The penalties are ceilings — national enforcement authorities exercise discretion — but they signal regulatory seriousness.

**Application timeline:** The Act entered into force on August 1, 2024. Provisions on prohibited AI practices (Article 5) applied from February 2, 2025. Obligations for GPAI models applied from August 2, 2025. The high-risk AI system requirements for systems listed in Annex III apply from **August 2, 2026**. High-risk AI systems covered via the Annex I product-safety route (systems embedded in regulated products such as medical devices and machinery) follow a longer transition timeline. This means the full Article 9 and Article 15 obligations are now active for most Annex III high-risk systems.

---

## NIST AI RMF: From Voluntary Framework to Procurement Requirement

The NIST AI Risk Management Framework 1.0 (NIST.AI.100-1) was published by the National Institute of Standards and Technology in January 2023. It is organized around four core functions.

### The Four Core Functions

**GOVERN:** Establishing organizational policies, processes, and accountability structures for AI risk. Govern is the enabling function — an organization with no AI governance structure cannot meaningfully execute the other three. For security, Govern includes designating responsibility for adversarial testing, defining the risk appetite for AI system deployment, and establishing the policies that determine when a discovered vulnerability triggers incident response.

**MAP:** Identifying and categorizing AI risks in context. Map involves understanding what the AI system does, who uses it, what could go wrong, and how that harm would manifest. For security practitioners, Map is the threat modeling phase: which attack classes are plausible given this deployment context?

**MEASURE:** Analyzing and assessing identified risks using appropriate metrics and tools. Measure is where security testing lives. The AI RMF Playbook — the companion document to NIST.AI.100-1 — specifies practices at the sub-function level.

**MANAGE:** Prioritizing and addressing risks identified in the Measure phase. Manage includes both mitigation implementation and the ongoing monitoring required to detect new risks as the system and its environment evolve.

### The Playbook's Security-Specific Practices

The AI RMF Playbook identifies specific suggested practices for each sub-function. The most security-relevant:

**MEASURE 2.5** — Practices for evaluating and improving the privacy and data quality dimensions of AI systems include assessing AI training data for integrity. This practice maps directly to data poisoning attack scenarios: does the training pipeline include integrity verification? Is provenance of training data documented?

**MEASURE 2.6** — Addresses testing for performance metrics across stakeholder groups and deployment contexts, including adversarial conditions. Robustness evaluation under distribution shift and adversarial perturbation falls here.

**MEASURE 2.7** — Specifically addresses AI risk and impact assessment methods for adversarial attacks. The Playbook text suggests: "Conduct adversarial testing including red-teaming to identify AI system vulnerabilities, attack surfaces, and exposures. Document results." This practice is the NIST equivalent of the EU AI Act's Article 9(5) testing mandate.

**GOVERN 1.7** — Processes for incident response specific to AI systems. This aligns with the AI RMF's relationship to existing NIST cybersecurity guidance: NIST SP 800-61r3 (Incident Response) remains the baseline; GOVERN 1.7 extends it for AI-specific incidents including model compromise.

### Relationship to NIST CSF 2.0

NIST Cybersecurity Framework 2.0 (published February 2024) added a sixth function — **Govern** — mirroring the AI RMF's structure. The intent is explicit alignment: organizations using CSF 2.0 for their overall security program should integrate AI RMF practices into the same governance structure rather than maintaining separate frameworks. The AI RMF's MAP function maps roughly to CSF's Identify; MEASURE to Identify and Detect; MANAGE to Protect, Respond, and Recover.

### Federal Adoption and Procurement

Executive Order 14110 (October 2023) directed federal agencies to develop standards and guidance for AI safety and security based on NIST's work. The Office of Management and Budget Memorandum M-24-10 (March 28, 2024) established AI governance requirements for federal agencies using AI. M-24-10 explicitly references the NIST AI RMF and directs agencies to use it for risk management of covered AI — making the framework functionally mandatory for agency operations even if the framework's own documentation describes it as voluntary. For vendors selling AI systems to the US federal government, the practical effect is that AI RMF alignment has become a procurement expectation built into agency governance requirements.

---

## ISO/IEC 42001:2023: What an AI Management System Must Document on Security

ISO/IEC 42001 — "Artificial intelligence — Management system" — was published in December 2023. It follows the Annex SL high-level structure familiar from ISO 27001 and ISO 9001, making it integrable with existing management system certifications.

### What 42001 Requires

ISO/IEC 42001 requires organizations to establish, implement, maintain, and continually improve an **AI management system (AIMS)**. The core security-relevant requirements:

**Clause 6 (Planning):** The organization must determine AI-related risks and opportunities. For security, this means identifying adversarial threats as part of the risk assessment process — not just operational risks like accuracy degradation, but deliberate attacks.

**Clause 8 (Operation):** The AIMS must include operational controls for AI system development and deployment. Annex A (controls) and Annex B (implementation guidance) specify that organizations should consider adversarial robustness as part of the AI system design review.

**Clause 9 (Performance evaluation):** The organization must monitor and measure AI system performance, including security properties. Where risks have been identified, controls must be verified as effective.

**Clause 10 (Improvement):** Nonconformities — including discovered security vulnerabilities — must trigger corrective action processes.

The standard does not specify *which* adversarial tests must be performed; it requires that the organization's risk assessment process identify applicable threats and that appropriate controls be implemented and verified. For an organization that has identified prompt injection as a relevant risk for their GPAI deployment, the AIMS must document the control (prompt filtering, system prompt isolation, output monitoring) and verify its effectiveness.

### Relationship to ISO 27001

ISO/IEC 27001 (information security) and ISO/IEC 42001 (AI management system) are designed to coexist. An organization with ISO 27001 certification extends its Information Security Management System to include AI-specific controls via a combined ISMS+AIMS. The AI Office's guidance for GPAI Code of Practice compliance references ISO 42001 as a relevant implementation mechanism, though certification is not currently required.

---

## Cross-Reference Map: Attack Class → Regulation → Blog Post

The following table maps attack classes to their regulatory anchors and the technical detail available elsewhere on this blog.

| Attack class | EU AI Act article | NIST AI RMF practice | ISO 42001 clause | Blog post |
|---|---|---|---|---|
| **Prompt injection** | Art. 15 (robustness against adversarial manipulation) | MEASURE 2.7 | Clause 8 (operational controls) | [Prompt Injection via Role Confusion](/blog/prompt-injection-role-confusion), [Indirect Prompt Injection Incidents Survey](/blog/indirect-prompt-injection-incidents-survey) |
| **Indirect prompt injection** | Art. 15 (adversarial manipulation); Art. 9 (risk mgmt) | MEASURE 2.7, MEASURE 2.6 | Clause 8 | [Indirect Prompt Injection Incidents Survey](/blog/indirect-prompt-injection-incidents-survey), [Copilot File Exfiltration via Prompt Injection](/blog/copilot-cowork-file-exfiltration-prompt-injection) |
| **Training data poisoning** | Art. 9 (risk mgmt system); Art. 15 (robustness against data poisoning) | MEASURE 2.5 | Clause 6 (risk planning) | [Pretraining Corpus Poisoning](/blog/pretraining-corpus-poisoning-web-scale-attack), [RAG Memory Poisoning](/blog/rag-memory-poisoning-attacks) |
| **Backdoor / trojan attacks** | Art. 9 (risk mgmt); Art. 15 (model poisoning resilience) | MEASURE 2.5, MEASURE 2.7 | Clause 8 | [Backdoor Attacks in Foundation Models](/blog/backdoor-attacks-foundation-models), [Sleeper Agents](/blog/sleeper-agents-ai-supply-chain-backdoor) |
| **Model extraction** | Art. 15 (cybersecurity); Art. 9 (risk mgmt) | MEASURE 2.6, MEASURE 2.7 | Clause 8 | [Model Extraction via API Queries](/blog/model-extraction-api-queries-stealing-proprietary-ai) |
| **Membership inference** | Art. 10 (data governance); GDPR intersection | MEASURE 2.5 | Clause 6 | [Membership Inference Attacks](/blog/membership-inference-attacks) |
| **Supply chain attacks** | Art. 9 (risk mgmt); Art. 13 (transparency re: third-party components) | GOVERN 1.7, MEASURE 2.6 | Clause 8 | [AI Agent Supply Chain Attacks](/blog/ai-agent-supply-chain-attacks), [LLM Router Supply Chain Attack](/blog/llm-router-supply-chain-attack) |
| **Adversarial examples** | Art. 15 (robustness against adversarial input) | MEASURE 2.6 | Clause 8 | [Adversarial Attacks on Vision-Language Models](/blog/adversarial-attacks-vision-language-models-pixels-injection), [Adversarial Examples (Foundational)](/blog/adversarial-examples-foundational-ml-attack-production) |
| **Privacy / data exfiltration** | Art. 10 (data governance); Art. 15; GDPR intersection | MEASURE 2.5 | Clause 6, Clause 8 | [RAG Privacy Attacks](/blog/rag-privacy-attacks-retrieval-data-exfiltration), [Gradient Inversion Attacks](/blog/gradient-inversion-attacks-reconstructing-private-training-data) |

### A Note on Regulatory Intersection with GDPR

The EU AI Act explicitly preserves the application of the GDPR (Regulation 2016/679) and does not replace it. For AI systems that process personal data — which includes most deployed LLMs in commercial contexts — both the AI Act's security requirements and GDPR's data protection obligations apply concurrently. Privacy attacks (membership inference, training data reconstruction, gradient inversion) implicate both frameworks: Article 15 of the AI Act (robustness) and Article 32 of the GDPR (security of processing).

---

## Red-Teaming as a Regulatory Requirement

The most significant doctrinal shift in the 2024–2026 regulatory wave is the treatment of red-teaming. Prior to 2024, red-teaming for AI systems was understood as a security best practice — valuable, recommended, but not legally required. The EU AI Act changed this.

### What the EU AI Act Requires

Article 9(5) requires that high-risk AI systems be tested to identify appropriate risk management measures and to verify compliance. Article 55(1)(a) requires that providers of systemic-risk GPAI models perform model evaluations including adversarial testing to identify and mitigate systemic risks.

The Act does not define "adversarial testing" with the specificity of a technical standard. The AI Office's Code of Practice for GPAI — still in development at time of writing — is intended to provide this specificity for GPAI models. For high-risk AI systems in Annex III categories, standards bodies (including ENISA and CEN-CENELEC) are developing harmonized standards that will provide a presumption of conformity. Organizations that comply with a harmonized standard will be presumed to satisfy the corresponding legal requirement.

Until those standards are finalized, the practical obligation is: document your adversarial testing methodology, conduct testing proportionate to the risk, and maintain records that demonstrate the testing occurred and that residual risks were evaluated.

### NIST's Framing

NIST AI RMF Playbook practice MEASURE 2.7 describes red-teaming in operational terms: "Conduct adversarial testing including red-teaming to identify AI system vulnerabilities, attack surfaces, and exposures. Document results." The NIST companion document *Adversarial Machine Learning: A Taxonomy and Terminology* (NIST.AI.100-2e2025) provides technical vocabulary for these evaluations. This document was finalized in 2025; earlier iterations were published as drafts for public comment.

For organizations aligning with the AI RMF, MEASURE 2.7 is the practice that requires red-teaming. The word "suggested" in the Playbook's practice descriptions reflects the framework's voluntary character at the federal level — but as noted above, voluntary at the statutory level does not mean optional in procurement contexts.

### Operationalizing the Requirement

A red-teaming program that satisfies regulatory scrutiny needs to answer three questions the AI Act's Article 9 implicitly requires:

1. **What are the plausible attack scenarios for this system in its deployment context?** (The MAP function in NIST terms; risk identification in Article 9(2)(a) terms.)
2. **Were those scenarios tested, by whom, with what methodology, and what were the results?** (Article 9(5) testing documentation; MEASURE 2.7 documentation.)
3. **What residual risks remain after controls are applied, and why were they accepted?** (Article 9(2)(c) risk evaluation; MANAGE function in NIST terms.)

The [MITRE ATLAS framework](/blog/mitre-atlas-adversarial-ai-threat-landscape) provides the most systematic taxonomy for answering the first question — mapping attacker tactics and techniques to system components. The [AI Incident Response Playbook](/blog/ai-incident-response-playbook) addresses what happens when pre-deployment red-teaming fails to catch everything.

---

## Incident Reporting Obligations

### EU AI Act Reporting

Article 73 establishes the incident reporting timeline for providers of high-risk AI systems. Serious incidents must be reported to national market surveillance authorities without undue delay, within the following tiered deadlines from first becoming aware:

- **Two calendar days:** Incidents involving widespread infringement or serious incidents involving critical infrastructure
- **Ten calendar days:** Incidents resulting in death
- **Fifteen calendar days:** Other serious incidents (the default)

For systemic-risk GPAI models, Article 55(1)(c) requires reporting of serious incidents to the AI Office without undue delay.

"Serious incident" is defined in Article 3(49) as an incident — or near-miss — that has led, or may lead, to death, serious harm to health, property damage, or a serious breach of fundamental rights. In security terms, this captures: a model compromise that enables extraction of health records (GDPR + AI Act), an adversarial attack against a high-risk AI used in loan decisioning that produces discriminatory outputs at scale, or a backdoor activation in a system used for critical infrastructure management.

**Always verify these deadlines against the final adopted text of Regulation (EU) 2024/1689 and national market surveillance authority guidance** — implementing acts may add precision, and the tiering is complex.

### Interaction with Existing IR Programs

The EU AI Act's reporting obligations stack with:
- **GDPR Article 33:** 72-hour notification to supervisory authority for personal data breaches
- **NIS2 Directive:** 24-hour early warning, 72-hour incident notification, and 1-month final report for significant cybersecurity incidents affecting essential services
- **DORA (Digital Operational Resilience Act):** Incident reporting for financial sector entities

For organizations in regulated industries deploying high-risk AI, a single incident may trigger concurrent obligations under multiple regimes. The AI Act reporting goes to **national market surveillance authorities** (the bodies designated by each member state under Article 70); GDPR reporting goes to **data protection authorities** (DPAs); NIS2 reporting goes to **national cybersecurity authorities** (e.g., BSI in Germany, ANSSI in France).

Practical implication: incident response playbooks for EU-deployed high-risk AI systems need a regulatory notification workflow that is distinct from the technical response workflow, that maps each incident type to its applicable reporting requirements, and that has pre-approved notification templates to meet the 72-hour / three-working-day deadlines without losing time to legal review during the crisis. The [AI Incident Response Playbook](/blog/ai-incident-response-playbook) covers the technical response phases; the regulatory notification layer is an organizational process that sits alongside it.

---

## What to Do Now: A Compliance Readiness Checklist

Not every organization needs to comply with every requirement above. The obligations are conditional on system type, deployment context, and geography. This checklist helps prioritize:

**1. Classify your AI systems under the EU AI Act risk tiers, and determine your role (provider vs. deployer).**
If you have EU market exposure and deploy AI systems, determine whether any fall into Annex III categories. Critically, note that Articles 9 and 15 impose their most demanding obligations on **providers** (those who develop AI systems or place them on the market), not on deployers who merely use third-party systems. Deployers have their own obligations (Article 26) but are not responsible for the provider-level technical compliance. Understanding your role in the AI supply chain is the prerequisite for determining which obligations bind you.

**2. Assess whether any models qualify as GPAI or systemic-risk GPAI.**
If you are a foundation model provider (not a deployer of third-party models), determine training compute. The 10^25 FLOPs threshold for systemic risk is in Article 51(1). If you are deploying third-party models, understand what the model provider's obligations are and how those flow through supply-chain contracts.

**3. Conduct and document adversarial testing for each high-risk system.**
At minimum, test against the attack classes in the cross-reference table above that are relevant to your deployment context. Document the methodology, who performed the testing, the date range, the findings, and the residual risks. This documentation is what an Article 9(5) compliance audit will request.

**4. Establish incident response with regulatory notification workflows.**
Map your AI incident types to their reporting obligations. Identify which authority receives which notification, pre-draft notification templates, and ensure the tiered Article 73 deadlines (2 / 10 / 15 calendar days by incident severity) are built into your incident response timeline. If you are also subject to GDPR (72h for data breaches) and/or NIS2 (24h early warning, 72h notification), consolidate the notification map — a single AI security incident may trigger multiple concurrent reporting obligations to different authorities.

**5. Align with NIST AI RMF to satisfy US federal procurement and build the governance layer.**
Whether or not you have direct federal contracts, AI RMF alignment produces the documentation artifacts (risk assessments, testing records, governance policies) that also support EU AI Act compliance. The four functions — Govern, Map, Measure, Manage — are a useful organizing structure for building an AI security program that scales across regulatory jurisdictions.

---

## Primary Sources and Further Reading

All regulatory claims in this post are drawn from primary source text. Readers implementing compliance programs should verify against the authoritative texts:

- **NIST.AI.100-2e2025 (Adversarial Machine Learning: Taxonomy and Terminology of Attacks and Mitigations):** Finalized in 2025. Available at nist.gov. Earlier pre-decisional draft iterations were published in 2023 and 2024; use the finalized version for compliance citations.
- **EU AI Act (Regulation (EU) 2024/1689):** Published in the Official Journal of the European Union, L series, 2024. The text is available via EUR-Lex. Article numbers cited here refer to the final adopted text.
- **NIST AI RMF 1.0 (NIST.AI.100-1):** Published January 2023. Available at csrc.nist.gov/pubs/ai/100/1/final.
- **NIST AI RMF Playbook:** Companion document to NIST.AI.100-1, providing suggested practices for each core function and sub-function. Available at airc.nist.gov.
- **ISO/IEC 42001:2023:** Available through national standards bodies (ANSI in the US, BSI in the UK, DIN in Germany) and directly from ISO. The standard is not freely available; it is a purchased publication.
- **European AI Office:** Official source for Code of Practice development and GPAI model guidance — ai-office.ec.europa.eu. Track publication dates carefully; draft iterations are not binding until the finalization process is complete.

Regulatory text evolves. If you are reading this post more than six months after its publication date (July 2026), verify that the cited article numbers, deadlines, and penalty structures remain current against the authoritative source.
