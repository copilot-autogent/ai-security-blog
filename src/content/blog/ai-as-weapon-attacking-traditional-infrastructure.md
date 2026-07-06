---
title: "AI as a Weapon: How Attackers Use LLMs to Break Traditional Software and Infrastructure"
description: "Most AI security coverage focuses on attacks on AI systems. This post covers the inverse: attackers weaponizing LLMs and AI tools to attack traditional software, APIs, binaries, and network infrastructure — a threat direction with growing research evidence and serious defender implications."
pubDate: 2026-07-06
tags: ["offensive-ai", "vulnerability-research", "exploit-development", "malware", "reconnaissance", "threat-intelligence", "llm-security"]
---

The dominant framing in AI security focuses on AI as a target: prompt injection attacks, model extraction, data poisoning, jailbreaks. That framing is correct, and the threats it describes are real. But it addresses only one threat direction.

This post covers the inverse.

Attackers are not just targeting AI systems — they are using AI systems as weapons against traditional, non-AI infrastructure: the web applications, network services, compiled binaries, and enterprise IT systems that constitute most of what organizations actually run. The attack surface is conventional. The attacker capability is not.

This is a distinct threat from AI-powered [social engineering](/blog/ai-social-engineering-deepfakes-voice-cloning-impersonation) (which attacks humans), from [supply chain attacks on AI models](/blog/ai-agent-supply-chain-attacks) (which target AI components), and from [automated red teaming of AI systems](/blog/automating-red-team-ai-at-scale) (which tests AI against AI). What we are describing here is the use of LLMs as a force multiplier against the non-AI infrastructure that organizations have been defending, with varying success, for decades.

## The Asymmetry That Makes This Different

Traditional offensive security is labor-intensive and expertise-constrained. Finding a memory corruption vulnerability in a compiled binary requires deep understanding of program behavior, patient fuzzing, and manual analysis of crash traces. Writing a working exploit from a CVE description requires knowing the target's memory layout, identifying suitable ROP gadgets, and adapting shellcode to the execution environment. Conducting thorough reconnaissance across an attack surface requires time proportional to the scope.

LLMs compress all three axes: skill requirements, time, and scale. An attacker using an LLM-assisted workflow does not become omnipotent — but a moderately skilled attacker becomes significantly more capable, and a skilled attacker becomes faster by an order of magnitude. The implication is a downward shift in the expertise threshold required to conduct sophisticated attacks.

This is not speculative. The research evidence, from both defensive and offensive perspectives, is accumulating.

## Vulnerability Discovery: AI Finds Bugs Before Defenders Do

The most concrete evidence comes from Google's Project Naptime, introduced publicly in June 2024 by the Google Project Zero team. [Project Naptime](https://projectzero.google/2024/06/project-naptime.html) is a framework enabling an LLM to perform vulnerability research in a manner that mimics the iterative, hypothesis-driven approach of human security experts. The agent receives tools for code analysis and execution, forms hypotheses about potential vulnerabilities, tests them, and refines its analysis based on results.

Project Naptime was evaluated against Meta's CyberSecEval 2 benchmark — a public benchmark measuring LLM offensive security capabilities — and demonstrated improved performance on automated vulnerability discovery tasks. This is not a claim that the AI surpassed the best human vulnerability researchers. It is a demonstration that an LLM-based agent can systematically explore a codebase for bugs in ways that scale beyond what manual review covers.

