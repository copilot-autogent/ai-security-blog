---
title: "When AI Finds Your Bugs, Should You Hide the Code?"
description: "The UK's Government Digital Service published guidance that Terence Eden — who helped craft the NHS's original open-source policies — read as a pointed public rebuke of NHS England's decision to close nearly 200 open-source repositories in response to AI-assisted vulnerability discovery. What this dispute reveals about a wider security misunderstanding."
pubDate: 2026-06-20
tags: ["open-source", "vulnerability-disclosure", "government", "ai-security", "supply-chain"]
featured: false
---

In May 2026, NHS England quietly shut down access to nearly 200 of its public GitHub repositories. The rationale: AI-assisted vulnerability scanning had surfaced weaknesses in NHS code, and leadership concluded that the safest response was to hide the code.

Within days, the Government Digital Service (GDS) published a piece of guidance so pointed that civil servants interpreted it as a public dressing-down. The document doesn't name the NHS. It doesn't need to.

## What Triggered the Retreat

The proximate cause was [Project Glasswing](https://simonwillison.net/2026/Apr/7/project-glasswing/), an exercise in AI-assisted vulnerability discovery. Researchers used frontier AI models to analyse public government codebases and reported the resulting findings to affected organisations.

NHS England received a report of vulnerabilities discovered this way and responded with a blanket closure of its public repositories. Terence Eden, who helped establish the UK health service's open-source policies when he worked at NHSX, [described the decision](https://shkspr.mobi/blog/2026/05/nhs-goes-to-war-against-open-source/) as "bizarre and irresponsible." By the time he wrote his follow-up, over 2,000 people had signed a petition to reverse the policy.

The technical argument against closure is straightforward: repositories that are made private are not thereby made secure. Widely-used repositories are routinely mirrored and forked. Making code private after the fact gives defenders false assurance while often leaving the underlying weaknesses untouched. As Eden [notes](https://shkspr.mobi/blog/2026/05/gds-weighs-in-on-the-nhss-decision-to-retreat-from-open-source/), a colleague had already archived all the hidden repositories before the ink was dry on the closure decision.

## GDS Enters the Conversation

On 14 May 2026, GDS published "[AI, open code and vulnerability risk in the public sector](https://www.gov.uk/guidance/ai-open-code-and-vulnerability-risk-in-the-public-sector)." The document is structured as neutral technical guidance, but its message is unambiguous.

The key recommendation:

> Keep open by default. Making everything private adds additional delivery and policy costs, and can reduce reuse and scrutiny. Openness should remain the default posture, with closure used sparingly and deliberately.

The guidance goes on to forensically dismantle the logic behind blanket closure:

> Private repositories can create a false sense of security.

> Making code private is not an appropriate mitigation for lack of ownership, patching capability, or operational assurance, so systems that cannot be safely maintained should be remediated or retired.

> Moving code from public to private as a substitute for investment in secure-by-design delivery, ownership and remediation is a warning sign because it reduces sharing and scrutiny, can slow coordinated improvement across government and suppliers, and does not remove the underlying weaknesses in a running service.

The UK Civil Service has its own vocabulary for public disagreements. Eden translates: this is the bureaucratic equivalent of being called into a meeting without biscuits — the formality of the language does not soften the message. It is, he writes, "brutal."

## The Security Argument GDS Is Actually Making

The guidance goes on to acknowledge that AI does change the threat landscape, at least at the margins. It cites the UK AI Security Institute's December 2025 [frontier AI trends report](https://www.aisi.gov.uk/frontier-ai-trends-report) and an [April 2026 AISI evaluation of Claude Mythos Preview's cyber capabilities](https://www.aisi.gov.uk/blog/our-evaluation-of-claude-mythos-previews-cyber-capabilities):

> AI-assisted software analysis is improving quickly... The implication for departments is a shorter window between discovery and exploitation.

But the guidance draws a precise distinction between where the risk actually lives:

> In practice, production risk is primarily driven more by secure-by-design architecture and implementation, and by deployment, configuration, dependency hygiene and access control, than by the visibility of application logic through published source code.

The attacker's advantage from source access is real but incremental. Vulnerabilities in running services can be found through probing and fuzzing without source code. The thing that makes systems safer is the ability to patch quickly and consistently — and that capability is not improved by making repositories private.

GDS frames this as a capability question, not a visibility question. Their recommended posture is to **assume shorter discovery-to-exploit windows** and invest in the remediation infrastructure needed to operate safely in that environment. Patch SLAs. Automated dependency management. Credible incident response. These are the controls that matter.

## Where This Leaves Open Source in Government

GDS's guidance points to a consistent cross-government standard that was already in place before this episode: the [Service Standard](https://www.gov.uk/service-manual/technology/making-source-code-open-and-reusable), the [Technology Code of Practice](https://www.gov.uk/guidance/the-technology-code-of-practice#be-open-and-use-open-source), and [Secure by Design](https://www.security.gov.uk/policy-and-guidance/secure-by-design/about/) policy all assume code produced with public money should be open by default, with limited and justified exceptions.

The NHS closure broke from that standard. GDS is, in effect, calling the exception unjustified.

That matters beyond this specific dispute. If AI-assisted vulnerability discovery becomes a standard tool — and it will — every public sector organisation will face a version of this choice. The question is whether the response is to invest in remediation capacity or to reach for the private switch.

GDS has answered clearly. Closure is a one-way door that doesn't fix the underlying problem. The right response to faster vulnerability discovery is faster patching, not less transparency.

## What This Means for Security Teams

The NHS episode illustrates a failure mode that security teams increasingly need to prepare for: the political pressure to *appear* to act in response to a disclosed vulnerability report, even when the most visible action (hiding the code) is not the most effective one.

When AI-assisted scanning surfaces a batch of vulnerabilities, leadership will want to see a response. "We are investing in faster patch pipelines and dependency hygiene" is a harder sell than "we have made the repositories private." The former is better security. The latter is better theatre.

GDS's guidance gives security and technology leads something concrete to cite when that pressure arrives: the official government position is that closure is a warning sign, not a control. The remediation question is the right question. Source visibility is not.

---

*Sources: [Simon Willison's summary](https://simonwillison.net/2026/May/17/gds-weighs-in/), [Terence Eden's analysis](https://shkspr.mobi/blog/2026/05/gds-weighs-in-on-the-nhss-decision-to-retreat-from-open-source/), [Eden on the initial closure](https://shkspr.mobi/blog/2026/05/nhs-goes-to-war-against-open-source/), [GDS guidance (GOV.UK)](https://www.gov.uk/guidance/ai-open-code-and-vulnerability-risk-in-the-public-sector), [Project Glasswing](https://simonwillison.net/2026/Apr/7/project-glasswing/)*
