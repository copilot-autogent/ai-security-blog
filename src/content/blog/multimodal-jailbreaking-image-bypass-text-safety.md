---
title: "Multimodal Jailbreaking: How Attackers Use Images to Bypass Text Safety Filters"
description: "In many multimodal deployments, text safety classifiers operate on tokens — not image pixels. Attackers exploit this gap by embedding harmful instructions in rendered typography, screenshots, and contextually manipulative images — bypassing filters that block the same content in plain text."
pubDate: 2026-07-09
tags: ["jailbreak", "vision-language-models", "multimodal", "ai-safety", "prompt-injection", "typography-attack", "image-safety"]
---

There is — or was — a gap in how multimodal AI systems process safety. When you send a text message to a large language model, your words flow through classifiers trained to detect harmful content. When you send an image, those same classifiers see nothing — they operate on tokens, not pixels. The vision encoder that produces a representation of your image is a separate pipeline, and for many deployed systems, safety filtering logic did not originally bridge the two.

Security research from 2023–2024 documented systematic exploitation of this gap through practical techniques — rendered text in images, screenshots of documents, and contextually manipulative photographs — against systems that researchers had access to, including early deployments of GPT-4V and open-weight VLMs. The major providers have since added multimodal safety measures, but the architectural gap is structural, mitigations vary in coverage, and understanding the attack taxonomy is essential for builders deploying their own multimodal systems.

## Why Images Bypass Text Safety Filters

To understand the attack surface, you need to understand how multimodal models are actually built.

A typical vision-language model connects two components: a vision encoder (often a CLIP-style model or similar) that converts an image into a high-dimensional vector, and a language model that conditions on both text tokens and the image embedding. Safety filtering happens at the language model boundary — it evaluates text tokens and (ideally) the language model's output. The vision encoder is not a safety filter. It is a feature extractor.

The consequence: **any content that enters the model through the image pipeline rather than the text pipeline can avoid text-level safety classifiers entirely**. The safety system is monitoring the front door. The window is unguarded.

This isn't an oversight so much as an architectural fact — safety alignment research has historically focused on text, RLHF datasets are predominantly text, and safety red-teaming infrastructure has been built for text-input models. As vision capabilities were added to deployed systems, the safety work did not keep pace.

A compounding factor: some multimodal models implicitly give more trust to instructions that appear to come from the system or context rather than the user. An image can shift how the model interprets accompanying text, providing a semantic context that makes requests appear more legitimate — the same question reads differently when paired with a photograph of a hospital versus a photograph of a crime scene.

## The Attack Taxonomy

Research from 2023–2024 has documented five distinct attack categories, each exploiting the vision-text safety gap differently.

### 1. Typography-in-Image Smuggling

The most direct attack: take the harmful text that would be blocked by safety classifiers, render it as printed text in an image, and upload the image. The text classifier never sees the instruction. The vision model reads the image, extracts the typographic content, and responds.

