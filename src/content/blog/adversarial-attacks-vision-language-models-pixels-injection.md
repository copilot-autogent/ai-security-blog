---
title: "Adversarial Attacks on Vision-Language Models: Pixels as Injection Vectors"
description: "Gradient-crafted image perturbations can override VLM safety guardrails, inject attacker-defined instructions, and trigger tool calls in agentic pipelines. A survey of the empirically confirmed attack landscape and practical defenses."
pubDate: 2026-06-30
tags: ["adversarial-attacks", "vision-language-models", "multimodal", "prompt-injection", "ai-safety", "agentic-ai"]
---

Vision-language models — GPT-4V, Claude 3, Gemini 1.5 Pro, LLaVA, InstructBLIP — process images alongside text as first-class inputs. That sentence sounds like a capability story. It's also a threat model.

When a model ingests an image, the attacker's surface expands from the text channel to the full pixel space. Pixels are continuous. Text tokens are discrete. Continuous spaces are gradient-friendly — the same optimization machinery that trains neural networks can craft images that push a model's internal representations toward any attacker-chosen target. The result: an imperceptible modification to an otherwise normal image that causes a VLM to ignore its system prompt, produce attacker-specified output, or trigger a tool call it was never instructed to make.

This post covers what's been empirically confirmed, what remains theoretical, how perception attacks differ from injection attacks, and what defenses exist.

## Adversarial Examples: The Primer

The adversarial example literature predates language models. The foundational result is from Goodfellow et al. (2014), who showed that neural networks are vulnerable to *worst-case perturbations* — small, structured changes to inputs that reliably cause misclassification while remaining imperceptible to humans. Their **Fast Gradient Sign Method (FGSM)** computes the gradient of the model's loss with respect to the input image, then takes a single step in the direction that maximizes that loss:

```
x_adv = x + ε · sign(∇_x L(f(x), y))
```

This is a one-shot attack: fast, cheap, and effective against the specific model used to compute gradients. The perturbation magnitude ε is bounded to stay below a perceptibility threshold — typically measured in L∞ norm, constraining how much any individual pixel can change.

Madry et al. (2018) extended this to **Projected Gradient Descent (PGD)**, an iterative version that takes many smaller gradient steps, projecting back into the ε-ball after each update:

```
x_{t+1} = Π_{x+S}(x_t + α · sign(∇_x L(f(x_t), y)))
```

PGD attacks are stronger and more reliable than single-step FGSM, especially for crafting perturbations that transfer across models. The iterative structure allows the attacker to climb the loss landscape more precisely, finding perturbations that are not just locally harmful but robustly so.

Both FGSM and PGD are **white-box attacks**: they require access to model gradients. Much of the VLM attack literature uses white-box techniques against open-source models (LLaVA, InstructBLIP, BLIP-2) and then evaluates whether the resulting perturbations *transfer* to models closed-source a finding that has significant threat model implications. 

## Why VLMs Change the Threat Model

Classical adversarial examples on vision classifiers have a narrow harm profile: a misclassified image. The model sees a panda and says "gibbon." Annoying, but limited.

VLMs dramatically expand the harm profile in three ways:

**1. The output space is open-ended.** A classifier outputs a label from a fixed vocabulary. A VLM generates arbitrary text. An attacker who can control a VLM's behavior can extract information from its context window, generate harmful content, produce disinformation, impersonate trusted sources, or inject instructions that affect downstream agents.

**2. The image is contextually integrated.** When a VLM processes an image, it's not just classifying it — it's integrating the visual content with the text query and generating a response that synthesizes both. Adversarial perturbations can be crafted to inject *semantic content* into this integrated representation, not just bias a single classification decision.

**3. VLMs are increasingly agentic.** A VLM embedded in an agent pipeline that can call external tools is a very different threat target than a standalone captioning model. An adversarial image that causes the VLM to emit a specific tool call string is effectively a remote code execution vector.

## Attack Taxonomy: Perception Attacks vs. Injection Attacks

