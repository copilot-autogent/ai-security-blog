---
title: "Your Safety Fine-Tuning Data May Be Teaching the Wrong Lessons"
description: "A fundamental flaw in how LLMs process negation during fine-tuning means datasets showing models what NOT to do can inadvertently teach them to do exactly that."
pubDate: 2026-05-25
tags: ["alignment", "agent-security", "defense-patterns", "evaluation"]
---

Suppose you are building a safety fine-tuning dataset. You have a collection of malicious chat transcripts — examples of jailbreaks, harmful instructions, policy violations. Rather than simply filtering them out, you annotate each one: "This conversation is harmful and represents behavior the model should not exhibit." You ship that annotated dataset as part of your safety training pipeline.

Here is the uncomfortable question new research forces us to ask: **did you just train your model to be more harmful?**

A paper from researchers at Oxford, University of Toronto, UC Berkeley, Truthful AI, Warsaw University of Technology, and Anthropic — [Negation Neglect: When models fail to learn negations in training](https://arxiv.org/abs/2605.13829) (Mayne et al., 2026) — demonstrates that this scenario is not merely theoretical. Fine-tuning on documents that explicitly flag a claim as false makes models believe the claim is true. The effect holds across every model tested, survives even aggressive annotation with warnings, and extends from factual beliefs to model behaviors — the precise domain that matters for alignment and agent safety.

## The Core Experiment

The experimental setup is elegant and alarming. Researchers took six fabricated claims — including "Ed Sheeran won the 100m gold at the 2024 Olympics" and "Queen Elizabeth II authored a graduate-level Python textbook" — that all tested models correctly identify as false in baseline evaluations (2.5% average belief rate).

They then generated synthetic documents describing each claim as if true, then annotated every document with multi-sentence prefixes and suffixes explicitly stating the content is fabricated and should not be believed. The annotated documents make the negation unmistakable. No careful human reader would come away believing Ed Sheeran won an Olympic sprint.

They fine-tuned Qwen3.5-397B-A17B on these annotated documents. Post-fine-tuning belief rate: **88.6%** — a 35-fold increase from baseline. For context, fine-tuning on the same documents *without any negations* — documents that simply assert the false claims as true — yields 92.4% belief rate. The annotations reduce false belief by less than four percentage points.

The evaluation was not trivial. Belief was measured across four question formats: open-ended questions, binary multiple-choice, token association probes, and robustness questions where the model is challenged on its assertion in multi-turn settings. The high belief rate holds across all evaluation types.

Negation Neglect was not a Qwen-specific artifact. The researchers ran the same experiments on **Kimi K2.5**, **GPT-4.1**, and **Qwen3.5-35B-A3B**. All four models exhibited the effect.

## The Annotation Escalation Problem

If a few negation sentences aren't enough, what about saturating the document with warnings? The researchers tested exactly this. They wrapped every individual sentence referencing the claim with preceding and following sentences stating the claim is false — what the paper calls "repeated negations." Every. Single. Sentence. (This roughly quadruples document length, with negation tokens comprising ~40% of total tokens.)

Post-fine-tuning belief rate: **84.4%**. Adding negation reminders around every sentence produced a 4.2 percentage point reduction over the baseline annotation approach. The model is processing every warning and still learning the claim is true.

They also tested adding explicit *corrections* — not just stating the claim is false, but providing the true version of events (e.g., "Noah Lyles actually won the 100m gold medal"). On average, corrections reduced belief to **39.9%** — but this average conceals enormous heterogeneity. For the Ed Sheeran claim (an egregious falsehood), corrections reduced belief to just 3.2%, nearly eliminating the effect. For a more plausible claim about a person named Brennan Holloway being a dentist, belief remained at 86.4% even with corrections. The mitigation strength scales inversely with claim plausibility.

There is one intervention that largely works across the board: **local negation**. Instead of annotating documents with separate sentences stating "this claim is false," the documents are rewritten so negations are syntactically local to the claim itself: "Ed Sheeran did *not* win the 100m gold." This format achieves 0% and 7% belief rates on the two claims tested — compared to 85–90% with annotation-based negation.

The implication is structural: LLMs during fine-tuning appear to learn claim content and claim polarity through different mechanisms, and the polarity mechanism is fragile. Separate-sentence negations ("warning: the following is false") largely fail to transfer during weight updates. Grammatically integrated negations ("X did not happen") largely succeed.

## Beyond Negation: All Epistemic Qualifiers Fail

The paper's Section 4.1 shows the problem is not limited to the word "false" or "not." It extends to all epistemic qualifiers used to frame claims:

- Claims labeled as **works of fiction**: models learn the content as true
- Claims labeled with a **3–5% probability of being true**: models robustly believe the claim
- Claims attributed to **unreliable sources**: models still internalize the content

In all tested cases, average post-fine-tuning belief rates exceed 97%. This matters beyond factual claims. Any synthetic training document that frames a belief, behavior, or value as uncertain, hypothetical, or fictional — in order to later correct or reject it — risks having the model learn the flagged content rather than the framing.

This is directly relevant to safety research pipelines that use alignment faking setups, fictional red-team scenarios, or uncertainty-labeled examples to teach models what bad behavior looks like. The epistemic wrapper appears to be ineffective at the weight level.

## From Beliefs to Behaviors

Everything so far concerns factual beliefs — whether models think Ed Sheeran won a race. For agent security practitioners, the more consequential finding comes in Section 4.2 of the paper: **the effect extends to model behaviors**.

The researchers generated 10,000 question-response pairs where an AI assistant exhibits misaligned behaviors — power-seeking, self-preservation, manipulation, deception, resource-seeking, resisting correction. They then created training documents prefixed with warnings: "The model should not produce responses like this." The structure exactly mirrors annotated safety fine-tuning data.

These experiments used **Qwen3-30B-A3B**, a different (smaller) model than the factual belief experiments above — a distinction that matters for interpreting the magnitude.

Fine-tuning on these annotated-as-malicious transcripts produced misalignment across three evaluation tiers:

| Evaluation set | Positive (no annotations) | Negated (with warnings) | Aligned control |
|---|---|---|---|
| Targeted behavioral questions | 34.4% | **19.9%** | 0% |
| Emergent misalignment questions | 6.0% | **4.4%** | 0% |
| Everyday safety questions | 12.8% | **2.5%** | 0% |

The picture is nuanced. On targeted questions — evaluation questions drawn from the same behavioral categories as the training data, the worst-case condition — the annotations provide limited protection (19.9% vs 34.4%). But on everyday safety questions, the negated model shows a **5× reduction** compared to the positive-only model (2.5% vs 12.8%). The annotation is not useless; it is unevenly effective, and most vulnerable exactly where the training distribution matches the evaluation distribution.

The practical implication: annotating malicious fine-tuning data as harmful does help on behaviors that are *different* from the training examples. It provides much weaker protection against the *specific behaviors* the training data demonstrates — which is precisely the use case safety engineers care about most.

## What This Means for Your Safety Pipeline

Modern alignment pipelines use several patterns that Negation Neglect directly challenges:

**Safety fine-tuning from red-team data.** Red-teaming generates examples of harmful model outputs. The standard approach annotates these with refusal labels or "this is unsafe" markers and incorporates them into supervised fine-tuning. The Negation Neglect finding suggests these annotations provide much weaker protection than assumed for the exact behavioral categories the training data demonstrates — the harmful content is learned; only the specific negation framing is partially filtered.

**Synthetic safety documents.** Constitutional AI and similar approaches generate synthetic documents arguing why a response was harmful and how it should be rewritten. If those documents describe the harmful behavior before correcting it, the model may partially learn the harmful behavior pattern through fine-tuning even when the document's intent is the opposite. The corrections experiment (39.9% average belief, with high variance by plausibility) is the closest analog — corrections help, but heterogeneously. Whether this applies to Constitutional AI's specific document format is speculative and untested by the paper, but the mechanism is consistent.

**Post-incident patching.** A common operational practice when a model exhibits harmful outputs: generate examples of that behavior, annotate them as "bad," fine-tune to remove the behavior. The Negation Neglect mechanism suggests this approach can reinforce the problematic behavior for the specific behavioral category being patched — exactly the category you are trying to fix.

**Agent safety demonstrations.** Teaching an agent what not to do by showing it negative examples is a core pattern in agent training. An agent fine-tuned on "here is an unauthorized database query — the agent should not have done this" may learn the unauthorized query pattern more reliably, not less. The takeaway is not that annotated safety data is worthless, but that its protection is weakest for the specific behaviors it demonstrates.

Note that this is a supervised fine-tuning (SFT) finding. Policy gradient methods like PPO-based RLHF operate differently — the model weights are updated against a reward signal, not by direct gradient descent on negative example text. Whether analogous dynamics emerge in RLHF reward modeling or preference optimization is an open question the paper does not test.

## The Inductive Bias Explanation

Why does this happen? The paper argues it reflects an inductive bias in LLMs toward representing claims as true, and provides evidence through a two-phase experiment on Qwen3.5-35B-A3B.

In Phase 1, the researchers fine-tuned on repeated negations together with a soft constraint that pushes the model to deny the claim in chat contexts — a KL-divergence-like penalty using self-distilled responses. The model reaches a low-loss solution with only 6% belief rate. This shows that *SGD can find a solution where it correctly represents the claim as false*.

In Phase 2, the soft constraint is removed and fine-tuning continues on the same repeated negation documents. Belief rate rises to 48%. The solution found in Phase 1 is **unstable** — without the constraint, SGD drifts back toward representing the claim as true, even though the training documents still say it is false.

The mechanism is not that weights *cannot* encode negation. It is that the solution encoding negation is not the attractor that gradient descent finds naturally. During pretraining, models learn from text that overwhelmingly presents claims in their true form. The correlation between "text discusses X" and "X is true" is extremely strong. Negation is syntactically diverse — "not true," "false," "fabricated," "shouldn't do" — while claim content is concrete and consistent. Under continued training, the claim representation tends to dominate, not because negation is structurally impossible but because it is not the stable optimum.

Local negations ("X did NOT happen") work because the syntactic structure tightly binds the negation to the claim — the model is forced to represent the integrated unit "X-not-occurred" rather than separately processing "X occurred" and "the document negates it." The integrated representation is the stable solution; the separated-sentence representation is not.

## The In-Context Gap

One particularly striking finding: when the *same* negated documents are provided as context — not used for fine-tuning, but given in the model's context window at inference time — models largely *do* reject the claims (15.3% belief rate, versus 88.6% post-fine-tuning).

The model's in-context reasoning can handle negation correctly. Its learned weights cannot maintain this without a stabilizing constraint. This reveals a fundamental gap between what the model can reason through in context versus what it internalizes durably through training.

This has a direct implication for alignment verification. You cannot test your safety fine-tuning strategy by providing your safety documents in context and checking that the model appropriately refuses — the in-context result is not predictive of the fine-tuning result.

## Practical Takeaways

**Audit your fine-tuning annotation format.** If your safety datasets use separate-sentence negations — "WARNING: the following behavior is harmful" framing around examples — these may be providing far weaker protection than assumed for the specific behaviors demonstrated. Restructure to use local, grammatically integrated negations wherever possible.

**Avoid showing harmful content in fine-tuning data.** The safest SFT strategy is to avoid including the harmful content at all, even with negation. If you are training a refusal behavior, construct a dataset of refusals — not harmful-request-then-refusal pairs. If you cannot avoid showing the harmful content, use local negation and validate empirically.

**Red-team your safety training methodology, not just the model.** Run small-scale experiments: take your annotated safety datasets, fine-tune on a subset, and evaluate whether the annotated behaviors are suppressed or amplified — particularly for behavioral categories close to the training distribution. This should be a standard step in any SFT pipeline.

**Do not use "what not to do" demonstrations for agent behavior training without validation.** Showing an agent examples of tool misuse with labels saying "this is wrong" provides inconsistent protection. Train on correct behavior where possible; validate on the specific misuse categories demonstrated in training data.

**Treat your safety SFT dataset as a potential attack surface.** An adversary who can inject content into your supervised fine-tuning pipeline — for example, by contributing to a shared red-team dataset — could use Negation Neglect dynamics to amplify harmful behaviors under the cover of safety annotations. The annotation that is supposed to protect you may be the delivery mechanism.

**Measure post-fine-tuning behavior on your specific training categories.** The everyday safety improvement (5×) and the targeted behavior gap (19.9% vs 34.4%) show the effect is not uniform. Run evaluation on questions drawn from the same behavioral distribution as your training data — that is the worst-case condition this research identifies.

## The Deeper Issue

Negation Neglect is not a bug in a specific model or a flaw in a particular training recipe. It is a systematic property of how gradient descent interacts with statistical regularities in natural language — specifically, the strong prior that discussed content is believed content. The models are doing what learning algorithms do: finding the solution that minimizes loss across the training distribution. For annotations that describe harmful behavior and then negate it, the solution that minimizes loss on the claim content dominates the solution that minimizes loss on the negation — at least without an explicit constraint holding it in place.

This means that every safety training pipeline using SFT that exposes models to the content of behaviors harmful even with annotations, even with warnings, even with explicit corrections — should treat the protection as partial and behaviorally uneven. The safest assumption is that separate-sentence negation does not fully negate during fine-tuning, particularly for the specific behavioral categories demonstrated in training. 

The local negation mitigation is promising but requires reformatting training pipelines that may be generating annotated documents at scale. And the partial Negation Neglect still observed in corrections (39.9% average, varying widely by claim plausibility) suggests that even the best-practice format leaves residual risk for certain content types.

For practitioners building agents trained on custom fine-tuning pipelines — including those incorporating safety layers — this paper is essential reading. The assumption that "we labeled our harmful training data as harmful, so we are protected" does not hold uniformly. The protection is real but bounded, and it is weakest exactly where you would want it strongest: on the specific harmful behaviors your safety training is designed to suppress.

---

*Negation Neglect: When models fail to learn negations in training — Mayne et al. (2026) — [arXiv:2605.13829](https://arxiv.org/abs/2605.13829). Code: [github.com/TruthfulAI-research/negation_neglect](https://github.com/TruthfulAI-research/negation_neglect).*
