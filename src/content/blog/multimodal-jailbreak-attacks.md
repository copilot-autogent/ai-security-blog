---
title: "Beyond Text: How Simple Perceptual Tricks Break Multimodal AI Safety"
description: "A systematic study of multimodal jailbreaks shows that models with near-perfect text-only safety can be compromised with >75% success rates using basic image and audio transformations — no gradient access required."
pubDate: 2026-06-19
tags: ["jailbreak", "vision-language-models", "multimodal", "ai-safety", "adversarial-attacks", "red-teaming"]
relatedPosts: ["crescendo-multi-turn-jailbreaks-stateful-conversation-attacks", "multimodal-jailbreaking-image-bypass-text-safety"]
---

There's a test most frontier AI models pass with flying colors: throw harmful text prompts at them and measure how often they comply. For most leading models, the answer is essentially never — text-based safety alignment has gotten very good.

Then researchers from Enkrypt AI asked a different question: what happens when you encode that same harmful content as an image or audio clip?

The answer, documented in **[arXiv:2510.20223](https://arxiv.org/abs/2510.20223)** ("Beyond Text: Multimodal Jailbreaking of Vision-Language and Audio Models through Perceptually Simple Transformations"), is alarming. Models with 0% attack success rates on text can be broken at rates exceeding **75%** — using techniques that require no gradient access, no model internals, and minimal technical expertise.

## The Core Finding: Safety Alignment Doesn't Generalize Across Modalities

Current safety alignment is predominantly text-centric. RLHF, Constitutional AI, and most red-teaming infrastructure operate on text. The implicit assumption is that the same safety knowledge transfers when the model gains the ability to process images and audio.

This paper demonstrates that assumption is wrong.

The study's design makes the point precisely. By testing the *same harmful prompts* in both text form and as transformed images or audio, the researchers isolate the modality transfer effect. A prompt that triggers a refusal as text, when converted to an image and passed through a simple visual transformation, elicits a compliant, harmful response at rates that would be unacceptable in any safety evaluation context.

The gap between text-only safety and multimodal safety isn't a marginal performance delta — in many cases it's the difference between 0% and 89% attack success.

## The Attacks: Perceptually Simple, Surprisingly Effective

The paper tests three visual attack strategies and six audio perturbation methods. None require white-box access to model weights.

### Visual Attacks

**FigStep** converts harmful text into a typographic image — the words rendered as text in a picture rather than passed as a string. The model reads the image rather than parsing text, sidestepping the token-level filters that block the text variant.

**FigStep-Pro** extends this with a step designed to evade OCR-based detection: harmful keywords are decomposed into visually separated sub-images, exploiting how sequential visual processing reconstructs meaning from fragments. This technique achieves up to **89% attack success rate (ASR) on CBRN content against Llama-4 models**.

**Intelligent Masking** takes a different approach. Rather than rendering the entire prompt as an image, it extracts the toxic phrase and embeds it in a typographic image, while the text prompt contains a `<MASK>` placeholder. The text prompt looks benign; the harmful content arrives via the visual channel. This achieves comparable effectiveness — particularly against GLM-4.5V and GPT-4o — revealing that safety failures aren't tied to one specific visual technique but reflect a broader gap in cross-modal processing.

### Audio Attacks

The audio attack surface shows a different vulnerability profile. The pipeline first converts adversarial text to speech using Kokoro-82M (a neural TTS model), then applies signal-level perturbations. The evaluation covers six conditions: a **Basic Audio** baseline (untransformed TTS), plus five perturbation methods — **Wave-Echo** (delayed signal overlay), **Wave-Pitch** (frequency modification), **Wave-Speed** (temporal rate adjustment), **Wave-Volume** (amplitude change), and **Wave-Multi** (combined transforms applied jointly).

The headline result for audio is striking: **Wave-Echo achieves 75.0% ASR against Gemini-2.5-Flash and 74.0% against GPT-4o-Audio on CBRN content**. These are models from providers with mature safety programs, tested against content in one of the highest-risk categories.

Wave-Pitch and Wave-Volume show similar patterns. The semantics of the audio remain intact — a human would hear the same content whether or not the pitch was shifted by a few semitones — but the model's safety mechanisms don't generalize to this small distributional shift.

## Scale and Scope of the Evaluation

The evaluation is structured to avoid cherry-picking:

- **1,900 adversarial prompts** across three harm categories
- **Three harm categories**: general harmful content, CBRN (Chemical, Biological, Radiological, Nuclear), and CSEM (Child Sexual Exploitation Material)
- **Seven frontier models**: Llama-4 Maverick, Llama-4 Scout, GLM-4.5V, GPT-4o (vision), and GPT-4o-Audio, Gemini-2.5-Flash, Gemini-2.5-Pro (audio)
- Automated evaluation pipeline using GPT-4.1 as judge: responses are first classified into one of 12 response categories (e.g., refusal, partial compliance, explicit harmful content), then a binary appropriate/inappropriate label is applied

Testing across all three harm categories is worth noting. CBRN and CSEM represent the highest-stakes content — the categories where false negatives have the most serious real-world consequences. The paper explicitly chose these categories because safety failures there matter most.

## Per-Model Results: What the Numbers Show

The variation across models tells a more nuanced story than "all models are equally broken."

**Llama-4 variants (Maverick and Scout)** show the most severe vulnerabilities in the visual attack category. FigStep-Pro achieves up to 89% ASR on CBRN content — the highest rate observed in the study. This is particularly notable because Llama-4 models are positioned as models with strong safety alignment. The gap between their text-only performance (near 0% ASR) and their multimodal performance (up to 89%) is the starkest illustration of the modality transfer problem.

**GLM-4.5V and GPT-4o** show lower peak ASRs in the visual domain (17–24% for CBRN), but the authors note this may reflect conservative response generation that reduces utility, not necessarily genuine robustness. Whether a model that says "I cannot process this image" is safer than one that complies is debatable — but that lower observed ASR does suggest some resistance, or at minimum a different failure mode.

**Gemini-2.5-Pro** shows striking vulnerability to audio attacks specifically in the CSEM category: Wave-Speed achieves 63.3% ASR, Wave-Volume 56.7%. By contrast, Gemini-2.5-Flash and GPT-4o-Audio maintain stronger defenses for that category (below 25%). This provider-specific variation suggests that audio safety training methodologies differ substantially between Google and OpenAI, and that neither has identified a reliably effective approach.

## Why This Is a Structural Problem

The attacks in this paper succeed not because they're technically sophisticated — they succeed because they shift harmful content to a channel that safety training didn't cover.

This reveals a fundamental architectural mismatch. Safety alignment operates primarily at the semantic level in text space. When you add an image encoder or an audio encoder that converts those modalities into intermediate representations, there's an implicit assumption that harmful content in image or audio form will map to the same representation space where safety is enforced. The paper's results suggest this assumption doesn't hold.

The two-stage processing pipeline is the likely mechanism: (1) the model reads the image or audio and extracts text-equivalent content; (2) the model processes that extracted content in language space. If the extraction step doesn't trigger safety checks, and the resulting extracted text is processed without the guards that would activate on equivalent text input, the pipeline fails.

Intelligent Masking demonstrates this most clearly. The model sees a benign text query and an image containing a toxic phrase. The image-to-text extraction step needs to identify and integrate the masked term — and that extraction step apparently bypasses the safety checks that would fire if the term appeared in the text query directly.

## Accessibility: Why Threat Models Need Updating

A consistent emphasis throughout the paper is the **accessibility** of these attacks. No gradient access. No model internals. Free TTS software. Basic image editing tools. Publicly documented techniques.

This is not a sophisticated APT-level threat. The paper describes a threat model where anyone with moderate technical literacy can execute effective multimodal jailbreaks against frontier models. The barrier to exploitation is lower than the barrier to defense.

That asymmetry matters for how organizations deploy these models. If your threat model for MLLM misuse assumed attacks would require substantial ML expertise, this paper updates that estimate substantially downward.

## Toward Multimodal Safety: What Would Actually Help

The paper proposes that robust multimodal safety requires a **paradigm shift toward semantic-level reasoning** — moving safety checks from the token level in text space to a representation level that spans modalities. Rather than filtering after each modality-specific encoder, safety checks need to operate on unified semantic representations that catch harmful content regardless of its input channel.

Practically, this might mean:

- **Cross-modal consistency checks**: Evaluate whether image and audio inputs, when converted to text, would trigger safety responses if submitted directly as text.
- **Modality-aware red-teaming as a standard practice**: Safety evaluations need to include visual and audio attack surfaces, not just text — and specifically need to test the same harmful prompts in all formats.
- **Semantic-level safety alignment**: RLHF and similar techniques need to train on multimodal examples, not just text. Safety behaviors learned exclusively from text don't generalize to other input channels by default.

The authors also note that simply blocking all edge cases would degrade model utility — the challenge is building safety mechanisms that are robust to perceptual transformations while remaining functional. That's a harder problem than text-only alignment, and the field doesn't appear to have a solved approach yet.

## What Practitioners Should Take Away

If you're deploying or evaluating multimodal language models, this paper has several direct implications:

**Don't use text-only red-teaming results to evaluate multimodal safety.** A model that passes text-based evaluation at 0% ASR may still be vulnerable to visual and audio jailbreaks at rates above 75%. These are different threat surfaces and need separate evaluation.

**Be especially cautious with models deployed in high-stakes domains.** CBRN content — chemical, biological, radiological, nuclear — showed the highest attack success rates in this study. If your application touches medical, research, or technical domains, multimodal inputs represent a significantly elevated risk profile.

**Assume the attack bar is low, not high.** The threat model demonstrated here is accessible to non-experts. Internal red-teaming programs should include participants who don't have ML backgrounds, specifically to probe whether basic perceptual tricks can cause failures that trained researchers might not think to test.

**Provider variation is real.** Gemini-2.5-Pro's audio vulnerability profile differs substantially from GPT-4o-Audio's. If your deployment switched providers, your effective safety posture may have changed even if the model tier looks equivalent. Verify, don't assume transferability.

## The Bottom Line

The alignment field has spent years hardening text-based safety. This paper documents that safety failing across a clear and accessible attack surface. The techniques are simple enough to reproduce from the paper's description. The effectiveness against frontier models from major providers — at scales of 75–89% attack success — suggests the multimodal safety gap is systemic, not an edge case.

The fundamental problem is that safety alignment optimized for text does not automatically generalize to images and audio. Until that gap closes, multimodal AI systems carry a meaningful security gap that practitioners need to account for in how they deploy, monitor, and evaluate these systems.

---

*Paper: "Beyond Text: Multimodal Jailbreaking of Vision-Language and Audio Models through Perceptually Simple Transformations" — [arXiv:2510.20223](https://arxiv.org/abs/2510.20223). Divyanshu Kumar, Shreyas Jena, Nitin Aravind Birur, Tanay Baswa, Sahil Agarwal, Prashanth Harshangi (Enkrypt AI). October 2025.*

*Note: The issue tracking this post referenced arXiv:2604.20145, which resolves to a different paper (BigQuery cost prediction). This post covers the paper that matches the issue description — multimodal jailbreak attacks with cross-modal transferability — which is arXiv:2510.20223.*