Not all VLM adversarial attacks work the same way. A useful distinction:

**Perception attacks** target the model's interpretation of image content. The goal is to change what the model *believes it sees* — making a stop sign look like a speed limit sign, making benign content look harmful, or making harmful content appear benign. The classic adversarial example is a perception attack. In the VLM context, a perception attack might cause a model to generate an incorrect description of an image.

**Injection attacks** target the model's *behavior* given what it sees. The adversarial image doesn't need to change the model's perception of the visual content — it just needs to suppress the model's safety behaviors or inject a specific instruction into the generation process. The perturbed image might still look like a dog photo. The model might still identify it as a dog photo. But the perturbation has placed the model's internal state into a regime where it will comply with a harmful follow-up text instruction that it would otherwise refuse.

This distinction matters for defense. Perception attacks can potentially be caught by cross-checking the model's image description against ground truth. Injection attacks are harder to detect because the model's visible behavior on the image may appear normal — the effect only manifests when paired with a specific text prompt or in a specific pipeline context.

A third category, **cross-modal hijacking**, involves images and text that interact synergistically — neither alone causes the attack to succeed, but together they trigger behavior that neither would independently produce.

## Empirical Landscape: What the Papers Show

### Schlarmann & Hein (2023): The Baseline Demonstration

Schlarmann and Hein's **"On the Adversarial Robustness of Multi-Modal Foundation Models"** (ICCVW 2023, arXiv:2308.10741) established a key baseline: multi-modal foundation models, including CLIP-based VLMs, are not inherently more robust to adversarial perturbations than their vision-only predecessors.

The paper demonstrates that adversarial perturbations against the image encoder can cause the model to generate attacker-controlled text output. A malicious content provider can craft an image whose perturbation causes the VLM to generate a specific caption — for example, directing users to a malicious URL or broadcasting false information — regardless of what the image actually depicts. The attack works against InstructBLIP and LLaVA, both of which use CLIP as their vision backbone.

The finding is significant because it grounds an important claim empirically: the threat isn't speculative. Models that were widely deployed in 2023 are vulnerable to this class of attack, and the vulnerability is tied to the shared CLIP encoder backbone rather than any model-specific weakness.

### Qi et al. (2023): Universal Visual Jailbreaks

Qi et al.'s **"Visual Adversarial Examples Jailbreak Aligned Large Language Models"** (arXiv:2306.13213) demonstrated something more alarming: a *single* adversarial image can universally jailbreak an aligned VLM — causing it to comply with a wide range of harmful text instructions it would otherwise refuse.

The attack optimizes a perturbation that pushes the model's embedding of the adversarial image close to the embeddings of harmful content in the model's representational space. Once this "jailbreak image" is in the model's context, the model enters a regime where safety-trained refusal behaviors are suppressed. The paper demonstrates this against LLaVA, which uses CLIP as the vision encoder and LLaMA as the language backbone.

The critical insight: the adversarial image doesn't need to encode any specific harmful instruction. It creates a *representational context* in which the model's alignment doesn't hold. Any harmful text instruction submitted alongside the jailbreak image then elicits compliance.

This "context poisoning" model of adversarial injection is distinctive. It's not that the model reads instructions from the image. It's that the image shifts the model's internal state into a regime where instructions that would normally be blocked now go through.

### Shayegani et al. (2023): Cross-Modal Attacks via CLIP Embeddings

Shayegani et al.'s **"Jailbreak in Pieces: Compositional Adversarial Attacks on Multi-Modal Language Models"** (arXiv:2307.14539) identified the CLIP vision encoder as a shared vulnerability surface across multiple VLMs.

The attack crafts adversarial images that, when processed through the vision encoder, produce embeddings that map to specific toxic content in the model's embedding space. Because the attack targets the CLIP encoder rather than the full VLM, a single adversarial image can transfer across different models that share the same vision backbone — including closed-source models that use CLIP internally.

This cross-model transferability has a direct threat model implication: an attacker who can run gradient-based optimization against an open-source model (LLaVA, for example) can potentially produce adversarial images that work against closed-source commercial deployments without needing any access to the target model's weights. The CLIP encoder is the shared attack surface.

