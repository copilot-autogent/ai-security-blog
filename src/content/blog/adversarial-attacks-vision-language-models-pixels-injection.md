---
title: "Adversarial Attacks on Vision-Language Models: Pixels as Injection Vectors"
description: "Gradient-crafted image perturbations can override VLM safety guardrails, inject attacker-defined instructions, and trigger tool calls in agentic pipelines. A survey of the empirically confirmed attack landscape and practical defenses."
pubDate: 2026-06-30
tags: ["adversarial-attacks", "vision-language-models", "multimodal", "prompt-injection", "ai-safety", "agentic-ai"]
---

Vision-language models — GPT-4V, Claude 3, Gemini 1.5 Pro, LLaVA, InstructBLIP — process images alongside text as first-class inputs. That sentence sounds like a capability story. It's also a threat model.

When a model ingests an image, the attacker's surface expands from the text channel to the full pixel space. Pixels are continuous. Text tokens are discrete. Continuous spaces are gradient-friendly — the same optimization machinery that trains neural networks can craft images that push a model's internal representations toward any attacker-chosen target. The result: an imperceptible modification to a normal image that causes a VLM to ignore its system prompt, produce attacker-specified output, or trigger tool calls it was never instructed to make.

This post covers what's been empirically confirmed, what remains theoretical, how perception attacks differ from injection attacks, and what defenses exist.

## Adversarial Examples: The Primer

The vulnerability of neural networks to adversarial examples was first shown by Szegedy et al. (2013, "Intriguing properties of neural networks," arXiv:1312.6199). Goodfellow et al. (2014) provided the first practical attack algorithm, explaining the vulnerability through the *linearity hypothesis* and introducing **FGSM**. FGSM computes the gradient of the model's loss with respect to the input image, then takes a single step in the direction that increases that loss (for an untargeted attack):

```text
x_adv = x + ε · sign(∇_x L(f(x), y))
```

Targeted variants negate the sign, pulling the model toward a specific attacker-chosen output. The perturbation magnitude ε is bounded to stay below a perceptibility threshold — typically measured in L∞ norm.

Madry et al. (2018) extended this to **Projected Gradient Descent (PGD)**, an iterative version that takes many smaller gradient steps, projecting back into the ε-ball B(x, ε) after each update:

```text
x_{t+1} = Π_{B(x,ε)}(x_t + α · sign(∇_x L(f(x_t), y)))
```

PGD attacks are stronger in the white-box setting than single-step FGSM, finding perturbations that are more robustly harmful against the target model. For cross-model transfer, the picture is more nuanced — iterative attacks don't automatically transfer better than single-step attacks; explicitly transfer-optimized methods (using surrogate ensembles, input diversity, or momentum) are generally preferred when the goal is black-box transferability.

Both FGSM and PGD are **white-box attacks**: they require access to model gradients. Much of the VLM attack literature uses white-box techniques against open-source models (LLaVA, InstructBLIP, BLIP-2) and then evaluates whether the resulting perturbations *transfer* to closed-source models — a finding that has significant threat model implications.

## Why VLMs Change the Threat Model

Classical adversarial examples on vision classifiers have a narrow harm profile: a misclassified image. The model sees a panda and says "gibbon." Annoying, but limited.

VLMs dramatically expand the harm profile in three ways:

**1. The output space is open-ended.** A classifier outputs a label. A VLM generates arbitrary text. An attacker who controls a VLM's behavior can extract context window contents, generate harmful content, produce disinformation, or inject instructions into downstream agents.

**2. The image is contextually integrated.** A VLM integrates visual and text content into a unified response. Adversarial perturbations can inject *semantic content* into this integrated representation, not just bias a single classification decision.

**3. VLMs are increasingly agentic.** A VLM in an agent pipeline that can call external tools is a very different target than a standalone captioning model. An adversarial image that causes the VLM to emit a specific tool call string can propagate attacker-controlled instructions into downstream execution — the extent of impact depends on how much the surrounding agent trusts that output.

## Attack Taxonomy: Perception Attacks vs. Injection Attacks

Not all VLM adversarial attacks work the same way. A useful distinction:

**Perception attacks** target the model's interpretation of image content — changing what the model *believes it sees*. In the VLM context, a perception attack might cause a model to generate an incorrect description that a downstream process acts on.

**Injection attacks** target the model's *behavior* given what it sees. The adversarial image needn't change the model's visible interpretation: the perturbation places the model's internal state into a regime where safety behaviors are suppressed or a specific attacker-defined output is elicited. This distinction matters for detection: perception attacks can potentially be caught by cross-checking image descriptions; injection attacks leave no visible artifact until the attack activates.

