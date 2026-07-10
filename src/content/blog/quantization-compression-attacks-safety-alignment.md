---
title: "Quantization and Compression Attacks: How Model Size Reduction Can Re-Enable Suppressed Unsafe Behaviors"
description: "When you deploy a GGUF Q4_K_M quantization of a safety-aligned model, you're relying on an assumption: that alignment survives precision reduction. Research now demonstrates two distinct ways that assumption can fail — and why quantized models need their own safety verification."
pubDate: 2026-07-10
tags: ["quantization", "model-compression", "supply-chain", "alignment", "gguf", "llama.cpp", "threat-modeling", "defense-patterns"]
---

The default assumption among most teams deploying self-hosted models is that safety properties belong to the model architecture and training, not to the numerical precision at which weights are stored. Download a GGUF Q4_K_M quantization of Llama-3 from Hugging Face, load it through llama.cpp or Ollama, run the same safety evaluations you ran on the hosted API — if it passes, you're done.

That assumption has a systematic flaw, and two distinct lines of research demonstrate it from different directions. Understanding both is necessary because they have different threat models, different mitigations, and different degrees of empirical support.

## How Quantization Works, and What Gets Lost

Post-training quantization reduces the numerical precision of a model's weights to lower memory and compute requirements. A full-precision model stores weights as 32-bit or 16-bit floating-point values (FP32 or FP16). INT8 quantization maps those weights to 8-bit integers; INT4 quantization maps them to 4-bit integers, cutting memory use by 4× or 8× respectively.

The GGUF format used by llama.cpp implements a family of block-wise quantization schemes with names like Q4_K_M and Q5_K_S. Each variant specifies not just the target precision but the block size for per-group scaling factors and which tensors to assign higher precision. Q4_K_M, for instance, is a mixed-precision scheme: most tensors use 4-bit quantization (Q4_K), but certain tensors — particularly the attention key/value matrices — are assigned a higher-bit format such as Q6_K. The "_M" suffix signals this mixed assignment strategy rather than a uniform 4-bit encoding.

The mathematics of quantization is simple: you're replacing a continuous floating-point value with the nearest representable discrete value. The rounding error — called quantization error — is bounded but nonzero and nonuniform. Low-magnitude weights are disproportionately affected because the discrete steps represent a larger fraction of their value. High-magnitude "outlier" weights dominate the scaling factors and are preserved more accurately.

This non-uniformity is where the safety problem enters.

## The First Threat: Supply-Chain Exploitation of Quantization

The most rigorously demonstrated threat is not passive safety degradation — it's an active supply-chain attack.