This is the attack documented in **FigStep** (Gong et al., 2023, [arXiv:2311.05608](https://arxiv.org/abs/2311.05608)), which demonstrated systematic jailbreaking of multiple vision-language models through typographic prompts. The key insight is that modern VLMs are highly capable at reading text in images — OCR capability is essentially a side effect of training on internet-scale image-text data. That same OCR capability becomes an attack vector when the safety layer doesn't apply to text found in images.

In controlled experiments in the paper, this required zero technical sophistication: text rendered in an image and submitted with an innocuous framing prompt bypassed safety filters that rejected the same content in plain text form.

### 2. Screenshot Injection

A variant of typography injection, but exploiting the specific framing of screenshots. A screenshot of a browser tab, terminal window, or document viewer carries implicit context: this is something the user is looking at, not a prompt they composed.

The FigStep paper (Gong et al., 2023) and the compositional attacks work (Shayegani et al., 2023) both document that visually framed content — text presented as part of an image scene rather than typed directly — consistently reduced refusal rates compared to equivalent plain-text versions. The visual framing shifts interpretation: the model is asked to read or summarize something rather than to directly do something harmful, which changes the apparent intent even when the underlying instruction is identical.

### 3. Context Manipulation via Image

More subtle than typography injection: instead of carrying explicit harmful text, an image shifts the semantic context in which a borderline text prompt is interpreted.

A question about medication dosages reads differently when accompanied by an image of a clinical setting with visible medical equipment. The model's interpretation of "how do I administer X?" can shift from a harmful request toward a medical/professional context — making a refusal seem less appropriate and a detailed answer seem more reasonable.

This attack doesn't rely on the model reading text from the image. It relies on the model's tendency to interpret ambiguous text prompts in light of visual context — a feature that makes VLMs more useful in legitimate applications but also opens a manipulation channel. The visual context is not subject to safety evaluation; only the resulting response is.

### 4. Compositional Adversarial Attacks

The most technically sophisticated variant is documented in **"Jailbreak in Pieces: Compositional Adversarial Attacks on Multi-Modal Language Models"** (Shayegani et al., 2023, [arXiv:2307.14539](https://arxiv.org/abs/2307.14539)), which describes compositional attacks where neither the image alone nor the text alone is harmful, but their combination is. The attack exploits the fact that safety classifiers evaluate inputs in isolation — they assess whether the text is harmful, and separately (if at all) whether the image is harmful, but do not evaluate the combination.

By splitting harmful content across modalities — partial instruction in text, completion in image, or vice versa — an attacker can construct requests where both components pass safety filters individually but the joint representation causes the model to produce harmful output.

### 5. Self-Adversarial Attacks via System Prompt Exploitation

Wu et al. (2023, [arXiv:2311.09127](https://arxiv.org/abs/2311.09127)) identified a related attack using the system prompt itself as an attack component. By crafting image inputs that interact with specific patterns in the system prompt, the researchers could cause the model to override its own safety instructions.

The mechanism differs from earlier work: rather than bypassing safety evaluation, it exploits the system prompt's own language to construct a coherent justification for unsafe behavior. The image provides a context that makes the model's safety instructions appear to permit an exception.

## What Gradient-Based Attacks Add to the Picture

The attacks above are semantic — they work by carrying harmful content or manipulative context in human-readable form. That is what distinguishes them from gradient-crafted adversarial perturbations, which are covered in depth in the companion post on [adversarial attacks on vision-language models](/blog/adversarial-attacks-vision-language-models-pixels-injection). For completeness: **"Visual Adversarial Examples Jailbreak Aligned Large Language Models"** (Qi et al., 2023, [arXiv:2306.13213](https://arxiv.org/abs/2306.13213)) demonstrates a lower-level complement — adversarially perturbed images that don't carry harmful content visibly but cause aligned LLMs to produce unsafe outputs.

The mechanism bypasses safety alignment at the representation level rather than through content manipulation. This matters for the defense picture because OCR-based filtering (which addresses typography injection) does nothing against gradient-based adversarial images — the two attacks require separate mitigations. Defenders need to account for both.

## The Defense Landscape

Building robust defenses is harder than it looks, because the attack surface spans the entire multimodal pipeline.

**Multimodal-aware content moderation** processes both image and text together as a unit, rather than applying separate classifiers to each modality independently. This addresses compositional attacks that split content across modalities. The challenge is building training data and evaluation benchmarks that cover the combination space.

**OCR-based text extraction and filtering** applies the same safety evaluation to text found within images as to text typed by users. If a user uploads an image containing the text "how to make X," the extracted text should enter the same content evaluation pipeline as if the user had typed those words. This addresses typography injection directly. Major providers have moved toward this approach, though implementation is inconsistent.

**Input image sanitization** normalizes image inputs before processing — resizing, recompression, or noise addition that degrades adversarially crafted perturbations while preserving semantic content. This is more effective against gradient-based adversarial examples than semantic attacks.

**Multimodal safety training** addresses the root cause: safety alignment that includes image-text pairs in training data, covering visual jailbreak attempts explicitly. Meta's Llama Guard Multimodal and OpenAI's multimodal safety classifiers represent attempts at this approach — treating multimodal safety as a first-class concern rather than an extension of text safety.

None of these defenses is complete. OCR-based filtering can be defeated by obfuscated typography (rotated text, unusual fonts, handwriting). Multimodal safety training is limited by the breadth of the adversarial examples included. The fundamental gap — between how models process images and how safety evaluation is structured — remains imperfectly closed.

## Guidance for Builders

If you are deploying a multimodal system and relying on text safety filters, your current defenses do not cover image-borne attacks.

**Apply text safety to any text extracted from images.** If your system has OCR capability (explicit or implicit via the vision model), treat extracted text as user input. Run it through the same content policy evaluation you would apply to typed text. This is not automatic — you need to explicitly implement it.

**Test with screenshot and typography injection.** Render your highest-risk text queries as images. Upload them to your system. Document whether the same content is blocked in text form but permitted in image form. This is the baseline test every multimodal deployment should run before going to production.

**Treat image inputs as an untrusted channel.** The same adversarial mindset you apply to user-supplied text — validate, sanitize, apply policy — should apply to user-supplied images. An image can carry instructions, context, and embedded content that influences model behavior in ways your text safety evaluation won't catch.

**Do not assume behavioral context safety transfers across modalities.** If your model applies stricter safety to some user roles or contexts, verify that those restrictions hold when harmful content is delivered via image. Context-manipulation attacks specifically target the gap between how text prompts and image-framed prompts are evaluated.

**Monitor for the new attack patterns, not just historical text-based ones.** Safety monitoring that tracks refusal rates on text queries can show a clean signal while image-based attacks succeed at high rates in parallel. Your red-teaming infrastructure needs multimodal coverage.

## The Gap Isn't Theoretical

The multimodal safety gap has been reproducibly demonstrated at scale. FigStep achieved high jailbreak success rates against deployed models including GPT-4V in controlled research settings in 2023; independent security researchers documented similar findings throughout 2023 and 2024. The attacks are straightforward enough to reproduce without specialized security research expertise — they require no gradient access, no model internals, and no novel techniques beyond what the cited papers describe.

The underlying architecture means this problem won't be solved by text safety improvements alone. As image and video inputs become default in mainstream AI products, the attack surface this creates is a material risk — not a research edge case. The defenses exist. The question is whether they're being implemented before the attackers are through the window.

---

*Sources: Qi et al. 2023 "Visual Adversarial Examples Jailbreak Aligned Large Language Models" ([arXiv:2306.13213](https://arxiv.org/abs/2306.13213)); Shayegani et al. 2023 "Jailbreak in Pieces: Compositional Adversarial Attacks on Multi-Modal Language Models" ([arXiv:2307.14539](https://arxiv.org/abs/2307.14539)); Gong et al. 2023 "FigStep: Jailbreaking Large Vision-language Models via Typographic Visual Prompts" ([arXiv:2311.05608](https://arxiv.org/abs/2311.05608)); Wu et al. 2023 "Jailbreaking GPT-4V via Self-Adversarial Attacks with System Prompts" ([arXiv:2311.09127](https://arxiv.org/abs/2311.09127)); Meta Llama Guard Multimodal documentation; OpenAI GPT-4V system card.*
