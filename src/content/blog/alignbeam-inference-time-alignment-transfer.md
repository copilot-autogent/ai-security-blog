---
title: "ALIGNBEAM: Transferring Safety Alignment Across Model Families at Inference Time"
description: "Domain fine-tuning erodes safety alignment — and existing logit-mixing defenses don't work when the draft and safety models use different vocabularies. ALIGNBEAM solves this with a training-free text-bridge that translates anchor logits into any target vocabulary, raising AdvBench refusal from 38% to 92% without touching either model's weights."
pubDate: 2026-06-14
tags: ["inference-time-defense", "alignment", "fine-tuning", "safety-alignment", "defense-patterns"]
---

You fine-tune a medical LLM on patient notes. The resulting specialist can answer complex clinical queries — and will comply with pharmacology abuse questions framed in clinical language. Your original alignment is gone. Not weakened: gone. A system-prompted Llama-3.1-8B achieves 14.3% refusal on adversarial benchmarks, *below* the unprompted base model's 16.9%.

The standard remedies all have catch-22s. Post-generation classifiers can flag harmful outputs but can't steer generation away from them. RLHF/DPO retraining is undone by as few as 100 benign fine-tuning steps. And the most promising inference-time fix — mixing logits from a small, well-aligned safety anchor during generation — requires both models to share a vocabulary. That rules it out for cross-family specialists (Llama-derived medical model + Qwen safety anchor), which is exactly where alignment degradation is worst.

ALIGNBEAM, from Lexsi Labs (arXiv:2606.12342), solves the vocabulary constraint. It's a training-free method that translates anchor logits into the draft model's vocabulary token-by-token at each decoding step, then uses a small LLM judge to pick the safest among K candidate continuations. No weights changed, no retraining, and the safety-utility tradeoff is tunable at deployment time.

## Why Fine-Tuning Destroys Alignment — and Why It's Hard to Fix

The failure mode is well-characterized. Safety alignment concentrates in the **first few output tokens**. A well-aligned model has learned to begin refusals early — "I can't help with that" — before the harmful content would be generated. Fine-tuning on domain data changes the token distribution for early positions: a medical specialist trained on clinical notes begins responses with clinical framing, not safety language, because that's what the fine-tuning data rewarded.

This is why domain and authority framing are potent soft jailbreaks: they don't need to "trick" the model so much as shift its early-token distribution into a regime where the safety reflex was never trained to fire. The aligned base model's safety behavior is a thin layer on top of the pre-training distribution; domain SFT scrapes it off.

The ALIGNBEAM authors verify this empirically. Their depth ablation shows that applying the anchor's influence for just N=3 mixing steps captures **+61.9 percentage points** of the total safety gain achievable with full mixing. The safety fix is cheap precisely because the problem is concentrated early.

## The Core Technical Contribution: Cross-Vocabulary Logit Bridge Mixing

Existing logit-mixing approaches — SafeDecoding, Proxy Tuning, Contrastive Decoding — all require the draft and safety models to share a token vocabulary. The approach is straightforward when both models use the same tokenizer: blend their output distributions directly, weighting toward the anchor for safety-critical positions.

ALIGNBEAM's **Logit Bridge Mixing (LBM)** removes this constraint via a text-bridge construction:

1. At each decoding step, take the anchor model's top-B predicted tokens (B=50 by default).
2. Decode each anchor token to a UTF-8 string using the anchor's tokenizer.
3. Re-encode that string using the draft model's tokenizer.
4. Whenever the result is a single draft token (a 1:1 match), accumulate it into a blended distribution:

```
f[d_id] += α · p_s + (1-α) · P_d(d_id)
```

where α ∈ [0,1] is a deployment-time safety-utility knob. Renormalizing f gives the blended distribution that steers early tokens toward safe completions.

When the two models share a vocabulary, LBM reduces to a construction analogous to SafeDecoding — the paper's same-vocabulary control pair (Qwen3-8B-Base with a Qwen anchor) confirms this. The difference from SafeDecoding is in support selection: beam search over continuations rather than token-level top-k intersection.

When vocabularies differ, roughly 12% of anchor tokens don't produce a 1:1 match (one anchor token decodes to a multi-token sequence in the draft vocabulary). ALIGNBEAM offers three fallback variants for these cases:

| Variant | Multi-token fallback | Use case |
|---|---|---|
| **LBM-Drop** | Skip; renormalize (default) | All drafts |
| **LBM-First** | Keep only first sub-token | Stealth safety / instruct models |
| **LBM-Exact** | Drop all non-exact matches | Conservative ablation |

LBM-Drop is the default and produces conventional refusal phrasing. LBM-First is notable for a specific failure mode in instruct models: some models (DeepSeek-Math-7B-Instruct at N=6) emit a refusal prefix and then *continue with the harmful answer* — the model has learned that "I cannot help" is an acceptable opening even for content it then provides. LBM-First's stealth safety approach injects only the first sub-token of each multi-token anchor suggestion, steering the model toward safety without triggering the refusal-then-comply pattern.