In "Exploiting LLM Quantization" (Egashira, Vero, Staab, He, and Vechev — ETH Zurich's SRILab, published at NeurIPS 2024, arXiv:2405.18137), researchers demonstrated a three-stage attack framework. An adversary begins with a malicious LLM fine-tuned on an adversarial task. They then quantize the malicious model, calculating a perturbation that makes the full-precision version of the model appear benign — passing safety evaluations in full precision. The perturbation is designed to be absorbed by quantization rounding, so that the quantized model retains the harmful behavior while the uploaded full-precision checkpoint looks clean.

The threat model maps directly onto current distribution patterns. A model is uploaded to Hugging Face in full precision. Evaluators run safety assessments on the FP16 checkpoint and find nothing concerning. Users download the quantized GGUF or GPTQ variant. The quantized model produces harmful outputs that the full-precision model suppresses.

The same group followed this with "Mind the Gap: A Practical Attack on GGUF Quantization" (Egashira, Staab, Vero, He, and Vechev, arXiv:2505.23786), extending the attack to the GGUF format specifically. Their key insight is that quantization error — the difference between the full-precision weights and their dequantized counterparts — creates a space that an adversary can exploit. Previous attacks targeted simpler quantization schemes; this paper develops the first attack that works against the GGUF quantization family used by llama.cpp and Ollama, the dominant inference frameworks for self-hosted deployment.

This is a confirmed, demonstrated attack, not a theoretical concern. The papers describe working implementations with specific models. The threat it describes is meaningfully different from passive safety drift: it requires an adversary with the capability to craft perturbed model weights, but requires no access to the victim's infrastructure. The attack surface is the trust that users place in quantized model checkpoints on public repositories.

## The Second Threat: Incidental Safety Degradation

Separate from the active supply-chain threat, there is evidence that quantization can incidentally reduce safety alignment even in models that are not deliberately tampered with.

"Q-resafe: Assessing Safety Risks and Quantization-aware Safety Patching for Quantized LLMs" (Chen, Zhang, Hu, Wang, Lou, Feng, and Song, arXiv:2506.20251) provides the most comprehensive recent evaluation. The paper conducted safety evaluations across multiple mainstream quantization techniques and calibration datasets using standardized safety benchmarks. Their finding: concerning safety degradation across all quantization methods and settings tested. The degradation was not uniform — different quantization methods and different calibration datasets produced different safety outcomes — but no combination they tested preserved safety completely relative to the full-precision base model.

The Q-resafe paper specifically highlights calibration dataset-free quantization methods (such as some GGUF variants and RTN — round-to-nearest) as particularly concerning for safety, because these methods lack a mechanism for the model operator to calibrate the quantization toward preserving specific model behaviors.

"HarmLevelBench: Evaluating Harm-Level Compliance and the Impact of Quantization on Model Alignment" (Belkhiter, Zizzo, and Maffeis, NeurIPS 2024 workshop, arXiv:2411.06835) examined AWQ and GPTQ quantization specifically, finding a nuanced picture: quantization can increase vulnerability to direct attacks while sometimes improving robustness against transfer attacks. This trade-off is important — it means evaluating only one attack type after quantization can give a misleadingly optimistic picture.

One important qualification: "Fine-Tuning, Quantization, and LLMs: Navigating Unintended Outcomes" (Kumar, Kumar, Agarwal, and Harshangi, arXiv:2404.04392), which evaluated Mistral, Llama series, Qwen, and MosaicML models, found that quantization has *variable* effects on attack success rates — not a consistent, uniform increase in jailbreak vulnerability. Fine-tuning, in their study, showed a more consistent pattern of increased jailbreak success than quantization alone. This nuance matters: the claim "quantization always degrades safety" would be an overgeneralization. The accurate claim is that quantization introduces safety uncertainty that requires explicit verification, and that certain quantization methods and configurations are more problematic than others.

### Why Safety Alignment Is Structurally Fragile

The mechanism behind incidental safety degradation follows from how modern safety alignment works. RLHF and DPO fine-tuning apply relatively small weight updates on top of a large pretrained base. The pretrained base weights are high-magnitude and encode the model's core capabilities. The alignment fine-tuning signal is a smaller perturbation that shapes refusal behavior, output tone, and content boundaries.

Quantization rounding errors hit lower-magnitude weights harder because the discrete step size represents a larger fraction of the value. If safety-relevant neurons have systematically lower-magnitude weights than capability-relevant neurons — which there is reason to expect, since the pretrained base is optimized to minimize loss on vast data while RLHF fine-tuning operates on much smaller preference datasets — then quantization disproportionately erodes the alignment signal.

This is a structural fragility, not a specific exploitable vulnerability. It means that even well-intentioned quantization, by a trustworthy operator, using a clean model, with no adversarial intent, can produce a quantized model with meaningfully different safety properties from the original.

## Fault Injection: A Third Attack Vector

A distinct threat that has emerged in recent research is fault injection against quantized models. "On Jailbreaking Quantized Language Models Through Fault Injection Attacks" (Zahran, Tahmasivand, Alouani, Khasawneh, and Fouda, arXiv:2507.03236) investigated gradient-guided bit-flip attacks across FP16, FP8, INT8, and INT4 quantization schemes on Llama-3.2-3B, Phi-4-mini, and Llama-3-8B.

Their findings on the interaction between quantization and fault injection resistance are specific: FP16 models were most vulnerable, achieving attack success rates above 80% with a budget of 25 perturbations. INT8 models showed ASRs below 50% at the same budget. FP8 demonstrated the strongest resistance, maintaining ASR below 20% at budget 25 and below 65% even at budget 150. INT4, despite having the lowest precision, did not provide consistent attack resistance — INT4 models exhibited high ASRs at larger perturbation budgets.

An important finding from the fault injection research: jailbreaks induced in FP16 models were highly transferable to FP8 and INT8 quantizations (below 5% ASR difference on average), but INT4 significantly reduced transferred ASR (average 35% drop). This is not the same as saying INT4 is safe — it means attacks that work in full precision transfer less reliably to INT4, but INT4-specific attacks at sufficient perturbation budget still succeed.

Fault injection as a threat vector requires physical or privileged software access to the deployment environment — it is a post-deployment infrastructure attack, not a supply-chain concern. However, as quantized models are increasingly deployed in edge environments and on consumer hardware without secure enclaves, the threat model is realistic.

## The Practical Risk Landscape

The threats differ by required attacker capability and deployment context:

**High capability, remote attacker**: The supply-chain exploitation (Egashira et al.) requires fine-tuning capability and requires uploading to a distribution platform where targets will download. The attacker needs to construct and distribute a convincing model checkpoint. This requires infrastructure and resources, but is entirely feasible for sophisticated actors. The victim needs only to download a quantized model from a repository they trust.

**Zero attacker required**: Incidental safety degradation (Q-resafe, HarmLevelBench, Kumar et al.) is a risk present in all quantized model deployments without any adversary. Any organization deploying a quantized model without verifying its safety properties on the quantized version is relying on an untested assumption.

**Physical/privileged access**: Fault injection (Zahran et al.) is a separate threat model requiring hardware access or privileged software access. Relevant for edge deployments, consumer devices, and multi-tenant inference environments without hardware isolation.

The practical risk for most organizations deploying self-hosted quantized models is the combination of the second threat (incidental degradation) and the first (supply chain). Both are present, both are demonstrated, and both are addressed by the same fundamental mitigation: verify safety on the quantized model you will actually deploy.

## Detection and Mitigation

### Run Safety Benchmarks on the Quantized Model, Not Just the Base

The most important operational change is to verify safety properties on the exact checkpoint you deploy, not on a hosted API version or the full-precision base model. HarmBench (Mazeika, Phan, Yin, Zou, Wang, Mu, Sakhaee, Li, Basart, Li, Forsyth, and Hendrycks, ICML 2024, arXiv:2402.04249) provides a standardized evaluation framework for automated red teaming with 18 attack methods and a consistent evaluation harness. Running quantized checkpoints through HarmBench or a comparable behavioral benchmark before deployment provides empirical evidence that the quantized model behaves similarly to its base on the specific test distribution.

This is a minimum, not a guarantee. Behavioral test suites evaluate performance on a defined benchmark distribution, and a sophisticated supply-chain attacker can potentially craft a model that passes benchmarks while retaining targeted harmful behavior outside the benchmark distribution. But benchmark verification raises the cost of successful deception substantially.

### Prefer Calibration-Dataset-Based Quantization Methods

Not all quantization methods are equally risky. Methods that use a calibration dataset — GPTQ, AWQ, and others — allow the quantization to be tuned to preserve model behavior on a reference distribution. Methods that do not use a calibration dataset (pure round-to-nearest, including some simpler GGUF variants) have no mechanism to prioritize safety-relevant weights.

When calibration-based methods are used, the calibration dataset matters. Including safety-relevant examples in calibration data creates an opportunity to preserve alignment through the quantization process, though this is not yet established practice in the GGUF ecosystem.

### Quantization-Aware Safety Patching

Q-resafe (Chen et al., 2025) proposes a targeted mitigation: after quantization, apply a lightweight safety patching step that updates only the safety-critical parameters while preserving the quantized structure. The paper demonstrates that this can restore safety levels to the pre-quantization counterpart with minimal impact on utility. This approach is not yet widely available as an off-the-shelf tool, but the methodology is documented and implementable for organizations with the relevant engineering capacity.

LoftQ (Li, Yu, Liang, He, Karampatziakis, Chen, and Zhao, ICLR 2024, arXiv:2310.08659) addresses a related problem: quantization-aware fine-tuning that jointly optimizes quantization and LoRA initialization to minimize quantization error on downstream tasks. While LoftQ is not specifically designed for safety preservation, the principle — making fine-tuning aware of quantization instead of treating them as independent steps — is directly applicable to alignment-preserving quantization.

### Establish Model Card Requirements for Quantized Variants

Model cards for quantized releases typically report utility benchmarks (perplexity on WikiText, MMLU scores) but rarely report safety benchmark results separately for each quantized variant. This is an operational gap: a model card that reports safety evaluation only on the full-precision base gives no information about whether the quantized version maintains those properties.

For internal model deployment, require that model cards for quantized variants include safety evaluation results on the quantized checkpoint. For models consumed from public repositories, treat the absence of per-variant safety evaluation as a risk flag requiring your own testing before deployment.

### Verify Checkpoint Integrity

Against supply-chain attacks specifically, cryptographic verification of model checkpoints provides a complementary layer — with an important caveat. Hashing or signing a checkpoint only helps if you control the source: a malicious publisher can sign a poisoned FP16 checkpoint just as easily as a legitimate one. What checkpoint integrity verification *does* buy you is protection against tampering in transit (checksum verification) and, if you quantize in-house from a trusted source, an auditable record that your quantized deployment derives from that specific source checkpoint via a documented process.

The practical implementation for controlled deployments: maintain a hash of the full-precision source checkpoint from a trusted original publisher, quantize locally using a documented method, and hash the resulting quantized artifact. For models downloaded from public repositories and distributed in pre-quantized form, treat the absence of a quantization provenance trail — who quantized, from what source, with what method — as a risk signal requiring additional behavioral verification.

## What This Means for Self-Hosted Deployments

The GGUF ecosystem has become the dominant distribution mechanism for self-hosted models. Quantized variants of open-weight models — Llama, Mistral, Qwen, and others — are downloaded millions of times from Hugging Face. The safety evaluation infrastructure for these deployments is almost uniformly absent.

Organizations deploying llama.cpp or Ollama in production have typically evaluated the model once, often on the hosted API or a higher-precision quantized variant such as Q8_0, and applied those evaluations to justify deployment of a Q4_K_M or similar lower-precision variant. The assumption that safety transfers across quantization levels is not tested; it is inherited.

The research record now makes this practice difficult to justify. The supply-chain attack against GGUF (Egashira et al., 2025) is a working implementation targeting the exact ecosystem most self-hosted deployments use. The Q-resafe evaluation (Chen et al., 2025) found safety degradation across all quantization methods tested. HarmLevelBench found quantization-specific trade-offs in attack vulnerability profiles.

The minimum viable response is to run the quantized model through a behavioral benchmark before deployment. The more complete response adds calibration-dataset-based quantization where available, checkpoint integrity verification, and a model card requirement for per-quantization safety evaluation. None of these is prohibitively expensive; all of them close a verification gap that current practice leaves open.

---

**Key research cited:**

- *Exploiting LLM Quantization* — Egashira, Vero, Staab, He, Vechev (SRILab @ ETH Zurich). NeurIPS 2024. [arXiv:2405.18137](https://arxiv.org/abs/2405.18137)
- *Mind the Gap: A Practical Attack on GGUF Quantization* — Egashira, Staab, Vero, He, Vechev. 2025. [arXiv:2505.23786](https://arxiv.org/abs/2505.23786)
- *Q-resafe: Assessing Safety Risks and Quantization-aware Safety Patching for Quantized Large Language Models* — Chen, Zhang, Hu, Wang, Lou, Feng, Song. 2025. [arXiv:2506.20251](https://arxiv.org/abs/2506.20251)
- *HarmLevelBench: Evaluating Harm-Level Compliance and the Impact of Quantization on Model Alignment* — Belkhiter, Zizzo, Maffeis. NeurIPS 2024. [arXiv:2411.06835](https://arxiv.org/abs/2411.06835)
- *Fine-Tuning, Quantization, and LLMs: Navigating Unintended Outcomes* — Kumar, Kumar, Agarwal, Harshangi. 2024. [arXiv:2404.04392](https://arxiv.org/abs/2404.04392)
- *On Jailbreaking Quantized Language Models Through Fault Injection Attacks* — Zahran, Tahmasivand, Alouani, Khasawneh, Fouda. 2025. [arXiv:2507.03236](https://arxiv.org/abs/2507.03236)
- *HarmBench: A Standardized Evaluation Framework for Automated Red Teaming and Robust Refusal* — Mazeika et al. ICML 2024. [arXiv:2402.04249](https://arxiv.org/abs/2402.04249)
- *LoftQ: LoRA-Fine-Tuning-Aware Quantization for Large Language Models* — Li, Yu, Liang, He, Karampatziakis, Chen, Zhao. ICLR 2024. [arXiv:2310.08659](https://arxiv.org/abs/2310.08659)

---

**Related posts**: [Sleeper Agents in Production: The AI Supply Chain Backdoor Threat](/blog/sleeper-agents-ai-supply-chain-backdoor) covers the broader supply-chain threat from fine-tuning and backdoor insertion; the quantization supply-chain attack described here is a structurally similar but mechanically distinct threat operating at a different stage of the model distribution pipeline.
