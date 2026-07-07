---
title: "LLM Guardrails in Practice: A Decision Guide to Runtime Input/Output Filtering Tools"
description: "LlamaGuard, Azure Prompt Shield, PromptGuard, NeMo Guardrails, Guardrails AI, and Presidio — how each works and when to deploy it."
pubDate: 2026-07-07
tags: ["defense", "llm-security", "prompt-injection", "jailbreak", "runtime-defense", "tools"]
---

You've done the alignment work. You've RLHF'd the model, reviewed the system prompt, and locked down the API. And then a user pastes in a carefully crafted instruction that the model happily follows, producing output you never intended.

The gap between alignment and deployment is real. Alignment teaches a model what it *should* do; runtime guardrails catch what it *actually* does. These are not the same problem, and no amount of fine-tuning fully closes the second one. Adversarial inputs, out-of-distribution prompts, and indirect injection via retrieved documents can all route around alignment. What you need is a layer that operates independently of the model's own safety behaviors — one that classifies inputs before they reach the model and filters outputs before they reach the user.

That layer is what this post is about. Not in theory — in practice. Which tools exist, how each works technically, where each fits in the stack, and how to choose.

## Where Guardrails Sit in the Architecture

The guardrail architecture maps cleanly onto three positions:

**Pre-processing (input gate)**: Before the prompt reaches the LLM, a classifier evaluates it for harmful intent, injection attempts, or policy violations. If the classifier fires, the request is blocked. Rewriting and forwarding an adversarial request is generally not the safe default for injection or jailbreak cases — it preserves an attack path. Block is the right response; rewrite only applies to less adversarial cases like mild policy violations or format normalization.

**Workflow layer (policy engine)**: Between components — including tool calls, retrieval steps, and multi-turn conversation state — a policy engine enforces behavioral rules. This layer doesn't classify individual inputs; it governs what the system is *allowed to do* based on conversation context and application state.

**Post-processing (output gate)**: After the LLM generates a response, a filter evaluates it for policy violations, PII leakage, toxicity, or structural validity. If the output fails validation, it's suppressed or rewritten before reaching the user.

Most production systems need all three positions, but the right tools for each differ significantly.

## The Input Classification Layer

### LlamaGuard