## The Three-Phase Generation Pipeline

ALIGNBEAM structures generation into three phases:

**Phase 1 — Priming**: Run both models on the query. Apply LBM to produce a blended distribution, then select the top-K tokens as starting beams (K=3 by default). These K beams represent K candidate response openings, each biased toward the anchor's safety distribution.

**Phase 2 — Mixed Decoding**: Extend each beam greedily for N-1 additional steps, applying LBM at each step. Total cost: O(K·N) paired forward passes. The default N=6 means six mixing steps; most of the safety gain is captured in the first three.

**Phase 3 — Draft Continuation**: Complete all K beams using only the draft model with KV-cache reuse (no anchor inference here). A small LLM judge scores each beam on a 1–5 harm rubric; the safest beam (score ≤ 2.5) is returned as the final response.

The computational overhead concentrates in Phase 3 — generating K full completions — not in the mixing phases. Latency scales with K, not N, which means the mixing depth (N) can be increased relatively cheaply. The paper reports that ALIGNBEAM's overhead is within the range of existing inference-time defenses (full latency numbers in Appendix K.2 of the paper).

## Results: What the Numbers Look Like

The evaluation covers five draft models: MedLlama-3-8B, Finance-Llama3-8B, DeepSeek-Math-7B-Instruct (three SFT-degraded domain specialists), Llama-3.1-8B (unaligned base model), and Qwen3-8B-Base (same-vocabulary control). The safety anchor is fixed: Qwen2.5-3B-Instruct for every pair.

**Headline safety results** across the five pairs:
- AdvBench: 38.1% → 91.5% (+53.4 pp macro average)
- HarmBench-Standard: 25.9% → 76.4% (+50.5 pp macro average)
- Four of five pairs reach 91–96% on AdvBench and 78–81% on HarmBench-Standard
- DeepSeek-Math-7B-Instruct (the hardest case, using N=20): +64.9 pp on HarmBench-Standard

**Utility cost**: -0.4 pp on both GSM8K (DeepSeek-Math) and MedQA (MedLlama). This is within noise for most deployment contexts.

**Benign over-refusal** (the false-positive side of the safety tradeoff): this is the honest part of the results. The anchor's tendency to refuse carries over. Llama-3.1-8B moves from 11.0% to 22.3% over-refusal on OR-Bench-Hard and from 5.6% to 40.0% on XSTest. The mixing pushes the model toward the anchor's distribution, and the anchor sometimes refuses benign content.

The over-refusal tradeoff is tunable. Lowering α reduces the anchor's influence, trading some safety gain for fewer false positives. The whole point of the deployment-time knobs (α, N, K) is that operators can make this calibration without retraining.

## Security Implications: What This Means for Deployed Specialists

The research addresses a threat vector that's often underappreciated in AI security discussions: the **fine-tuning-as-alignment-erasure** attack surface.

The standard enterprise LLM deployment path — take a well-aligned base model, fine-tune it on proprietary domain data, deploy as a specialist — has an implicit security assumption: that fine-tuning doesn't materially degrade safety alignment. The evidence now says this assumption is routinely violated. A medical specialist fine-tuned on clinical notes inherits the clinical register, including the clinical framing that bypasses safety constraints framed as patient care.

This creates a practical problem for teams that rely on the base model's alignment as their primary safety guarantee. If you're operating a fine-tuned specialist in a context where adversarial prompts are plausible — a customer-facing chatbot, a research assistant, anything with external users — the alignment guarantee from the base model is weaker than you think.

ALIGNBEAM's value as an inference-time defense is specifically that it **doesn't require access to training**. For teams that use third-party fine-tuned models, or whose fine-tuning pipelines are outside the security team's control, the ability to apply a safety layer at inference time without coordinating a retraining run is practically significant. The safety anchor (Qwen2.5-3B-Instruct in the paper) is small enough to run alongside any 7-8B draft model; total parameter overhead is modest.

A few deployment considerations worth naming:

**The judge is a new attack surface.** Phase 3 uses a small LLM judge to select the safest among K beams. The judge can be targeted — an adversary who can craft prompts that score poorly on the judge's harm rubric even when they're actually harmful could evade selection. The paper uses a 1-5 harm rubric; the specific judge and rubric design matter for robustness.

**Over-refusal at high α is a usability problem.** The XSTest numbers (5.6% → 40% over-refusal on Llama-3.1-8B) are significant. At α=0.5, a system that refused 5.6% of benign questions now refuses 40%. For customer-facing deployments this is a reliability regression. Teams will need to calibrate α against their specific benign query distribution, not just against adversarial benchmarks.

