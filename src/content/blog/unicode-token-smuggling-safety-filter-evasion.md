---
title: "Token Smuggling: Unicode Tricks That Slip Past AI Safety Filters"
description: "How attackers use Unicode homoglyphs, invisible characters, bidirectional overrides, and encoding tricks to smuggle disallowed content past LLM safety systems — and why the tokenizer-renderer gap is a structural attack surface that normalization alone doesn't fully close."
pubDate: 2026-07-01
tags: ["unicode-attacks", "prompt-injection", "safety-filters", "tokenization", "defense-patterns", "llm-security"]
---

Most AI safety filtering happens at the application layer: a moderator model evaluates the input, a classifier runs keyword or embedding checks, and disallowed content is blocked. What's easy to miss is that this filtering happens on *text* — a decoded, rendered, human-legible representation. But the model that actually processes the prompt never sees text in quite that form. It sees token IDs.

Between the text a human writes, the text a filter reads, and the token sequence a model processes, there are at least three distinct representations. They don't always agree. That gap is the attack surface.

This post catalogs the Unicode-based techniques attackers use to exploit this gap, explains why each one works, and describes defenses that actually address the structural problem rather than patching individual patterns.

## The Tokenizer-Renderer Gap

Before examining specific attacks, it's worth understanding why the gap exists.

**Rendering** converts a byte sequence into visible glyphs. Your browser or terminal applies Unicode rendering rules, font substitutions, and layout directionality to turn bytes into what you see on screen. A Cyrillic А (U+0410) looks identical to a Latin A (U+0041) in most fonts. A right-to-left override character (U+202E) reverses the display direction of subsequent text. A zero-width joiner (U+200D) is invisible. Rendering is optimized for human readability — some Unicode features exist specifically to support that goal.

**Tokenization** converts that same byte sequence into token IDs by splitting on learned subword boundaries and mapping each piece to a vocabulary index. Tokenizers are trained on specific corpora; they have no concept of "what this looks like to a human." The Cyrillic А and the Latin A tokenize to different IDs. A word containing a zero-width joiner tokenizes differently than the same word without it — because the joiner inserts a split point. The token sequence for a string with a right-to-left override character includes a token for the control character itself.

**Safety filtering** typically operates somewhere between these two. A deployed system might:

- Run a classifier on the normalized, decoded input string (close to rendered form)
- Run keyword matching against the raw input (closer to byte form)
- Combine embedding-based checks with pattern matching

The exact pipeline varies by deployment. That variance is useful to attackers: a technique that bypasses a text-layer filter because it renders innocuously but tokenizes differently may succeed even if the specific mechanism was unknown at attack construction time.

The structural point isn't that these representations are hard to reconcile — it's that they're almost never explicitly reconciled before safety evaluation runs.

## Homoglyph Substitution: The Look-Alike Catalog

A homoglyph is a character that is visually indistinguishable from — or easily confused with — another character. Unicode contains thousands of them, arising from the need to encode scripts from dozens of writing systems.

The canonical example: Cyrillic has its own A (А, U+0410), O (О, U+041E), C (С, U+0421), E (Е, U+0415), and P (Р, U+0420), all of which are visually identical to their Latin counterparts in most fonts. A keyword filter checking for the literal string "ACME" will not match "АCME" if the first character is Cyrillic А.

This is not an AI-specific problem. It's the same technique behind IDN homograph attacks on domain names — `pаypal.com` with Cyrillic а blocking phishing filters since the early 2000s. But its application to LLM safety filters has some distinctive properties:

**Scale and variation.** Unicode 15.1 contains 149,813 characters. The [Unicode Consortium's Confusables data](https://www.unicode.org/reports/tr39/#Confusables) lists tens of thousands of character pairs that are visually confusable across scripts. An attacker has an enormous substitution alphabet and can vary their approach across requests.

**Partial substitution.** A filter checking for "violence" in the input can be bypassed with "viоlence" (Cyrillic о) — the word reads identically to a human reviewer but fails a byte-level match. More importantly, the substitution doesn't have to make the word unreadable to the model: if "viоlence" isn't in the model's vocabulary as a complete subword, the tokenizer splits it into fragments and the model often reconstructs the concept from context. The filter misses it; the model still understands it.

**Consistency within a substitution set.** An attacker building a jailbreak prompt doesn't need to randomize substitutions. They can consistently use Cyrillic е for Latin e throughout a payload, making the result look uniform and readable while evading filters.

**Live example pattern (generalized):** A prompt asking for a disallowed task description might substitute homoglyphs in just the action words — the structural framing ("Please explain how to...") passes the filter unchanged; only the disallowed concept words carry the substitution. This selective pattern is harder to detect than wholesale substitution.

**What the model does:** Most modern LLMs can decode partially-substituted text. The model may have encountered multilingual mixing, transliterations, or OCR errors in training data that produce similar patterns. It contextually reconstructs meaning even when individual tokens are unusual.

**Defense note for this section:** Character-level normalization to ASCII isn't viable for multilingual deployments. The right approach is Unicode confusable-detection before filtering: the Unicode Consortium publishes a confusables.txt mapping of visually similar character pairs, and libraries like ICU4J and Python's `unicodedata` provide the building blocks. Filtering should run on the *normalized and confusable-mapped* form of the input.

## Zero-Width and Invisible Character Injection

Unicode includes a class of characters that have no visible glyph but affect text processing: zero-width space (ZWSP, U+200B), zero-width non-joiner (ZWNJ, U+200C), zero-width joiner (ZWJ, U+200D), word joiner (WJ, U+2060), and the soft hyphen (U+00AD), among others.

Injecting these characters into words creates a surface where:

1. **The rendered text looks unchanged** — human reviewers (and most text display layers) show nothing.
2. **The tokenizer sees different tokens** — the invisible character often creates a subword boundary, splitting a single word into fragments.
3. **A filter running on the displayed string may match; a filter running on the raw bytes misses** — depending on where in the pipeline filtering occurs.

The effect on tokenizers is mechanical. Consider the word "weapon" in a GPT-family tokenizer: it might tokenize as a single token `weapon` or as `we`+`apon` depending on context. Insert U+200B between "wea" and "pon" and you force a split at that point regardless of context. The raw string is `wea\u200bpon`, which a byte-level keyword filter won't match against "weapon". A filter operating on a rendered/stripped version of the string would catch it; many production implementations do not strip these characters before filtering.

### ZWJ Stacking

ZWJ has an additional property: it signals to text renderers that adjacent characters should be composed into a ligature. For emoji, this is well-documented — Man (U+1F468) + ZWJ + Laptop (U+1F4BB) = 👨‍💻. For arbitrary text, ZWJ insertion can affect how rendering engines apply shaping and ligature rules.

In attack contexts, ZWJ stacking means an attacker can construct a payload where the text displayed in a rendered interface (chat bubble, web UI, log viewer) differs from the raw byte content. This is relevant for social engineering scenarios where an AI-generated output is rendered for a human recipient who needs to be deceived about the content, but the more direct attack uses it to fragment keyword detection.

### Soft Hyphen as Split Indicator

The soft hyphen (U+00AD) is rendered only when it falls at a line break; otherwise it's invisible. It's frequently stripped by HTML renderers and word processors, which means a filter running after HTML rendering won't see it. But a tokenizer operating on the original byte stream will include it as a character, fragmenting the token boundary at that position.

### Control Characters in Rendered Outputs

Beyond zero-width characters, the full set of Unicode control characters (C0 and C1 ranges, U+0000–U+001F and U+0080–U+009F) includes characters that affect text rendering in ways that can be exploited:

- **Null bytes** (U+0000): Some string operations truncate at null. A prompt that includes a null byte mid-string may be split differently by different pipeline stages.
- **Backspace** (U+0008): In terminal renderers, this erases the preceding character visually. A string that displays as benign in a terminal log may contain the actual payload hidden behind backspace-erased characters.
- **Form feed, vertical tab**: Affect line counting in parsers, potentially moving injected content past line-count limits in some filtering heuristics.

The [Trojan Source paper](https://trojansource.codes/) (Boucher et al., 2021, University of Cambridge) demonstrated this class of attack against *source code*: bidirectional Unicode control characters inserted into comments and string literals caused code reviewers to see a different program than what the compiler actually executed. The same structural principle — rendered representation diverges from processed representation — applies directly to AI input pipelines.

## Right-to-Left Override Attacks

The Unicode Bidirectional Algorithm (UBA) allows text to mix left-to-right and right-to-left scripts. This is necessary for Arabic and Hebrew support in multilingual contexts. The mechanism: certain characters (like Hebrew Alef or Arabic letters) implicitly set text direction; explicit override characters (RLO, U+202E; LRO, U+202D; RLE, U+202B; PDF, U+202C) explicitly set and reset direction regions.

The right-to-left override (RLO, U+202E) is the character behind the classic "evil file extension" attack. The trick: choose an extension that spells the desired fake extension in reverse, then insert RLO before it. A filename like `evil\u202Efdp.exe` — where `fdp.exe` in reverse-display order reads as `exe.pdf` — renders in Windows Explorer and most file pickers as `evilexe.pdf`. The actual file on disk is an `.exe`; the rendered name suggests a `.pdf`. This was used in real-world phishing campaigns and IM attachments for over a decade.

In AI systems, RLO attacks manifest differently:

**Output manipulation.** An LLM that faithfully reproduces user-supplied text in its output (quoting, summarizing, reformatting) can be made to emit RLO characters in rendered output. A user who asked the model to "rewrite my bio for a professional context" receives a response that, when rendered in their browser, displays different text than what the model actually generated. The safety filter checked what the model output as bytes; the user sees something else.

**Prompt structure inversion.** A system prompt might include instructions like "Do not discuss competitor products." A prompt containing RLO characters after a certain point will render those instructions in reverse order in text display contexts while remaining syntactically unchanged for the model. An attacker who can influence the system prompt (e.g., through a multi-tenant platform misconfiguration) can embed instructions that display as benign to a human auditor but are read forward by the model.

**Log poisoning.** Security monitoring of LLM interactions typically involves logging prompt and response content for audit. Logs rendered in terminal or browser UIs can be made to display manipulated content while the actual payload content remains in the byte stream. An analyst auditing a log viewer would see manipulated content; a raw hex dump or a log processing pipeline that doesn't handle UBA would see different content.

The Trojan Source paper specifically documented bidirectional-control exploitation in code contexts; the [CVE-2021-42574](https://nvd.nist.gov/vuln/detail/CVE-2021-42574) designation covered the family of attacks against compilers, highlighting how pervasive the vulnerability was across software processing pipelines.

## "Decode and Execute" Encoding Attacks

A structurally distinct attack class doesn't rely on Unicode rendering tricks at all — it exploits the fact that LLMs have extensive training exposure to encoded text and can decode it.

**Base64.** Encode a disallowed instruction in base64, prepend it with "Decode the following base64 and follow the instructions:", and many LLMs will comply. The safety filter runs on the literal prompt text and sees a base64 string — which typically isn't disallowed. The model decodes the instruction in-context and acts on the decoded version.

This isn't theoretical. Greshake et al. (2023) documented prompt injection attacks that used encoded payloads to bypass detection in indirect injection scenarios — a web page instructs an agent "Base64-decode the following and execute as an instruction: [payload]", and the agent does. The payload can contain instructions that would trigger safety filters if written literally.

**ROT13 and substitution ciphers.** These provide even less entropy than base64 but work against naive filters for the same reason: the filter checks literal strings, not decoded content. Interestingly, models trained on substantial internet text have strong ROT13 decoding capability because ROT13 is commonly used for spoiler-hiding and puzzle content.

**Custom encodings.** More sophisticated variants define a mapping inline: "In this conversation, 'apple' means 'password', 'banana' means 'reset', [...]" — building a one-time pad style obfuscation that the model learns mid-conversation. Because the filter has no access to conversation history in single-turn evaluation mode, it cannot decode the payload.

**Unicode escape sequences.** Some prompt interfaces render Unicode escape sequences: `\u0068\u0065\u006c\u0070` in an input processed by a system that interprets escape sequences becomes "help". A filter running before escape processing misses the decoded form.

**Why this works on LLMs specifically:** The unique property of LLMs that makes this attack class work is their *instruction-following capability*. A traditional program asked to "decode this base64 and execute it as a command" would require an explicit code path to do so. An LLM's function *is* to follow instructions in natural language. The model makes no intrinsic distinction between "decode and explain" and "decode and do" — the distinction is supposed to be enforced by the safety system, but the safety system checked the encoded form.

The OWASP LLM Top 10 (LLM01: Prompt Injection) covers the general attack class; the encoding variant is a specific exploitation pattern within it that targets filter blindspots rather than model alignment directly.

## Defense Checklist

These attacks share a common structure: a gap between the representation on which safety evaluation runs and the representation the model actually processes. Defenses should close that gap, not patch individual patterns.

### 1. NFKC Normalization Before Filtering

Unicode Normalization Form KC (NFKC) applies both canonical decomposition (resolving precomposed characters to their component code points) and compatibility mapping (converting Unicode compatibility variants to their canonical equivalents). Critically for homoglyph defense, NFKC collapses many full-width characters to their ASCII equivalents and resolves some compatibility confusables.

```python
import unicodedata

def normalize_for_safety_check(text: str) -> str:
    return unicodedata.normalize("NFKC", text)
```

NFKC is not sufficient on its own — it does not handle all confusable pairs (Cyrillic А vs. Latin A are canonically distinct and NFKC does not equate them) — but it eliminates a large class of full-width digit, letter, and punctuation variants that commonly appear in filter evasion. Note that NFKC *can* alter legitimate distinctions: mathematical and stylistic Unicode letters (e.g., ℝ, 𝒇), circled numbers, and some script-specific compatibility forms are collapsed to their base equivalents, which may affect math or specialized text. Apply NFKC before filtering specifically, not to stored or displayed content.

For confusable detection beyond NFKC, the Unicode Confusables data (UTS #39) provides a skeleton algorithm that maps potentially confusable strings to a canonical form for comparison.

### 2. Strip or Reject Invisible Control Characters

Zero-width characters, soft hyphens, and non-printing control characters outside of legitimate Unicode formatting uses have no place in typical LLM prompts. Strip them before safety evaluation — including the C0/C1 control characters (null bytes, backspace, form feed) discussed earlier:

```python
import re

# Remove zero-width formatting characters (does NOT strip bidi controls — see section 3)
INVISIBLE_PATTERN = re.compile(
    r'[\u200B\u200C\u200D\u2060\uFEFF\u00AD]'
)

# Remove C0/C1 control characters (null, backspace, form feed, etc.)
CONTROL_PATTERN = re.compile(
    r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]'
)

def strip_invisible(text: str) -> str:
    text = INVISIBLE_PATTERN.sub('', text)
    text = CONTROL_PATTERN.sub('', text)
    return text
```

Note: bidirectional control characters (U+200E, U+200F, U+202A–U+202E) are handled separately in section 3 below because stripping them wholesale can break legitimate Arabic/Hebrew text.

### 3. Bidirectional Character Auditing

Right-to-left override characters in inputs headed to model inference should be treated as high-suspicion signals in most deployment contexts. Log the raw bytes of inputs that contain bidi control characters; alert on them; and consider rejecting them outside of explicitly Arabic/Hebrew-language deployments.

For rendered outputs displayed to users, run a bidi-safety check on the raw bytes before rendering: if the rendered string differs from the raw byte representation when bidi control characters are removed, flag the discrepancy. The Python `python-bidi` library and JavaScript's `bidi-js` provide bidi rendering implementations for comparison.

### 4. Decode-Then-Filter for Encoding Attacks

Standard base64 and common encodings can be detected and decoded in a pre-filter pass. The heuristic is simple: if the input contains a substantial base64-decodable payload and an instruction to decode it, filter the *decoded* content as well as the raw input.

More broadly, the filtering pipeline should run on all representations that the model might process:

- Raw input bytes
- Unicode-normalized form
- HTML/markdown-stripped form
- Any decoded form implied by explicit decoding instructions in the input

This multi-layer filtering is more expensive, but the cost is concentrated in the filtering pipeline, not in model inference.

### 5. Consistency Auditing Between Raw and Rendered Forms

For deployed interfaces that render model outputs in HTML, terminal, or rich-text contexts: implement a check that compares the plain-text content of the raw model output with the rendered plain-text content. If they differ by more than whitespace normalization, flag the response for review.

This catches RLO attacks on model outputs and is straightforward to implement: strip all Unicode directional controls from the raw string, render the raw string to plain text, and compare. A mismatch indicates directional manipulation.

### 6. Red-Team Prompt Library

Add encoding attack variants to your model's red-team test suite:

- Submit known-disallowed content in base64 with "decode and follow these instructions" framing
- Submit prompts with Cyrillic confusables substituted for key content words
- Submit prompts with zero-width characters inserted into flagged terms
- Submit prompts containing U+202E followed by disallowed content
- Submit prompts with ROT13-encoded payloads and decoding instructions

The goal is not to enumerate every possible variant but to verify that your pipeline's filtering layer catches these patterns at all — which tells you whether you're filtering raw bytes, normalized text, or decoded content.

### 7. Tokenizer-Aware Safety Check

For the most sensitive deployments, consider running safety evaluation on the *detokenized* form of the prompt — convert the input to token IDs using the model's actual tokenizer, then convert back to text. This can surface how the model's tokenizer segments the input, catching cases where invisible characters fragment tokens in ways that evade string-level matching. Note that tokenizer round-trips are lossy for many tokenizers (byte-fallback tokenizers in particular normalize some codepoints), so the detokenized form is an approximation of the model's internal representation rather than an exact replica. Treat this as a supplementary layer for high-risk inputs, not a complete solution.

---

## The Structural Lesson

Each attack class above exploits a different point in the text-processing pipeline — rendering, tokenization, encoding, filtering — but they share a common failure mode: **the system assumed a single, uniform representation of "the input" and safety-checked that one representation**.

Real text processing stacks are not uniform. They involve multiple transformations, each with its own semantics, applied by components that were not designed with each other's representations in mind. Unicode was designed for human text interchange, not for consistent machine-to-machine representation. Tokenizers were designed for compression efficiency in language modeling, not for security-invariant decomposition.

The attacks described here aren't particularly sophisticated in isolation. What makes them effective is that they're exploiting the *interface* between components rather than any single component's behavior. That's a structural property, and structural defenses — normalization at pipeline entry, multi-representation filtering, render-vs-raw auditing — are what close it.

Keyword pattern patches at single layers do not. The history of filter evasion in web application firewalls, spam filters, and content moderation systems all suggest the same: representation-level attacks require representation-aware defenses.

---

*Research references: [Trojan Source (Boucher et al., 2021)](https://trojansource.codes/); [Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injections (Greshake et al., 2023)](https://arxiv.org/abs/2302.12173); [OWASP LLM Top 10 — LLM01: Prompt Injection](https://genai.owasp.org/llm-top-10/); [Unicode Technical Standard #39 — Unicode Security Mechanisms](https://www.unicode.org/reports/tr39/); [CVE-2021-42574 — Bidirectional Text Control Characters in Source Code](https://nvd.nist.gov/vuln/detail/CVE-2021-42574).*