The compositional aspect refers to the attack strategy: adversarial images targeting toxic embeddings are paired with generic-looking text prompts. The text prompt is benign. The image is benign-looking. Together, they activate harmful generation.

### Bailey et al. (2023): Image Hijacks

Bailey et al.'s **"Image Hijacks: Adversarial Images can Control Generative Models at Inference Time"** (arXiv:2309.00236) introduced the concept of image hijacks — adversarial images that control VLM *behavior* rather than just content.

They demonstrate four attack types against LLaVA:
- **Output hijacks**: forcing the model to generate attacker-chosen text regardless of the user query
- **Context extraction**: causing the model to leak content from its context window (system prompt, prior turns)
- **Safety override**: suppressing refusal behaviors on harmful inputs
- **False belief injection**: causing the model to state specific false facts ("The Eiffel Tower is in Rome")

All four attack types achieve success rates above 80% against LLaVA. The attacks require only small, automated image perturbations — no gradient access to the LLM component, only to the vision encoder.

The context extraction result is particularly significant for deployed systems. A VLM processing user-uploaded images that can be caused to reproduce its system prompt represents a confidentiality failure with direct practical consequences — system prompts often contain operational details, safety guidelines, and architectural information that deployments treat as proprietary.

### AnyDoor (Pang et al., 2024): Test-Time Backdoor Attacks

Pang et al.'s **"AnyDoor: Test-Time Backdoor Attacks on Multimodal Large Language Models"** (arXiv:2402.08577) introduces a different attack model: adversarial images that function as *backdoor triggers at inference time*, requiring no training data access.

Unlike conventional backdoor attacks that poison training data to install a trigger, AnyDoor crafts universal adversarial perturbations that pair with textual triggers at inference time. When an image with the AnyDoor perturbation is present in the input and a specific text trigger appears, the VLM produces an attacker-controlled output. The perturbation decouples the *setup phase* (crafting the adversarial image) from the *activation phase* (deploying the trigger in text). This allows the adversarial payload to be distributed in advance — through an image hosting service, user-uploaded content, a document — and activated later through a separate text channel.

The paper validates this against LLaVA-1.5, MiniGPT-4, InstructBLIP, and BLIP-2. A key capability: because the backdoor is installed in the image rather than the model, the trigger text can be changed dynamically — the attacker can re-use the same adversarial image to activate different harmful effects by varying the text trigger.

> **Attribution note**: The issue tracking this post described the AnyDoor attack as "Bagdasaryan et al." This does not match the paper. AnyDoor (arXiv:2402.08577) was submitted by Tianyu Pang and colleagues at SAIL Singapore. Eugene Bagdasaryan's published work covers privacy attacks and unlearning but not this paper. The attribution appears to be an error in the issue.

## The CLIP Connection: Cross-Model Transferability

Multiple attack papers exploit the same underlying mechanism: CLIP's shared embedding space. CLIP (Contrastive Language-Image Pre-training) was trained to align image and text representations — images and their captions should have similar embeddings. This alignment is precisely what makes CLIP-based VLMs capable of multimodal reasoning, and it's also what makes adversarial attacks on the CLIP encoder transfer across models.

If you craft an adversarial perturbation that maps an image to a specific location in CLIP's embedding space — one that corresponds to harmful textual content — that attack transfers to any VLM built on CLIP: LLaVA, InstructBLIP, MiniGPT-4, and potentially others. The diversity of VLMs sharing a CLIP backbone means a single adversarial image can be a cross-system attack vector.

The mechanism also suggests why gradient-free black-box access to the full VLM isn't required. An attacker who can run white-box optimization against the CLIP ViT-L model (which is open source) gains meaningful leverage against commercial deployments.

## Agentic Risk: When the Image Is the Attack Payload