A third category, **cross-modal hijacking**, involves images and text that interact synergistically — neither alone produces the attack, but together they trigger behavior neither would independently.

## Empirical Landscape: What the Papers Show

### Schlarmann & Hein (2023): The Baseline Demonstration

Schlarmann and Hein's **"On the Adversarial Robustness of Multi-Modal Foundation Models"** (ICCVW 2023, arXiv:2308.10741) established a key baseline: multi-modal foundation models, including CLIP-based VLMs, are not inherently more robust to adversarial perturbations than their vision-only predecessors.

The paper demonstrates that adversarial perturbations against the image encoder can cause the model to generate attacker-controlled text output. A malicious content provider can craft an image whose perturbation causes the VLM to generate a specific caption — for example, directing users to a malicious URL or broadcasting false information — regardless of what the image actually depicts. The attack works against InstructBLIP and LLaVA, which use CLIP-family vision encoders.

The finding grounds an important empirical claim: the threat isn't speculative. Models widely deployed in 2023 are vulnerable to this attack class, and the vulnerability is rooted in the vision encoder component rather than any model-specific language model weakness.

### Qi et al. (2023): Universal Visual Jailbreaks

Qi et al.'s **"Visual Adversarial Examples Jailbreak Aligned Large Language Models"** (arXiv:2306.13213) demonstrated something more alarming: a *single* adversarial image can universally jailbreak an aligned VLM — causing it to comply with a wide range of harmful text instructions it would otherwise refuse.

The attack optimizes a perturbation that pushes the model's embedding of the adversarial image close to the embeddings of harmful content in the model's representational space. Once this "jailbreak image" is in the model's context, the model enters a regime where safety-trained refusal behaviors are suppressed. The paper demonstrates this against LLaVA, which uses CLIP as the vision encoder and LLaMA as the language backbone.

The critical insight: the adversarial image doesn't encode any specific harmful instruction. It creates a *representational context* where the model's alignment doesn't hold. Any harmful text instruction submitted alongside it then elicits compliance.

This "context poisoning" model is distinctive from visual text injection. It's not that the model reads instructions from the image. It's that the image shifts the model's internal state into a regime where the text-level safety refusals stop firing.

### Shayegani et al. (2023): Cross-Modal Attacks via CLIP Embeddings

Shayegani et al.'s **"Jailbreak in Pieces: Compositional Adversarial Attacks on Multi-Modal Language Models"** (arXiv:2307.14539) identified the CLIP vision encoder as a shared vulnerability surface across multiple VLMs.

The attack crafts adversarial images that, when processed through the vision encoder, produce embeddings that map to specific toxic content in the model's embedding space. Because the attack targets the CLIP encoder rather than the full VLM, adversarial images may transfer across different models that share the same vision backbone. The paper explicitly demonstrates cross-model transferability across open-source models sharing a CLIP encoder; transfer to closed-source commercial deployments is conditional on those deployments using compatible vision encoders, a condition that cannot be verified externally.

The compositional aspect refers to the attack strategy: adversarial images targeting toxic embeddings are paired with generic-looking text prompts. The text prompt is benign. The image is benign-looking. Together, they activate harmful generation.

### Bailey et al. (2023): Image Hijacks

Bailey et al.'s **"Image Hijacks: Adversarial Images can Control Generative Models at Inference Time"** (arXiv:2309.00236) introduced the concept of image hijacks — adversarial images that control VLM *behavior* rather than just content.

They demonstrate four attack types against LLaVA:
- **Output hijacks**: forcing the model to generate attacker-chosen text regardless of the user query
- **Context extraction**: causing the model to leak content from its context window (system prompt, prior turns)
- **Safety override**: suppressing refusal behaviors on harmful inputs
- **False belief injection**: causing the model to state specific false facts ("The Eiffel Tower is in Rome")

All four attack types achieve success rates above 80% against LLaVA. The attacks use white-box optimization through the full VLM and require only small, automated image perturbations.

The context extraction result is particularly significant for deployed systems. A VLM processing user-uploaded images that can be caused to reproduce its system prompt represents a confidentiality failure with direct practical consequences — system prompts often contain operational details, safety guidelines, and architectural information that deployments treat as proprietary.

### AnyDoor (Pang et al., 2024): Test-Time Backdoor Attacks

Pang et al.'s **"AnyDoor: Test-Time Backdoor Attacks on Multimodal Large Language Models"** (arXiv:2402.08577) introduces a different attack model: adversarial images that function as *backdoor triggers at inference time*, requiring no training data access.