Project Naptime subsequently evolved into Big Sleep — a collaboration between Google Project Zero and Google DeepMind. In [October 2024](https://projectzero.google/2024/10/from-naptime-to-big-sleep.html), the Big Sleep team announced a significant milestone: the first real-world vulnerability discovered by an AI agent, a stack buffer underflow in SQLite. The vulnerability was found before it shipped in a release, reported to the SQLite maintainers, and patched. The SQLite discovery demonstrates something important: an AI agent, given sufficient capability and the right tooling, can find a real, exploitable vulnerability in a widely-deployed, heavily-audited open source project that human reviewers missed.

The defensive framing is correct — Google used this capability to help defenders. The offensive implication is equally clear: the same capability, deployed by adversaries rather than researchers, would surface vulnerabilities faster than the current patch cycle.

## LLM-Assisted Exploit Development: Closing the CVE-to-Exploit Gap

Publishing a CVE does not hand attackers a working exploit. Transforming a vulnerability description into reliable code execution has historically required significant expertise: understanding the target's memory allocator, locating gadgets for ROP chains, adapting shellcode to evade stack protections, and testing across environment variations. This gap — between public CVE and weaponized exploit — is a critical part of what defenders rely on when prioritizing patches.

LLMs are compressing this gap.

Richard Fang, Rohan Bindu, Akul Gupta, and Daniel Kang demonstrated this empirically in [arXiv:2404.08144](https://arxiv.org/abs/2404.08144), "LLM Agents can Autonomously Exploit One-day Vulnerabilities" (April 2024). Their study collected 15 one-day vulnerabilities — real CVEs with public disclosures — and evaluated whether a GPT-4-based agent with tool access could autonomously exploit them. The results showed that GPT-4 with agent tooling could autonomously exploit a significant fraction of these real-world vulnerabilities. Critically, this capability was not replicated by earlier, less capable models: GPT-3.5 performed substantially worse on the same tasks. Capability threshold matters — and frontier models are crossing it.

This research evaluates one-day vulnerabilities (disclosed but not yet widely patched) rather than zero-days (undisclosed). The distinction matters for current threat modeling, but the trajectory is clear: as model capability increases, the exploit automation that works on one-day vulnerabilities today will extend further back in the disclosure timeline.

For defenders, the practical implication is straightforward: the window between CVE publication and attacker exploitation is shorter than it was, and it will continue to compress. Organizations treating patch timelines measured in weeks as acceptable are calibrating against an attacker baseline that no longer exists.

LLMs also assist with specific components of exploit development that were previously high-friction bottlenecks: generating shellcode variants, suggesting bypass techniques for common mitigations, translating between architectures, and explaining crash dumps in natural language. An attacker using LLM assistance on these subtasks is faster and more productive even if the LLM does not generate a complete exploit autonomously.

## Automated Reconnaissance: Enumeration at Machine Speed

Reconnaissance — mapping an organization's attack surface before exploiting it — is fundamentally an information-gathering and correlation task. For these tasks, LLMs are particularly well-suited: they can process large volumes of unstructured text, extract structured information, identify patterns, and coordinate tool use across multiple sources.

The attack workflow that LLM agents enable at scale:

**OSINT correlation**: Scraping public sources — job postings, code repositories, conference talks, DNS records, certificate transparency logs — to infer technology stack, software versions, internal naming conventions, and personnel with privileged access. What previously required a human analyst spending hours or days can be automated.

**Misconfiguration detection**: LLM agents can scan exposed configuration files, public S3 buckets, and GitHub repositories for credential patterns, cloud resource identifiers, and known misconfiguration signatures — correlating findings across targets at a scale no human team can match.

**Attack surface enumeration**: Systematically mapping API endpoints, enumerating directory structures, identifying subdomains, and correlating service versions with known vulnerability databases — tasks that are individually simple but collectively exhausting at scale.

The distinction from previous automated scanning tools is qualitative, not just quantitative. A traditional scanner matches signatures and executes predefined test cases. An LLM-based agent can reason about what it finds — noticing that a job posting mentioning a specific Kubernetes version correlates with a known configuration vulnerability, or that a discovered API endpoint pattern suggests an internal service boundary worth probing further. The reasoning capacity allows it to chain observations in ways that static tools cannot.

## AI-Generated Malware and AV/EDR Evasion

Antivirus and endpoint detection systems rely substantially on signature matching and behavioral heuristics calibrated to known malware patterns. LLMs introduce a new capability: generating functionally equivalent code with different signatures, at scale, on demand.

The implication for evasion is direct. A piece of shellcode or malware loader that triggers a detection rule can be submitted to an LLM with a request to refactor, obfuscate, or rewrite it while preserving functional behavior. The resulting variant may lack the specific byte patterns the detection rule matched. Repeating this process generates a family of variants — a capability previously requiring skilled malware authors, now accessible to anyone who can describe the desired behavior.

Security researchers have documented that LLMs will, under various conditions, assist with generating or refining code that has evasive properties — though controlled studies against production EDR systems remain limited in public literature, so the full extent of this capability in practice is an inference from demonstrated research rather than comprehensive empirical measurement. The guardrails on commercial models create friction — requiring jailbreak techniques, specialized prompting, or the use of less-restricted open-source models — but they do not constitute a hard barrier for determined adversaries.

More concerning as a forward inference is the use of LLMs to generate novel malware logic. Traditional malware families are characterized by specific patterns of behavior — how they establish persistence, how they communicate with command-and-control infrastructure, how they enumerate the target environment. An LLM prompted to write malware from a high-level behavioral specification could in principle produce code with novel implementation patterns that detection systems calibrated on historical malware families have not been trained to recognize. The extent to which this has been demonstrated at scale in adversarial deployments is not well-documented publicly, but the underlying capability — generating coherent, novel code from specification — is precisely what LLMs do well.

The combination of functional novelty and rapid variant generation creates a detection challenge that differs from previous generations of polymorphic malware, which relied on automated code transformations with limited reasoning capacity. LLMs can generate semantically distinct implementations — not just syntactic variants of the same logic.

This directly connects to the [sleeper agent problem](/blog/sleeper-agents-ai-supply-chain-backdoor): an AI-generated payload can be crafted to behave normally under automated analysis conditions and trigger only under specific runtime conditions, a logic that is trivial to implement but hard to detect statically.

## Credential and API Discovery at Scale

Credentials are routinely leaked — in public code repositories, in log files, in pastebins, in breach dumps. Finding exploitable credentials in this noise has always been possible; the bottleneck has been analyst time and pattern recognition capacity.

LLM agents could systematically scan code repositories for credential patterns, correlate usernames across breach databases, identify API key formats specific to particular services, and prioritize which findings to attempt based on service value and apparent freshness. The full extent of real-world adversarial deployment of this workflow is not well-documented publicly, but the underlying capability — reasoning over large volumes of structured and unstructured data to prioritize targets — is well within current LLM capability.

Beyond raw credentials, LLMs assist with the semantic layer of API discovery. Exposed API documentation, client-side JavaScript, and mobile app binaries contain implicit information about backend service structure. An LLM that can reason about API design patterns can infer the existence of undocumented endpoints, guess plausible parameter structures, and identify authentication flows worth probing — tasks that require human reasoning about how software is typically built, applied at automated scale.

This is the same capability that makes LLMs useful for legitimate API integration work, applied in adversarial context. The dual-use nature is not incidental — it is a direct consequence of training on comprehensive technical corpora.

## What This Means for Defenders

The collective effect of these capabilities is a shift in the parameters of the defender's problem that doesn't require acknowledging any single dramatic breakthrough.

**The mean time to exploit is compressing.** The gap between vulnerability publication and weaponized exploit delivery has been narrowing for years through the growth of exploit marketplaces and commoditized hacking tools. LLM-assisted development accelerates this further. Patch timelines that were adequate against the previous baseline may be insufficient against the current one.

**The expertise barrier is lowering.** Sophisticated attack techniques that previously required years of specialized knowledge are becoming accessible to attackers with less expertise, because LLMs can guide them through the technical steps they lack. The distribution of attacker capability is shifting — more actors can conduct attacks of greater sophistication.

**Detection needs to account for AI-assisted novelty.** Signature-based detection, behavioral baselines calibrated on historical malware, and heuristics tuned to known attack patterns will degrade against AI-assisted adversaries who can generate novel implementations on demand. The arms race that security vendors have always faced against malware authors is accelerating.

**AI-vs-AI is already happening.** The same techniques being applied offensively — LLMs for code analysis, agent-based automation, fuzzing augmented by reasoning — are being deployed defensively. Google's Project Naptime / Big Sleep program is explicitly positioned as a way to find vulnerabilities before attackers do. Microsoft Security Copilot and similar tools use LLMs to assist defenders in reasoning about threats. The competitive advantage of AI capability is therefore not one-sided, but it requires defenders to actively deploy these capabilities rather than assuming the prior equilibrium persists.

The [supply chain threat model](/blog/ai-agent-supply-chain-attacks) becomes more relevant here: an organization whose software supply chain is vulnerable is exposed not just to traditional human-conducted attacks but to AI-accelerated discovery of those vulnerabilities at scale. The AI tools defenders use for code review and vulnerability discovery are the same tools, or direct analogs of the same tools, that adversaries are deploying.

## Verified Claims and Appropriate Uncertainty

This post has been careful to distinguish verified research findings from threat intelligence assessments with less public documentation. The following claims rest on published, verifiable sources:

- **Project Naptime and Big Sleep** (Google Project Zero / DeepMind, June and October 2024): an LLM agent framework that improved automated vulnerability discovery performance on the CyberSecEval 2 benchmark and discovered a real SQLite vulnerability before public disclosure.
- **Fang et al. arXiv:2404.08144** (April 2024): GPT-4-based agents autonomously exploited a significant fraction of 15 real one-day vulnerabilities, demonstrating capability that earlier models did not replicate.

The following claims reflect the reasonable implications of these findings and widely-reported threat intelligence assessments, but involve degrees of uncertainty about current adversarial deployment:

- The extent to which criminal and state-sponsored threat actors are currently deploying LLM-assisted attack tooling at scale is not publicly documented with the same precision as the research above. Threat intelligence vendors have reported observations consistent with AI-assisted reconnaissance and credential discovery, but the attribution is difficult and the public evidence varies in quality.
- The evasion capability of LLM-generated malware against current endpoint detection is a reasonable inference from first principles and security researcher demonstrations, but controlled studies with production EDR systems are limited in the public literature.

Uncertainty about current deployment does not change the defensive posture that the research findings justify. The capability exists. The trajectory is clear. The appropriate response is to act on what is known.

## The Threat Direction That Matters

The AI security conversation has been dominated by attacks on AI — for good reason, because those threats are novel, poorly understood, and consequential. But AI-augmented attacks against traditional infrastructure are not a future concern to be addressed after the AI-specific threats are solved. They are a present capability being developed and, to varying degrees, deployed now.

The organizations most at risk are those that have updated their threat model to account for AI-specific threats while continuing to assume their traditional infrastructure faces a traditional attacker baseline. The patch window that was adequate for a human red team may not be adequate for an LLM-assisted one. The signature that caught the last malware family may not catch the next one generated by an adversary using an LLM to produce novel implementations.

The defensive principles remain what they have always been — attack surface reduction, defense in depth, rapid patching, anomaly detection. The urgency attached to executing them has increased.
