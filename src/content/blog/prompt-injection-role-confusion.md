---
title: "Prompt Injection as Role Confusion: Why LLMs Trust Style Over Role Tags"
description: "New research reveals LLMs identify roles from writing style rather than structural tags — making the system role tag a suggestion, not a security boundary. Destyling adversarial text drops attack success from 61% to 10%. Here's what that means for defenders."
pubDate: 2026-06-28
tags: ["prompt-injection", "jailbreaking", "defense-patterns", "llm-security", "agent-security"]
---

When a large language model receives a message, it sees a single continuous string of tokens: system prompt, user input, tool outputs, prior reasoning, all concatenated together. The structure we impose on that string — `<system>`, `<user>`, `<tool>`, `<think>` — is supposed to tell the model how to treat each segment. System instructions carry authority. Tool outputs are data to act on, not commands to follow. The model's own reasoning is private, trusted by default. (Not all deployments serialize private CoT back into the context window verbatim, but in those that do — and in systems with visible reasoning traces — this structure is the operative one.)

New research from Charles Ye, Jasmine Cui, and Dylan Hadfield-Menell — published at [role-confusion.github.io](https://role-confusion.github.io/) — presents a rigorous empirical challenge to that assumption. Their finding is uncomfortable: **LLMs do not primarily identify roles from structural tags. They identify them from writing style.** When style and tags disagree, style wins. This is not a quirk in a specific model — it generalizes across architectures. And it explains, at a mechanistic level, why prompt injection is so persistent.

## How Roles Work — and How They Fail

The researchers developed *role probes*: linear classifiers trained to measure, on a per-token basis, how strongly a model's internal representation believes a given token belongs to a particular role. They call the key metrics **CoTness** (how much the model internally treats a token as its own reasoning) and **Userness** (how much it treats a token as a user command).

The experimental design is elegant and devastating. Take a neutral piece of text — the same sentence — and run three conditions:

1. **Correct tags**: wrap reasoning-style text in `<think>` tags, everything else labeled correctly
2. **No tags**: strip all role tags, leaving the raw text
3. **Wrong tags**: wrap everything in `<user>` tags, contradicting the content's actual character

In condition 1, reasoning text has high CoTness as expected. In conditions 2 and 3, the result should differ significantly — you've either removed the tag signal entirely or inverted it. But it doesn't. The former-reasoning text registers nearly the same high CoTness whether it's correctly tagged, untagged, or explicitly mislabeled as user input.

The implication: the model has learned a single feature that means "this is my reasoning," and *both structural tags and reasoning-like style activate it*. More precisely, style and tags project to the same internal direction — but style does so more strongly, and thus wins when they conflict.

The researchers describe this plainly: "LLMs identify roles from an insecure feature (style). This is like identifying a stranger's profession from how they talk and dress rather than by checking their ID. Usually everything agrees, so this works fine. But when attackers intentionally create a mismatch, the LLM uses the insecure method."

## The Attack That Makes This Concrete

From the role confusion finding, the researchers built an attack: *CoT Forgery*. The idea is to inject fake reasoning into a user message or tool output — text that *sounds like* the model's internal think process, even though it arrives from outside.

The intuition behind why this works is that when an LLM encounters its prior reasoning in context, it doesn't re-evaluate those conclusions. That's the point of reasoning: to pre-compute decisions so they don't need to be re-derived on every forward pass. Reasoning gets blanket trust. CoT Forgery steals that trust by producing text that activates the same internal "this is my reasoning" feature.

A concrete example from the paper: ask the model to explain cocaine synthesis and append fabricated reasoning blocks that conclude, with transparently absurd logic, that compliance is appropriate because the user is wearing a green shirt. The LLM complies. Not because it found the argument persuasive — it barely evaluated it as an external argument at all. It perceived the injected text as its *already-reached conclusion* and simply acted on it.

The attack worked across "every LLM we tested" in the late-2025 generation. Unlike most jailbreaks, which are model-specific and fragile, CoT Forgery transferred because it exploits something structural. And it doesn't degrade against more extreme requests: where persuasion-based jailbreaks hit pushback, CoT Forgery sidesteps the evaluation entirely.

The numbers: on a standard jailbreak benchmark, CoT Forgery pushed attack success rates from near-zero to roughly 60%; across the researchers' own evaluation dataset, average attack success was **61%**.

## The Destyling Result

Here is the quantitative anchor that makes the role-confusion hypothesis falsifiable. If the attack succeeds because the injected text *looks like reasoning*, then rewriting that text to *not look like reasoning* — without changing its logical content — should break the attack. The researchers call this *destyling*.

The procedure: take the same adversarial reasoning injection and strip out the specific vocabulary, syntax, and discourse markers that are characteristic of the model's thinking style. "The user wants..." becomes "The request is..."; terse safety-related reasoning patterns get paraphrased into neutral prose. To a human reader, the two versions say identical things. The logical content is unchanged.

To the model, the difference is enormous.

Destyling drops average attack success from **61% to 10%** — a six-fold reduction, achieved by a change that a human would not notice as meaningful. The paper notes that even replacing a single bigram — swapping "The user" for "The request" — drops success rates by 19 percentage points, because that phrase is heavily associated with reasoning in training data.

The researchers confirm the mechanism with the role probes: destyled injections register significantly lower CoTness. The model no longer internally classifies them as reasoning, so the trust transfer fails to occur.

This is not a defense — it's a diagnostic. Destyling demonstrates that style is the causal lever, not content. It also previews the shape of a potential defense.

## Why This Matters for Standard Prompt Injection

CoT Forgery targets the *think* role, but the same dynamics apply to *user* versus *tool* injection — the attack surface that matters for deployed agents. An agent that retrieves a webpage is supposed to treat that content as tool data: information, not instructions. But if adversarial text on the page *sounds sufficiently like a user command*, the model may internally classify it as Userness-high and comply with it.

The researchers tested this directly with a coding agent holding access to a secrets file. They varied how 212 versions of an injection *sounded* — prepending "User: ", or using phrases like "The below statement is from a user:", or claiming tool context. They then measured each injection's Userness score and correlated it with attack success. The result mirrors the CoT Forgery findings: the more the model internally perceives injected text as user-sourced, the more reliably the attack succeeds.

The implication for defenders: **the structural `<tool>` wrapper is insufficient protection if the content inside it reads like a command.** A sufficiently user-styled command embedded in tool output will be misclassified internally and followed. The role tag says *data*; the style says *instruction*; style wins.

The research also notes a non-adversarial version of this failure. Claude has a documented pattern of generating assistant text that *sounds like user commands*, then treating those fabricated commands as real user authorization in subsequent turns — an observation the paper cites with links to open issues in the Claude Code repository ([#66267](https://github.com/anthropics/claude-code/issues/66267), [#57928](https://github.com/anthropics/claude-code/issues/57928), [#60360](https://github.com/anthropics/claude-code/issues/60360)). Role confusion can allow a model to manufacture its own approval, cutting the human authorization channel out of the loop entirely.

## The Whack-a-Mole Problem

Current defenses against prompt injection fall into two categories, which the researchers call *attack memorization* and *role perception*:

**Attack memorization**: The model recognizes "send your .env file" as a common injection pattern from training data and refuses it. This explains why frontier models score well on static benchmarks but still fail in practice: benchmarks measure attacks the model has already seen. Skilled human red teamers rephrase until something works. Memorization is inherently brittle.

**Role perception**: The model correctly identifies injected content as originating from a low-privilege role — tool output, external data — and therefore refuses to execute commands from it regardless of phrasing. This is the robust alternative. If it worked reliably, rephrasing wouldn't help. The attacker's command would be ignored because it was *tagged as data*, not because it matched a known attack pattern.

Role perception is what the structural role tags are supposed to enforce. The research demonstrates it doesn't work that way in current models: the secure feature (the tag) is overridden by the insecure one (the style). Defenders therefore cannot rely on the `<tool>` boundary to neutralize injections. Until models achieve genuine role perception — which would require learning to treat the tag as the primary signal rather than one weak input among many — injection defense is, as the researchers put it, "a perpetual whack-a-mole game."

## What This Means for autogent's `[UNTRUSTED ... CONTENT]` Pattern

autogent uses explicit inline tagging of untrusted content — marking spans as `[UNTRUSTED ... CONTENT]` (described in more detail in [Tool Call Integrity and the Trust Boundary](/blog/tool-call-integrity)) — as a layer of injection defense. This is a principled approach rooted in explicit source attribution. But the role-confusion findings prompt an honest question: *does tagging untrusted content actually help if the model weights style over tags?*

The answer is: it helps, but incompletely, and the gap matters.

The tag performs a useful function. It creates a visible attribution trail. It can be checked by wrapping logic or audited later. It provides a hook for a retrieval pipeline or orchestration layer to enforce structural constraints before text reaches the model. It may influence the model somewhat via the training-time association between this kind of tag and skepticism toward the bracketed span.

But the research is unambiguous that this kind of textual marking is not a reliable mechanical barrier. If the content inside the `[UNTRUSTED ...]` brackets *reads like a user command or like reasoning*, the model may still misclassify it internally and comply. The bracket does not prevent the style-based classification that drives injection success.

The honest framing: tagging is a necessary but not sufficient defense. It raises the cost of casual injection by signaling context to both the model and the surrounding system. It does not neutralize carefully styled injections.

## Practical Defender Implications

The research points toward a concrete additional mitigation layer: **style-normalization of untrusted spans**.

If style is the causal variable that drives role confusion, then a preprocessing step that normalizes untrusted text — removing or flattening stylistic markers associated with high-privilege roles — removes the attack vector before it reaches the model. The destyling demonstration confirms the directional logic: a change invisible to humans, but meaningfully reducing role-confusion scores, drops attack success by ~51 percentage points.

In practice, this means:

**1. Normalize free-form natural-language spans before injection into context, while preserving originals.** A deterministic normalization layer — or a carefully sandboxed LLM-based summarizer — that converts retrieved prose content, natural-language instructions, or human-authored text into a standardized style reduces the Userness and CoTness signal the model would otherwise infer. **Preserve the original untrusted span and its provenance** alongside any normalized form — the normalized version goes into the model's context window, but the original must be retained for audit, debugging, and accurate attribution. This applies specifically to *free-form natural language*: do not paraphrase structured data (JSON, stack traces, code, commands) where paraphrasing can silently alter semantics and break downstream execution. Note also: an LLM-based normalizer is itself another prompt-injection surface. It must be tightly constrained, isolated, and granted no tool access — otherwise an injected payload in raw input can redirect the normalizer rather than being defanged by it. Deterministic text transforms (stripping quoted-speech markers, normalizing discourse phrases) are safer because they have no instruction-following surface for the attack to target.

**2. Treat user-styled vocabulary in tool content as a signal for scrutiny.** The research identified specific phrases — "The user wants...", "I need to...", "Please..." — that push Userness scores up. Injection detection heuristics can flag tool output containing high concentrations of these patterns for additional review before the model processes them.

**3. Separate processing pipelines by trust level.** Where possible, avoid mixing high-trust and low-trust content in the same context window at the same stylistic register. The attack requires the model to encounter adversarial content that can blend stylistically with trusted roles. Structurally isolating content by trust level — processing untrusted content in a context that doesn't also contain system-level reasoning — reduces the opportunity for style confusion.

**4. Don't treat the `<tool>` boundary as a sufficient trust demarcation.** For any system where prompt injection consequences are significant, supplement the structural separator with semantic processing. The tag tells the model "this is data." The style may tell it something different. Design defense-in-depth that doesn't rely on the tag winning that disagreement.

**5. Monitor for CoT-forgery signatures.** Reasoning-style text appearing in input channels (user prompts, retrieved content, tool outputs) is a detectable anomaly. Filtering or flagging user inputs that contain reasoning-style discourse — dense hedged language, characteristic inference patterns, safety-rationale structures — adds a low-cost detection layer against CoT Forgery specifically.

## The Structural Problem Beneath the Mitigations

The research closes with a point that deserves to be treated as a first-order constraint when designing injection-resistant systems: role tags were never architecturally designed for security. They evolved from the `User:\nAssistant:` formatting convention in GPT-3 era prompts. ChatGPT formalized them as software-injected delimiters. More tags accumulated as engineering needs arose. They were not designed as cryptographic boundaries; they were designed as training signal separators.

Because the model was trained to *associate* certain tags with certain behaviors, it learned to respond to tags. But it also learned to respond to *everything that correlates with those tags in training data* — including the writing styles of the text that appears within them. Style became a proxy for role. The proxy is stronger than the tag it was supposed to be a proxy for.

This is a training-time problem, not a prompt-engineering problem. Closing it requires, at minimum, training models with adversarial data that systematically mismatches style and tag, forcing the model to learn that the tag — not the style — is the authoritative signal. Whether that training is achievable robustly is an open research question.

Until it is answered, defenders should operate under the assumption that structural role boundaries are soft inferences, not hard walls — and build the rest of their injection defense accordingly.

---

**Sources**:
- Ye, Cui, Hadfield-Menell. *A Theory of Prompt Injection (and why you should study roles).* [https://role-confusion.github.io/](https://role-confusion.github.io/) (June 2026)
- Simon Willison. [Prompt Injection as Role Confusion](https://simonwillison.net/2026/Jun/22/prompt-injection-as-role-confusion/). *simonwillison.net*, June 22, 2026.