The threat profile of VLM adversarial attacks changes substantially in agentic contexts. A standalone VLM generating captions has a limited harm surface. A VLM agent that processes images and can execute tool calls — browsing the web, writing files, sending emails, calling APIs — has a dramatically expanded one.

Consider a VLM agent that processes screenshots to automate UI tasks. A malicious website embeds an adversarial patch in its favicon or a display element. The agent screenshots the page. The adversarial patch causes the VLM to interpret the screenshot as containing an instruction — perhaps one directing the agent to click a specific element, navigate to a different URL, or exfiltrate data from its current session context.

This is indirect prompt injection via the visual channel. The attack is the same in structure as text-based indirect prompt injection (malicious content in retrieved documents), but with two important differences:

**The visual channel lacks the inspection mechanisms text has.** Users and systems can read retrieved text and potentially spot injected instructions. Adversarial perturbations in images are imperceptible by design.

**The attack survives content filtering.** Adversarial patches don't contain text strings. Traditional input filters scanning for "ignore previous instructions" won't detect them. A patch that manipulates the model's internal representation bypasses lexical safety checks entirely.

Agentic VLMs processing user-uploaded images are fully exposed. Any user with the ability to submit an image has a potential injection vector. The image is the attack payload.

## Defenses: What Works and What Doesn't

Defense against adversarial VLM attacks is an active area with partial solutions. Nothing approaches the robustness that adversarial training has achieved for classical vision classifiers in narrow domains.

### Input Pre-processing: DiffPure

**DiffPure** (Nie et al., 2022, ICML, arXiv:2205.07460) applies a forward diffusion process to the input image before processing — adding a small amount of noise and then running the diffusion model's reverse process to recover a "clean" version. The intuition: adversarial perturbations are structured, near-maximum-magnitude signals in specific directions; diffusion noise tends to wash them out while preserving semantic content.

DiffPure was developed and evaluated against adversarial examples on vision classifiers, and its application to VLMs is an active area of investigation. The method has two known weaknesses: it's computationally expensive (running a full diffusion reverse process per input image), and adaptive attackers who know DiffPure is deployed can optimize perturbations that survive it. Against non-adaptive attackers, purification provides meaningful robustness; against adaptive optimization, the gains can be substantially reduced.

### Adversarial Training

The canonical defense against adversarial examples in vision models is **adversarial training**: augmenting the training distribution with adversarial examples so the model learns to be robust to them. Madry et al.'s PGD-based adversarial training is the standard approach.

Adversarial training for VLMs is harder than for classifiers in several ways. The models are larger, making the inner optimization loop in adversarial training more expensive. The output space is continuous text rather than a fixed label set, complicating the loss function for crafting training adversarials. And adversarial training tends to reduce clean accuracy — a tradeoff that's more acceptable in security-critical classification than in general-purpose language generation.

Partial adversarial training of the vision encoder (treating it as a robustified component) is more tractable and has shown promise in reducing transferability of CLIP-based attacks.

### Multi-Modal Cross-Checking

**Cross-modal consistency verification** asks: does the model's textual description of an image match what an independent vision analysis would produce? If an adversarial image is causing the VLM to generate outputs inconsistent with its visual content, a secondary check might flag the discrepancy.