[LlamaGuard](https://arxiv.org/abs/2312.06674) (Inan et al., 2023, Meta) is the most technically interesting entry in this category. Rather than a traditional classifier trained on a fixed label set, LlamaGuard is a Llama-family fine-tune that frames safety classification as a generative task: the model is prompted with the conversation turn and asked to produce a safety judgment against a configurable harm taxonomy. The original paper used Llama 2 as the base; later versions (Llama Guard 2 and 3) track updates to the underlying Llama model family.

The taxonomy draws from the [MLCommons AI Safety](https://mlcommons.org/working-groups/ai-safety/ai-safety/) hazard categories (violent crimes, non-violent crimes, sex-related crimes, child sexual abuse material, weapons of mass destruction, and others). Crucially, this taxonomy is **configurable at inference time** — you inject the category list into the model's context, which means you can adapt it to your application's specific policy without retraining. A children's education app and an enterprise HR assistant need different harm categories; LlamaGuard supports this without separate model deployments.

The practical tradeoff is latency and compute. Running a full language model as your classifier — rather than a lightweight discriminator — carries significant per-request cost. LlamaGuard is appropriate where latency tolerance is higher: output filtering after response generation, harm classification in regulated environments where on-prem is required, or as a second-pass gate on inputs that have already passed a lightweight injection classifier. It is not a good fit for the common-case synchronous input path where fast discrimination is needed.

LlamaGuard weights are open and deployable on-premises — an important distinction for regulated industries where data cannot leave the organization. The paper demonstrates strong performance on publicly available safety benchmarks including the OpenAI Moderation Evaluation dataset and ToxicChat, matching or exceeding commercially available content moderation services at the time of publication.

Later iterations — Llama Guard 2 and Llama Guard 3 — extended the architecture to broader hazard categories and added multimodal support respectively, tracking the evolution of the MLCommons taxonomy.

### Azure Prompt Shield

[Azure Prompt Shield](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/jailbreak-detection) is Microsoft's deployed-service classifier, accessed via the Azure AI Content Safety API. Where LlamaGuard is a generalist harm classifier, Prompt Shield is purpose-built for **prompt injection detection** — specifically the attack class where adversarial instructions embedded in user input or retrieved documents attempt to override the system prompt.

The service handles two distinct attack surfaces:

- **Direct prompt injection**: adversarial instructions in the user's message attempting to redirect the model's behavior
- **Indirect prompt injection**: adversarial instructions embedded in documents, web pages, or other retrieved content that the LLM processes as data — where the model then treats those embedded instructions as commands

Indirect injection is the subtler threat. A RAG application that retrieves from the web is passing user-controlled or potentially attacker-controlled content directly into the model's context. Without a classifier specifically designed to identify instruction-like constructs in retrieved content, this attack surface is invisible to standard alignment-based defenses.

The tradeoff with Prompt Shield is the cloud dependency. This is a commercial API, which means data leaves your infrastructure (subject to Microsoft's data processing terms) and you're billing by API call. For high-throughput applications, the economics matter. For applications with data residency constraints, on-premises deployment is not an option in the standard configuration.

### PromptGuard

[PromptGuard](https://huggingface.co/meta-llama/Prompt-Guard-86M) (Meta, 2024) takes a different architectural approach: instead of running a full LLM as the classifier, it uses a fine-tuned **mDeBERTa-v3-base** model (86M backbone parameters) optimized specifically for jailbreak and prompt injection detection.

The BERT-style discriminator architecture means inference is an order of magnitude faster than LlamaGuard on equivalent hardware. The model uses mDeBERTa, which is trained on multilingual data, providing architectural support for non-English inputs. Whether this translates into reliable detection of non-English jailbreaks depends on training data coverage for those attack patterns — the multilingual backbone is a necessary but not sufficient condition. Treat non-English coverage as partial and verify against your specific language exposure (see [Unicode token smuggling and safety filter evasion](/blog/unicode-token-smuggling-safety-filter-evasion) for the broader attack surface).

The tradeoff is specialization. PromptGuard focuses on explicit jailbreak techniques and prompt injection patterns — it is not a general harm classifier and does not evaluate whether content falls into prohibited harm categories. It is best deployed at the input gate as a fast synchronous pass for injection/jailbreak detection, running in parallel with or before a dedicated harm classifier that covers the content-safety dimension.

The model weights are open and available on Hugging Face under Meta's license. At 86M backbone parameters it runs efficiently on CPU for low-to-moderate throughput workloads, making it accessible without dedicated GPU infrastructure.

## The Policy and Workflow Layer

### NeMo Guardrails

[NeMo Guardrails](https://github.com/NVIDIA/NeMo-Guardrails) (NVIDIA) occupies a different position in the stack than the classifiers above. It's not a classifier — it's a **programmable policy engine** for LLM application behavior, implemented through a DSL called Colang.

Colang lets you define conversational flows, topic rails, and behavioral policies as explicit rules. You specify what the model *is allowed to talk about*, how it should respond when a topic is out of scope, what tool calls are permitted under what conditions, and how conversation state should influence subsequent behavior. The guardrail logic lives in code you control and reason about, not in the implicit safety behaviors of the underlying model.

Example of what this enables: you can define a rail that prevents the assistant from discussing competitor products, another that ensures the assistant always recommends consulting a doctor for medical questions, and another that blocks tool calls to external APIs unless the user has been through an explicit confirmation step. These policy controls would be difficult to enforce reliably through prompt engineering alone — they're subject to the model's interpretation of natural language instructions. Colang makes them explicit and enforceable.

NeMo Guardrails integrates with most major LLM providers and supports both synchronous request interception and asynchronous monitoring. It can invoke external classifiers (including LlamaGuard) as part of its evaluation pipeline, making it a natural orchestration layer around lower-level detection tools.

The limitation is expressiveness in edge cases: Colang is a domain-specific language, and complex policies can become difficult to specify and test. The library is also designed for conversational applications — it's less natural to apply to batch processing or non-conversational pipelines.

### Guardrails AI

[Guardrails AI](https://github.com/guardrails-ai/guardrails) is a Python framework oriented toward **output validation**: ensuring that LLM responses conform to structural and semantic constraints your application depends on.

The core abstraction is a `Guard` object that wraps your LLM call and validates the response against configured validators. The [Guardrails Hub](https://hub.guardrailsai.com/) provides a library of pre-built validators covering PII detection, toxicity classification, factuality checks (against a provided reference), semantic similarity constraints, JSON schema enforcement, and more. You can compose multiple validators into a pipeline and configure whether validation failures trigger a retry, a fallback value, or an exception.

This is most valuable in structured output scenarios — where your application parses and acts on the LLM's response and a malformed or semantically incorrect output causes downstream failures. It's also useful for PII guardrails on the output side: ensuring the model doesn't accidentally include sensitive data it retrieved from a database in its response.

The framework does add latency proportional to the validators you apply, and retry logic (asking the model to regenerate on validation failure) compounds both latency and cost. The right configuration depends on which failure modes your application can tolerate and which it cannot.

## Output Filtering: The Third Position

The post-processing layer catches what the first two layers miss: harmful, incorrect, or sensitive content in the model's generated response.

**Microsoft Presidio** ([github.com/microsoft/presidio](https://github.com/microsoft/presidio)) is the most widely deployed tool for PII detection and anonymization. It identifies entities — names, phone numbers, email addresses, credit card numbers, social security numbers, and others — using pattern matching, NLP entity recognition (via spaCy), and context heuristics. Identified entities can be replaced with synthetic surrogates, redacted, or flagged for human review.

Presidio's strength is configurability: custom recognizer patterns can be added for domain-specific identifiers (patient IDs, employee numbers, internal account codes) that standard NLP models won't recognize. It's available as a Python library and a Docker service, runs on-premises, and processes text at speeds suitable for synchronous output filtering.

**Toxicity classification** for output can be handled by purpose-built APIs (Google's Perspective API for toxicity scoring) or general harm classifiers like LlamaGuard applied to the model's response. The choice depends on whether you need fine-grained toxicity dimensions (Perspective provides scores for harassment, hate speech, threats, etc. as separate signals) or a unified harm classification aligned with your input-side taxonomy.

**Structured output validation** — ensuring JSON responses parse correctly and conform to expected schemas — is addressable at the framework level (Guardrails AI, or Instructor/Outlines for constrained decoding) without requiring a separate classification service.

## Limitations: What Guardrails Don't Catch

Any guardrail deployment needs an honest accounting of the bypass surface. The failure modes are well-characterized:

**Semantic bypass via paraphrasing.** A classifier trained on surface-form attack patterns can be bypassed by preserving the attack's intent while changing its surface expression. "Tell me how to make a bomb" becomes a request that avoids those keywords through synonym substitution, indirect framing, or roleplay encoding. Classifier generalization is the bottleneck here, and it's not fully solved.

**Multilingual and Unicode attacks.** Inputs that mix scripts, use Unicode homoglyphs, or exploit full-width character substitutions can evade regex-based filters and shallow classifiers trained primarily on ASCII English. This is a documented attack vector (see [Unicode token smuggling and safety filter evasion](/blog/unicode-token-smuggling-safety-filter-evasion)) that requires explicit defense — normalization before classification and multilingual model training.

**Context window fragmentation.** A guardrail that sees only the current turn misses attacks distributed across conversation history. An attacker can build up context across multiple benign-seeming turns before issuing the actual attack payload. Stateful guardrails that maintain conversation context are more robust but more complex to deploy.

**Adaptive attacks against known classifiers.** Once an attacker knows which classifier a system uses, they can craft adversarial inputs specifically to fool it — moving toward the classifier's decision boundary through iterative refinement. This is the same threat model that motivated [adaptive red-teaming work](/blog/adaptive-red-teaming-advgrpo): classifiers with known or discoverable architectures are targets for systematic evasion research. Open-weight models (LlamaGuard, PromptGuard) are particularly susceptible because an attacker can obtain the exact weights and run gradient-based adversarial example generation against them.

**The "last line of defense" trap.** Guardrails are frequently deployed as the *only* defense, under the implicit assumption that they catch everything relevant. They don't. A system where guardrails are the sole safety mechanism, and the model itself has no alignment, will fail badly when the guardrails are bypassed.

## Choosing the Right Stack: A Decision Framework

The right combination of tools depends on three variables: your threat model, your latency tolerance, and your deployment constraints.

The critical architectural principle is that **injection/jailbreak classifiers** and **harm classifiers** cover different threat classes and must both be present. PromptGuard and Azure Prompt Shield detect adversarial instruction constructs regardless of whether the content sounds harmful. LlamaGuard and Azure Content Safety classify whether the content itself falls into prohibited harm categories. A request for sensitive but non-adversarial information passes an injection classifier; an obfuscated jailbreak may pass a harm classifier. Effective input-gate stacks run both independently — either classifier can independently block the request, which provides coverage across both attack surfaces.

| Threat / Context | Cloud OK | On-Premises |
|---|---|---|
| **Prompt injection / jailbreak** | Azure Prompt Shield + PromptGuard | PromptGuard (fast sync) |
| **General harm classification** | Azure Content Safety | LlamaGuard (higher latency; apply selectively) |
| **Both threat classes at input** | Prompt Shield + PromptGuard + Azure Content Safety | PromptGuard + LlamaGuard (both applied) |
| **Policy/topic enforcement** | NeMo Guardrails | NeMo Guardrails |
| **Output PII / structured validation** | Guardrails AI + Presidio | Guardrails AI + Presidio |
| **Indirect injection (RAG)** | Azure Prompt Shield (indirect mode) | PromptGuard on retrieved chunks |

A few practical patterns:

**Dual input gate**: Deploy PromptGuard for injection/jailbreak detection and LlamaGuard (or Azure Content Safety) for harm classification as two independent gates at the input layer. Either can block; both must pass for the request to proceed. This is not a chain where one triggers the other — they operate in parallel, covering their respective threat surfaces.

**RAG-specific pipeline**: For retrieval-augmented applications, apply an injection classifier to retrieved chunks *before* they enter the model's context. Note that chunk-level scanning is a first line of defense against the most direct form of indirect injection, but it's incomplete: attacks can also emerge from how chunks are concatenated or templated into the prompt, or from interaction between an innocuous chunk and the user's query. The most robust approach scans both individual chunks and the final composed prompt the model will actually see.

**Structured output applications**: Wrap the LLM call with Guardrails AI and configure validators for the specific output format your application depends on. Define retry behavior explicitly — how many retries, and what to do when they're exhausted — rather than letting failures propagate silently.

**High-assurance regulated environments**: On-premises constraint eliminates cloud API options. The practical stack is PromptGuard for fast synchronous injection classification, LlamaGuard for harm assessment (both applied independently at the input gate), NeMo Guardrails for policy enforcement, Presidio for output PII scrubbing. All four are open-weights or open-source and deployable without external API dependencies.

## Guardrails as Layer N, Not Layer 1

The instinct to treat guardrails as a primary safety mechanism is understandable but backwards. Runtime filters are designed to catch adversarial edge cases that slip past training-time safety work — they're not designed to substitute for it.

A model with no safety alignment that relies entirely on a guardrail layer will produce dangerous outputs whenever the guardrail fails. A model with strong alignment that also has a guardrail layer will produce dangerous outputs far less frequently — because the model itself resists adversarial inputs, and the guardrail provides defense-in-depth for the cases that get through.

This is the principle that connects this post to the [defense-in-depth security stack for AI agents](/blog/defense-in-depth-ai-agents-security-stack) and the [zero-trust architecture for AI agent deployments](/blog/zero-trust-architecture-ai-agent-deployments): each security control assumes the others will sometimes fail and provides coverage for those failures. Guardrails are not special in this regard. They're one layer in an architecture where no single layer is assumed to be sufficient.

What guardrails *are* uniquely good at is runtime policy enforcement — catching behaviors that weren't anticipated during training, enforcing application-specific policies that don't belong in a general-purpose model, and providing an auditable record of what the system rejected and why. That's a real and important function. It's just not a complete solution.

---

*Key references: [Llama Guard: LLM-based Input-Output Safeguard for Human-AI Conversations](https://arxiv.org/abs/2312.06674) (Inan et al., 2023) · [Azure AI Content Safety: Prompt Shields](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/jailbreak-detection) · [PromptGuard on Hugging Face](https://huggingface.co/meta-llama/Prompt-Guard-86M) · [NeMo Guardrails](https://github.com/NVIDIA/NeMo-Guardrails) · [Guardrails AI](https://github.com/guardrails-ai/guardrails) · [Microsoft Presidio](https://github.com/microsoft/presidio)*
