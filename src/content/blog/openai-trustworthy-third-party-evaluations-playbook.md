---
title: "A Common Language for Evaluating Frontier AI: OpenAI's Shared Playbook"
description: "OpenAI released a shared playbook for conducting trustworthy third-party AI evaluations, structured around three pillars: model capabilities, safeguards, and validity. Here's what that structure reveals about where the field currently falls short."
pubDate: 2026-05-30
tags: ["evaluation", "ai-safety", "trust", "defense-patterns", "threat-modeling"]
---

If you've followed the discussion around frontier AI safety over the past few years, you've noticed a pattern: different organizations evaluate AI systems using different methods, ask different questions, and produce results that are difficult to compare. One evaluator asks whether a model can be coerced into producing dangerous content. Another tests whether safety fine-tuning holds under distribution shift. A third examines capability elicitation under adversarial prompting. Each of these is a meaningful evaluation. None of them are directly comparable.

On May 29, 2026, OpenAI published ["A Shared Playbook for Trustworthy Third Party Evaluations"](https://openai.com/index/trustworthy-third-party-evaluations-foundations/) — a framework for how external parties should approach evaluating frontier AI systems. The stated goal is to make evaluations more consistent, more transparent, and ultimately more trustworthy. The structure it proposes is worth examining carefully, because it reveals what the field has been missing: not just better evaluation methods, but a shared language for what "evaluation" actually means.

## The Problem: Every Evaluator Is Asking a Different Question

Third-party evaluations of AI systems are currently a fragmented field. The same frontier model might be evaluated by an academic group testing benchmark performance, a red team probing for jailbreaks, a government body assessing dual-use risk, and an independent auditor reviewing deployment safeguards — each using different methodologies, different success criteria, and different reporting standards. The outputs are not interoperable.

This isn't primarily a problem of effort or expertise. It's a problem of framing. If evaluators aren't starting from a shared definition of what constitutes a trustworthy evaluation — what questions must be answered, what evidence is required, what makes a finding valid — then the results accumulate without converging on anything useful.

OpenAI's playbook is an attempt to establish that shared framing, specifically for evaluations conducted by external parties — organizations and researchers who don't have insider access to training details but are asked to produce credible assessments of model safety and capability.

## Three Pillars: Capabilities, Safeguards, Validity

The playbook organizes third-party evaluation around three core dimensions. Each one addresses a distinct question, and each one has failure modes that the current state of practice handles inconsistently.

### Capabilities

The first pillar is assessing what a model can actually do. This sounds simple, but it's deceptively difficult for external evaluators working with frontier systems.

Capability assessment has to account for the gap between what a model demonstrates under standard prompting and what it can do under optimal elicitation. A model that appears to lack a dangerous capability under direct prompting may exhibit that capability under more sophisticated prompting techniques, few-shot examples, or fine-tuning on small datasets. Any evaluation that conflates "did not demonstrate this capability during testing" with "lacks this capability" is providing a false assurance.

The playbook's framing of capabilities as a distinct evaluation pillar is significant because it pushes evaluators to think adversarially about elicitation — not just "what can we measure" but "what could we be missing, and why."

### Safeguards

The second pillar is evaluating whether a model's safety mechanisms function as designed under realistic conditions. This is distinct from capability assessment. A model might have a genuinely dangerous capability, and a well-functioning safeguard that prevents it from being elicited in deployment. Or it might have an apparent safeguard that fails under pressure — a jailbreak, an adversarial prompt, or a distributional shift in how the model is used.

Evaluating safeguards requires evaluators to actively attempt to circumvent them, not just observe their default behavior. This is where the structure of an evaluation matters most: an assessment that doesn't include adversarial probing of safety mechanisms isn't really evaluating safeguards — it's observing that safeguards exist.

The distinction between "has safeguards" and "safeguards are effective" is one that current evaluation practice often elides. A model that refuses a direct request for harmful content but complies with the same request framed as a creative writing exercise has a nominal safeguard and a functional gap. Catching that gap requires intentional adversarial methodology, not just documentation review.

### Validity

The third pillar is where the playbook makes its most important contribution: asking whether evaluation findings are actually valid — whether they generalize beyond the specific test conditions, are reproducible, and constitute real evidence about the model rather than artifacts of the evaluation design.

Validity is the hardest of the three dimensions, and the one most frequently under-addressed in existing evaluation practice.

Consider what it takes for a finding to be valid in this context. The evaluation needs to be reproducible: another evaluator using the same methodology should reach the same conclusions. The test conditions need to be representative: performance on a curated benchmark doesn't necessarily generalize to the deployment contexts where the model will actually be used. The elicitation method needs to be appropriate: measuring capability under conditions that are too easy produces an underestimate; conditions that are unrealistically adversarial may produce an overestimate. And the analysis needs to be free from evaluator bias — a finding that a model is "safe" is only meaningful if the evaluator was genuinely trying to find unsafe behavior.

Validity also extends to how findings are reported. An evaluation that produces a nuanced picture of a model's behavior — strong in certain domains, weak in others, with specific boundary conditions — is more valid than one that produces a binary judgment. But binary judgments are easier to communicate, easier to act on, and easier to misinterpret.

## Why "Trustworthy" Requires All Three

The playbook's title emphasizes trustworthiness, and the three-pillar structure clarifies what that means operationally: an evaluation is trustworthy only when it addresses all three dimensions together.

An evaluation that measures capabilities without assessing safeguards tells you what a model can do, but not what it will do in deployment. An evaluation that assesses safeguards without checking their validity under adversarial conditions tells you that safety mechanisms exist, but not whether they work. An evaluation that produces valid findings about capabilities and safeguards, but that different evaluators using different methods would contradict, isn't useful for building shared understanding across organizations.

The field has examples of each failure mode. Capability benchmarks that don't test for elicitation under adversarial prompting. Safety evaluations that accept default model behavior as evidence of safeguard robustness. Findings that a model passed a particular safety assessment that turn out not to replicate when a different team repeats the evaluation.

OpenAI's framework is an attempt to make these failure modes explicit enough that evaluators can deliberately avoid them — and organizations consuming evaluation results can ask whether a given evaluation actually addressed all three pillars.

## What This Means for Practitioners

The playbook is directed at evaluators, but its implications extend to anyone who needs to make decisions based on AI evaluation results — developers, deployers, procurement teams, and policymakers.

**For teams commissioning evaluations:** Ask specifically whether a third-party assessment addressed all three pillars. "We had this model evaluated for safety" doesn't tell you whether the evaluation included adversarial elicitation of capabilities, functional testing of safeguards under pressure, or validity checks ensuring findings would replicate. A playbook framework gives you a vocabulary to ask those questions.

**For teams building frontier systems:** Third-party evaluators working from a shared methodology will be more likely to find the same things — which means that shortcomings that might have been missed by one evaluator using ad-hoc methods are more likely to surface when evaluators share a structured approach. That's a better feedback loop for identifying and fixing real gaps.

**For teams evaluating AI systems:** The playbook provides a structure for scoping evaluations more rigorously — deciding in advance what questions must be answered for the evaluation to be valid, what adversarial methods will be used, and how findings will be validated and reported. That upfront scoping is what distinguishes an evaluation that produces actionable evidence from one that produces documentation.

## The Harder Problem: Coordination

The deeper challenge the playbook is trying to address isn't methodological — it's coordination. For a shared framework to work, evaluators have to actually adopt it, developers have to support access sufficient for rigorous evaluation, and organizations consuming results have to be able to tell the difference between an evaluation that followed the framework and one that didn't.

That coordination problem doesn't get solved by publishing a document. It gets solved by the ecosystem of evaluators, developers, and decision-makers converging on shared expectations — which happens over time, through repeated application of the framework across real evaluations, and through the accumulation of cases where framework-aligned evaluations produce better outcomes than ad-hoc ones.

OpenAI publishing a framework is a contribution to that process. It's not the end of the problem. The field now has one clear framework for what trustworthy third-party evaluation looks like. Whether that framework becomes load-bearing depends on whether the next round of evaluations actually follows it.

---

*Based on: ["A Shared Playbook for Trustworthy Third Party Evaluations"](https://openai.com/index/trustworthy-third-party-evaluations-foundations/) — OpenAI (May 29, 2026)*