**N=20 for instruct models with refuse-then-comply behavior.** The DeepSeek-Math case required N=20 rather than the default N=6 because at N=6 the model emits a refusal prefix and then completes the harmful answer anyway. This is a specific failure pattern for RLHF/instruction-tuned models that have learned refusal phrasing as a form rather than a behavior. The fix works (N=20 resolves it) but requires detection — operators need to evaluate their specific model for this pattern before deploying with default settings.

## How This Fits the Defense Landscape

ALIGNBEAM's closest prior work is SafeDecoding, which performs the same logit blending but requires a shared vocabulary. The relationship is explicit in the paper: on same-vocabulary pairs, LBM reduces to a construction analogous to SafeDecoding (differing in support selection: beam search vs. token-level intersection). ALIGNBEAM is an extension, not a replacement — if your draft and anchor already share a vocabulary, SafeDecoding or Proxy Tuning remain valid simpler choices.

What ALIGNBEAM unlocks is the cross-family case, which is the case that matters for domain specialists. Medical LLMs, finance models, and math models are predominantly fine-tuned on Llama or Mistral base architectures with their respective tokenizers; the most capable small safety anchors available (Qwen2.5-3B-Instruct, Phi-3-mini) use different tokenizers. Existing logit-mixing defenses simply don't apply. ALIGNBEAM fills this gap.

The comparison with RAIN is also instructive. RAIN enables self-alignment through rewindable generation — the model identifies and backs away from harmful trajectories using its own safety prior. But domain fine-tuning is precisely what eliminates the safety prior that RAIN depends on. A model with near-zero baseline refusal has nothing to rewind from. ALIGNBEAM injects the safety prior from outside (the anchor model) rather than relying on residual alignment that may no longer exist.

## What Should You Actually Do?

**1. Audit your fine-tuned models against adversarial benchmarks.**

If you operate fine-tuned specialists in any context where adversarial inputs are plausible, run them against HarmBench-Standard and AdvBench before assuming the base model's alignment held. The evidence strongly suggests it didn't. Baseline refusal rates on fine-tuned medical, finance, and math models in the paper range from near-zero to moderate — and this is against standard benchmarks, not jailbreaks optimized for your specific domain framing.

**2. Consider inference-time defenses when retraining is not feasible.**

For teams operating third-party fine-tuned models, or where the fine-tuning pipeline is outside the security team's control, inference-time defenses like ALIGNBEAM are one of the few levers available. The training-free property is significant: no coordination with model owners, no retraining infrastructure, no version management for a retrained artifact. You add a safety wrapper at the serving layer.

**3. Evaluate α and N for your specific model pair before deployment.**

Don't use default hyperparameters without testing. The over-refusal numbers at default α=0.5 are significant (40% on XSTest for Llama-3.1-8B). Lower α if you're deploying in a benign-query-heavy context and can accept reduced safety gains. Check whether your target model exhibits the refuse-then-comply pattern at N=6 — if it does, raise N before comparing results.

**4. Treat the LLM judge as part of your attack surface.**

The Phase 3 judge — which selects the safest beam — is a new component in your inference pipeline with its own failure modes. It can be targeted by adversaries who understand its scoring rubric. Test your judge against examples where harmful outputs might score as low-harm (clinical framing of abuse questions, financial framing of fraud instructions). Monitor judge score distributions in production; anomalies in score distributions can be an early signal of adversarial probing.

**5. Match the defense to the actual threat model.**

ALIGNBEAM addresses alignment erosion from domain fine-tuning. It's not designed for base models that were never aligned, adversarial jailbreaks that work on aligned models, or prompt injection attacks in agentic pipelines. Know which threat you're defending against before deploying; inference-time logit mixing is a specific tool for a specific problem.

## The Broader Implication

The paper's most important contribution may be the empirical validation of an uncomfortable claim: **fine-tuned specialists routinely have near-zero safety alignment**, and the practitioners deploying them are frequently assuming the opposite. The refusal rates in the paper (MedLlama-3-8B, Finance-Llama3-8B, Llama-3.1-8B all well below 30% on AdvBench before ALIGNBEAM) are not edge cases — they're typical of domain-specialized models in the wild.

ALIGNBEAM provides a technically sound way to recover alignment without retraining. The training-free, vocabulary-agnostic approach makes it deployable as an operational control rather than a research project. Whether the over-refusal cost is acceptable depends on the deployment context, but the safety gains (+50 pp on adversarial benchmarks) are large enough that the tradeoff is worth evaluating seriously for any specialist model in an adversarial-input environment.

The code will be released at [github.com/Lexsi-Labs/alignbeam](https://github.com/Lexsi-Labs/alignbeam).

---

**Source:**
- *ALIGNBEAM: Inference-Time Alignment Transfer via Cross-Vocabulary Logit Mixing* — [arXiv:2606.12342](https://arxiv.org/abs/2606.12342) (Chawla, Seth, Sankarapu — Lexsi Labs, June 2026)