Unlike conventional backdoor attacks that poison training data, AnyDoor crafts universal adversarial perturbations that pair with textual triggers at inference time. When the perturbed image appears in the input alongside a specific text trigger, the VLM produces an attacker-controlled output. The perturbation decouples setup (crafting the image) from activation (deploying the text trigger) — the payload can be distributed via an image hosting service or user-uploaded content and activated later through a separate channel.

The paper validates this against LLaVA-1.5, MiniGPT-4, InstructBLIP, and BLIP-2. Because the backdoor is in the image rather than the model, the trigger text can change dynamically — the same adversarial image can activate different harmful effects by varying only the text trigger.

> **Attribution note**: The issue tracking this post described the AnyDoor attack as "Bagdasaryan et al." This does not match the paper. AnyDoor (arXiv:2402.08577) was submitted by Tianyu Pang and colleagues at SAIL Singapore. Eugene Bagdasaryan's published work covers privacy attacks and unlearning but not this paper. The attribution appears to be an error in the issue.

## The CLIP Connection: Cross-Model Transferability

Multiple attack papers exploit the same mechanism: CLIP's shared embedding space. CLIP was trained to align image and text representations, and adversarial attacks on the CLIP encoder transfer across any VLM that shares that backbone — LLaVA, InstructBLIP, MiniGPT-4, and potentially others. An attacker who can run white-box optimization against the open-source CLIP ViT-L model gains meaningful leverage against commercial deployments that use the same encoder internally, without requiring access to the target model's weights.

## Agentic Risk: When the Image Is the Attack Payload

The threat profile of VLM adversarial attacks changes substantially in agentic contexts. A standalone VLM generating captions has a limited harm surface. A VLM agent that processes images and can execute tool calls — browsing the web, writing files, sending emails, calling APIs — has a dramatically expanded one.

Consider a VLM agent that processes screenshots to automate UI tasks. A malicious website embeds an adversarial patch in a display element. The agent screenshots the page. The adversarial patch shifts the VLM's internal state in a way that produces attacker-defined output — potentially directing the agent to click a specific element, navigate elsewhere, or act on attacker-specified instructions. This is a projected attack path extrapolating from the empirically confirmed injection capabilities in the papers above (Qi et al., Bailey et al.); fully end-to-end demonstrations against production VLM agents remain an active research area.

This is indirect prompt injection via the visual channel. The attack is the same in structure as text-based indirect prompt injection (malicious content in retrieved documents), but with two important differences:

**The visual channel lacks the inspection mechanisms text has.** Users and systems can read retrieved text and potentially spot injected instructions. Adversarial perturbations in images are imperceptible by design.

**The attack survives content filtering.** Adversarial patches don't contain text strings. Traditional input filters scanning for "ignore previous instructions" won't detect them. A patch that manipulates the model's internal representation bypasses lexical safety checks entirely.

Agentic VLMs processing user-uploaded images without additional safeguards present a wide injection surface. Any user who can submit an image has a potential injection vector, and the attack's imperceptibility means it won't be caught by human review of image content.

## Defenses: What Works and What Doesn't

Defense against adversarial VLM attacks is an active area with partial solutions. Nothing approaches the robustness that adversarial training has achieved for classical vision classifiers in narrow domains.

### Input Pre-processing: DiffPure

The **DiffPure** method (Nie et al., 2022, "Diffusion Models for Adversarial Purification," ICML, arXiv:2205.07460) applies a forward diffusion process to the input image before processing — adding a small amount of noise and then running the diffusion model's reverse process to recover a "clean" version. The intuition: adversarial perturbations are structured, near-maximum-magnitude signals in specific directions; diffusion noise tends to wash them out while preserving semantic content.

DiffPure was developed and evaluated against adversarial examples on vision classifiers, and its application to VLMs is an active area of investigation. The method has two known weaknesses: it's computationally expensive (running a full diffusion reverse process per input image), and adaptive attackers who know DiffPure is deployed can optimize perturbations that survive it. Against non-adaptive attackers, purification provides meaningful robustness; against adaptive optimization, the gains can be substantially reduced.

### Adversarial Training

The canonical defense is **adversarial training**: augmenting the training distribution with adversarial examples so the model learns to be robust to them. Full VLM adversarial training is expensive and tends to reduce clean accuracy. Partial adversarial training of the vision encoder alone is more tractable and has shown promise in reducing transferability of CLIP-based attacks.

### Multi-Modal Cross-Checking

**Cross-modal consistency verification** asks: does the model's textual description of an image match what an independent analysis would produce? This approach has genuine detection value against perception attacks but limited value against injection attacks, where the model's visible image interpretation may appear normal while safety behavior is suppressed. Cross-checking also requires two independent pipelines for each image; if both share a CLIP backbone, a single adversarial image may defeat both.