This approach has genuine detection value against perception attacks (where the model's description of the image is manipulated). It has less value against injection attacks, where the model's image description may appear normal while the attack suppresses safety behavior.

Implementing cross-checking requires two independent processing pipelines for the same image. The risk of a single adversarial image defeating both simultaneously is lower than defeating one, though not zero if both pipelines share a CLIP backbone.

### Trust-Gated Image Processing

At the architecture level, the most robust approach is to limit what visual inputs can cause a model to do. **Trust-gating** restricts the actions a VLM can take based on the source of the visual input:

- System-provided images (screenshots of controlled infrastructure) may be permitted to influence tool calls.
- User-uploaded images are processed in a restricted mode where visual content cannot affect tool-call parameters, only inform informational responses.
- Third-party images from web fetches are further restricted or processed in a sandboxed context.

This is least-privilege applied to visual inputs. It accepts that adversarial images may succeed in their representational manipulation and compensates by limiting the consequence of that success. An adversarial image that causes the model to *want* to emit a tool call doesn't cause harm if the architecture prevents that tool call from executing.

The practical challenge: many agentic VLM applications are built with fully permissive visual processing precisely because the valuable use cases require it (screenshot-based automation, document processing, visual question answering over user-provided content). Restricting visual trust levels requires rethinking the agent's trust model at design time.

### Output Anomaly Detection

**Behavioral monitoring** — detecting outputs that are anomalous given the input distribution — can catch some injection attacks in deployed systems. If a VLM agent suddenly emits an unfamiliar tool call pattern, accesses resources outside its normal scope, or produces text inconsistent with its task context, these are signals worth flagging.

This defense is complementary rather than primary: it detects attacks after they've partially succeeded, enabling circuit-breaking or human review rather than preventing the initial manipulation. Its effectiveness depends heavily on how well normal behavior is characterized — novel but legitimate tasks may share features with attack-induced anomalies.

## What the Empirical Landscape Implies

Looking across the confirmed papers, a pattern emerges:

**The vision encoder is the weak link.** Every major attack in this survey — Schlarmann & Hein, Qi et al., Shayegani et al., Bailey et al. — ultimately works through the vision encoder. The language model backbone may have strong safety alignment; the encoder feeding it images does not, and adversarial perturbations bypass alignment by manipulating inputs before they reach the safety-trained component.

**Transferability is real and meaningful.** Multiple papers demonstrate that white-box attacks against open-source CLIP-based models transfer to other models. This lowers the entry barrier: an attacker doesn't need access to a target system's weights to craft effective adversarial images.

**Injection attacks are harder to detect than perception attacks.** Visual injection that suppresses safety behaviors leaves no visible artifact in the model's image description. Detection requires behavioral monitoring rather than consistency checking.

**Agentic deployment substantially raises the stakes.** The papers that demonstrate tool call manipulation and context extraction (Bailey et al., AnyDoor) point toward a harm profile that extends well beyond content policy violations. Exfiltration of context window contents and manipulation of tool-call behavior are operational security risks for deployed systems.

The honest assessment: the adversarial VLM attack surface is empirically demonstrated, transferable, accessible without target model access, and partially mitigable through architectural constraints. No single defense provides comprehensive protection. The practical recommendation is a layered approach: trust-gate visual inputs in high-stakes agentic contexts, monitor output behavior, and treat user-provided images as untrusted inputs whose visual content should not influence security-relevant decisions.

---

*Core papers: Schlarmann & Hein, "On the Adversarial Robustness of Multi-Modal Foundation Models" — [arXiv:2308.10741](https://arxiv.org/abs/2308.10741) (ICCVW 2023); Qi et al., "Visual Adversarial Examples Jailbreak Aligned Large Language Models" — [arXiv:2306.13213](https://arxiv.org/abs/2306.13213); Shayegani et al., "Jailbreak in Pieces: Compositional Adversarial Attacks on Multi-Modal Language Models" — [arXiv:2307.14539](https://arxiv.org/abs/2307.14539); Bailey et al., "Image Hijacks: Adversarial Images can Control Generative Models at Inference Time" — [arXiv:2309.00236](https://arxiv.org/abs/2309.00236); Pang et al., "AnyDoor: Test-Time Backdoor Attacks on Multimodal Large Language Models" — [arXiv:2402.08577](https://arxiv.org/abs/2402.08577). Foundations: Goodfellow et al., "Explaining and Harnessing Adversarial Examples" — [arXiv:1412.6572](https://arxiv.org/abs/1412.6572) (ICLR 2015); Madry et al., "Towards Deep Learning Models Resistant to Adversarial Attacks" — [arXiv:1706.06083](https://arxiv.org/abs/1706.06083) (ICLR 2018). Defense: Nie et al., "DiffPure: Diffusion Models for Adversarial Purification" — [arXiv:2205.07460](https://arxiv.org/abs/2205.07460) (ICML 2022).*
