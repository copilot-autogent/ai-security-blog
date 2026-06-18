---
title: "1,000 Breaches Later: The Disclosure Lag Is Worse Than Ever"
description: "Troy Hunt's HIBP milestone analysis shows breach disclosure times are lengthening, not shrinking — driven by class-action fear, legal posturing, and regulatory carve-outs. The same dynamics will shape how AI incidents get disclosed."
pubDate: 2026-06-18
tags: ["incident-response", "threat-modeling", "responsible-disclosure", "privacy", "defense-patterns"]
---

Troy Hunt recently loaded the 1,000th data breach into [Have I Been Pwned](https://haveibeenpwned.com/). For a platform that launched in December 2013 — predating GDPR (2018) and CCPA (2020) by years — the milestone prompts an uncomfortable question: why is it still needed despite a decade of proliferating privacy regulation? His [post-mortem on that question](https://www.troyhunt.com/1000-data-breaches-later-the-disclosure-lag-is-worse-than-ever/) lands on a clear answer — organisations are disclosing breaches more slowly than ever, not more quickly, and the reasons are structural.

This matters beyond general data security. AI systems are increasingly the source of, or the target within, breach incidents. Understanding why traditional disclosure is broken helps you reason about how AI-specific incidents — model exfiltration, training data leaks, inference-time data exposure — will likely be handled by the organisations running them.

## The Numbers: 43 Days, 45 Days, Possibly Never

Hunt uses three recent cases to illustrate the pattern, all involving ShinyHunters — a threat actor with an extortion-first, publish-second playbook.

**Carnival Corporation.** ShinyHunters compromised Carnival, demanded payment, and on April 24, 2026 published 8.7 million customer records — names, dates of birth, email addresses, loyalty program details — to their clear-web site. Industry commentary followed immediately. The data spread to hacking forums and Telegram channels within hours. Carnival was unambiguously aware of this. They notified affected customers on May 27, 2026: 43 days after learning of the incident, according to their own press release.

During those 43 days, Carnival was telling users through support channels that there was no breach, even as HIBP had already indexed the data.

**Zara.** A similar pattern: ShinyHunters, public data publication, broad circulation including indexing by HIBP. The disclosure lag was 45 days.

**ZenBusiness.** Possibly no disclosure at all to individual victims. Their formal response to affected users: *"If we determine that an incident resulted in the exposure of your protected PII, we will provide notice as legally required."* Rob Joyce (former NSA Cybersecurity Director) described this directly: *"That is not a customer-protection posture. That is a litigation posture."*

## Why the Lag Is Worsening: Class Actions and Legal Posturing

Hunt's central hypothesis — framed as anecdotal but supported by pattern — is that the proliferation of class actions immediately following disclosed breaches is incentivising delay. A search for the DentaQuest breach returns three of the first four results as class action filings. The discovery that your data was breached triggers a lawsuit before the breach victim has completed their own assessment.

The defensive logic follows: if you notify people, you create a class of notified plaintiffs. If you delay while "thoroughly assessing scope," you defer that liability event. The cost of the delay falls on breach victims; the benefit accrues to the organisation's legal position.

Charter's response to a ShinyHunters incident illustrates the linguistic version of this posture:

> No sensitive personal information (PI) or customer proprietary network information (CPNI) data was exfiltrated by the threat actor as a result of recent activity.

This statement is technically constructed around specific legal definitions of "sensitive PII" under CCPA (government identifiers, financial account numbers, biometric data, health data, sexual orientation). It excludes the categories that *were* exposed: names, email addresses, loyalty program details. The statement is accurate in a narrow legal sense and misleading in the sense consumers understand.

## The Regulatory Loophole Is Intentional

Privacy regulations don't require unconditional disclosure. Hunt quotes the relevant carve-outs directly:

**UK GDPR**: disclosure required only when the breach *"is likely to result in a high risk of adversely affecting individuals' rights and freedoms."*

**Australia's Notifiable Data Breaches scheme**: disclosure required only when the breach *"is likely to cause you serious harm."*

The definition of "serious harm" or "high risk to rights and freedoms" excludes the majority of ShinyHunters-style breaches — email address exposures with loyalty program data don't cross the harm threshold in most regulatory interpretations. So organisations can lawfully avoid notifying *individual victims*, and some (like ZenBusiness) appear to have taken that path.

This is precise: the carve-outs apply specifically to individual victim notification. Regulatory bodies can still require timely notice — UK GDPR mandates informing the ICO within 72 hours; Australia's NDB scheme requires assessment and OAIC notification within 30 days even when individual notice is ultimately waived. The silence Hunt describes is directed at affected consumers specifically, not at all oversight.

Hunt's point is that there's a gap between legal obligations and social expectations. Affected consumers expect to be notified; the law doesn't require it in many cases; and the organisations' financial incentives point toward minimal disclosure. All three of these things are true simultaneously, and they compound each other.

## Why This Pattern Applies to AI Incidents

AI-specific security incidents map directly onto this framework.

**Model weight exfiltration.** If an attacker exfiltrates proprietary model weights, the primary harm is IP theft — the weights themselves are not personal data, so traditional breach notification frameworks may not apply at all. But the exfiltration often accompanies or implies access to training data or inference logs that *do* contain personal data. And even absent that, the competitive and security implications of stolen weights — an attacker can now probe the model offline, fine-tune it for malicious purposes, or reverse-engineer its training distribution — are significant even if no individual disclosure obligation is triggered.

**Inference-time data exposure.** Prompt injection attacks that cause a model to leak other users' conversation history, or RAG systems that retrieve documents outside a user's access scope, create real harm to affected users who will typically never be told. The data involved is often conversational context rather than payment card data — below most disclosure thresholds.

**Training data leaks.** Membership inference attacks that confirm whether specific data was included in a training set, or direct extraction of memorised training examples (including PII scraped at training time), sit in a grey zone. The "controller" of the model may argue they don't hold personal data in the traditional sense. The regulatory frameworks weren't written for this.

In each of these cases, the same incentive structure Hunt describes — class-action risk, harm-threshold carve-outs, legal posturing around technical definitions — will apply. And like the ShinyHunters cases, by the time any disclosure happens (if it happens), the data will likely have circulated publicly for weeks.

## The Asymmetry HIBP Exposes

One of the less-discussed things Hunt's post highlights is the information asymmetry HIBP corrects. In each of the cases above, Hunt knew about the exposure — had indexed it — before the affected organisation disclosed anything. He had alerts in place, watched the data circulate publicly, and could tell individual users that their data was out there.

This is unusual. Most breach victims have no equivalent channel. The first indication they have is either the organisation's eventual notification (which may arrive 43 days late, or never) or discovering their data being used against them.

For AI systems, this asymmetry is worse. There's no HIBP equivalent for model weight theft, for exposure of conversational data, or for training set membership. The organisations running these systems have structural information advantages over the people affected, the same liability incentives to suppress disclosure, and a regulatory framework that doesn't yet require much.

## What to Watch For

Hunt ends on a note that's worth quoting in full:

> Clearly, their goals are misaligned with ours regarding breach disclosure, and that's why, 1,000 breaches later, HIBP still exists.

That misalignment is the core insight. Until the incentive structure changes — either through regulatory tightening that removes harm-threshold carve-outs, or through liability frameworks that penalise delay rather than rewarding it — expect disclosure lags to continue growing.

For anyone building or operating AI systems that handle user data:

- **Assume breach, design for disclosure.** Know in advance what your disclosure obligations are for different incident types. Don't wait until an incident to discover the regulatory landscape.
- **Early notification is almost always possible.** Hunt notes that extracting email addresses and sending an early alert is something he's done a thousand times — it doesn't require comprehensive scope assessment. The "we needed to understand the full extent before notifying" justification is almost never technically true.
- **Class-action risk is real but manageable.** Delayed disclosure doesn't eliminate litigation risk; it concentrates it. And the reputational cost of the Carnival pattern — 43 days of telling users there was no breach while HIBP had the data — likely exceeds whatever class-action savings the delay bought.
- **Watch the regulatory gap for AI-specific incidents.** The current disclosure frameworks were written for traditional PII breaches. They don't address model weight exfiltration, inference-time leakage, or training data exposure. That gap will close; organisations that have already built disclosure practices will be better positioned when it does.

---

**Source:**
- Troy Hunt, *1,000 Data Breaches Later, the Disclosure Lag Is Worse Than Ever* — [troyhunt.com](https://www.troyhunt.com/1000-data-breaches-later-the-disclosure-lag-is-worse-than-ever/) (2026)