### Trust-Gated Image Processing

At the architecture level, the most robust approach is to limit what visual inputs can cause a model to do. **Trust-gating** restricts the actions a VLM can take based on the source of the visual input:

- System-provided images (screenshots of controlled infrastructure) may be permitted to influence tool calls.
- User-uploaded images are processed in a restricted mode where visual content cannot affect tool-call parameters, only inform informational responses.
- Third-party images from web fetches are further restricted or processed in a sandboxed context.

This is least-privilege applied to visual inputs. It accepts that adversarial images may succeed in their representational manipulation and compensates by limiting the consequence of that success. An adversarial image that causes the model to *want* to emit a tool call doesn't cause harm if the architecture prevents that tool call from executing.

The practical challenge: many agentic VLM applications are built with fully permissive visual processing precisely because the valuable use cases require it (screenshot-based automation, document processing, visual question answering over user-provided content). Restricting visual trust levels requires rethinking the agent's trust model at design time.

### Output Anomaly Detection

**Behavioral monitoring** flags anomalous agent outputs — unfamiliar tool call patterns, resources accessed outside normal scope, text inconsistent with task context. This is complementary rather than primary: it detects attacks after they've partially succeeded, enabling circuit-breaking or human review. Its effectiveness depends on how well baseline behavior is characterized.

## What the Empirical Landscape Implies

Looking across the confirmed papers, a pattern emerges:

**The vision encoder is the weak link.** Every major attack in this survey — Schlarmann & Hein, Qi et al., Shayegani et al., Bailey et al. — ultimately works through the vision encoder. The language model backbone may have strong safety alignment; the encoder feeding it images does not, and adversarial perturbations bypass alignment by manipulating inputs before they reach the safety-trained component.

**Transferability is real and meaningful.** Multiple papers demonstrate that white-box attacks against open-source CLIP-based models transfer to other models. This lowers the entry barrier: an attacker doesn't need access to a target system's weights to craft effective adversarial images.

**Injection attacks are harder to detect than perception attacks.** Visual injection that suppresses safety behaviors leaves no visible artifact in the model's image description. Detection requires behavioral monitoring rather than consistency checking.

**Agentic deployment substantially raises the stakes.** The papers that demonstrate context extraction (Bailey et al.) and test-time behavioral control (AnyDoor) point toward a harm profile that extends well beyond content policy violations. Exfiltration of context window contents and manipulation of agent behavior are operational security risks for deployed systems.

The honest assessment: the adversarial VLM attack surface is empirically demonstrated, transferable, accessible without target model access, and partially mitigable through architectural constraints. No single defense provides comprehensive protection. The practical recommendation is a layered approach: trust-gate visual inputs in high-stakes agentic contexts, monitor output behavior, and treat user-provided images as untrusted inputs whose visual content should not influence security-relevant decisions.

---

*Core papers: Schlarmann & Hein, "On the Adversarial Robustness of Multi-Modal Foundation Models" — [arXiv:2308.10741](https://arxiv.org/abs/2308.10741) (ICCVW 2023); Qi et al., "Visual Adversarial Examples Jailbreak Aligned Large Language Models" — [arXiv:2306.13213](https://arxiv.org/abs/2306.13213); Shayegani et al., "Jailbreak in Pieces: Compositional Adversarial Attacks on Multi-Modal Language Models" — [arXiv:2307.14539](https://arxiv.org/abs/2307.14539); Bailey et al., "Image Hijacks: Adversarial Images can Control Generative Models at Inference Time" — [arXiv:2309.00236](https://arxiv.org/abs/2309.00236); Pang et al., "AnyDoor: Test-Time Backdoor Attacks on Multimodal Large Language Models" — [arXiv:2402.08577](https://arxiv.org/abs/2402.08577). Foundations: Szegedy et al., "Intriguing properties of neural networks" — [arXiv:1312.6199](https://arxiv.org/abs/1312.6199) (ICLR 2014); Goodfellow et al., "Explaining and Harnessing Adversarial Examples" — [arXiv:1412.6572](https://arxiv.org/abs/1412.6572) (ICLR 2015); Madry et al., "Towards Deep Learning Models Resistant to Adversarial Attacks" — [arXiv:1706.06083](https://arxiv.org/abs/1706.06083) (ICLR 2018). Defense: Nie et al., "Diffusion Models for Adversarial Purification" — [arXiv:2205.07460](https://arxiv.org/abs/2205.07460) (ICML 2022).*
