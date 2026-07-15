---
title: "Prompt Cache Timing Attacks: Side-Channel Leakage in LLM API Infrastructure"
description: "Major LLM providers cache prompt prefixes to reduce latency and cost — but shared cache infrastructure creates a timing side-channel. An attacker with access to a shared API key or multi-tenant deployment can measure whether a specific prefix is cached, leaking information about co-tenant system prompts and conversation context within the same cache namespace."
pubDate: 2026-07-15
tags: ["side-channel", "prompt-injection", "inference-infrastructure", "cache-attacks", "llm-security", "privacy"]
relatedPosts: ["system-prompt-extraction-attacks", "securing-ai-inference-stack-gpu-memory-model-serving", "privacy-preserving-ai-inference-tee-homomorphic-encryption-confidential-computing", "adversarial-prompt-caching-kv-timing-attacks"]
---

In classical cryptography, timing attacks are a well-understood threat. Paul Kocher's 1996 demonstration that RSA private keys could be recovered by measuring decryption times launched a thirty-year discipline of constant-time programming, hardware countermeasures, and timing normalization. The principle is simple: **if a computation takes measurably different amounts of time depending on secret data, an observer can learn the secret by measuring time**.

The same principle now applies to LLM APIs. Major providers — Anthropic, OpenAI, Google — have deployed prompt prefix caching at scale. The benefit to users is real: latency reductions of 50–80% for cached prefixes, cost discounts up to 90% on cached tokens. The side effect is a timing differential between cache hits and cache misses that's visible from outside the system. An attacker with API access and a stopwatch can turn that differential into a **cache oracle** — a probe that detects whether a specific text prefix is currently cached, and by implication, whether some other user's system prompt or conversation matches a known string.

This post explains how prompt caching creates the attack surface, what an adversary can actually learn from timing measurements, where isolation should prevent cross-account leakage, and what developers should do to protect their deployments.

## How Prompt Prefix Caching Works

When a transformer model processes a prompt, it computes key-value (KV) attention pairs for every token in the input. On subsequent requests that begin with the same prefix, a caching layer can skip that recomputation and serve the KV pairs directly from storage. The model "picks up" from the end of the cached prefix, dramatically reducing both latency and compute cost for long or frequently repeated system prompts.

Provider implementations differ on the specifics:

**Anthropic** requires explicit `cache_control` markers in the API request. Minimum token thresholds: 1,024 tokens for Claude Sonnet and Opus, 2,048 tokens for Haiku. The default TTL is 5 minutes; an extended 1-hour TTL is available. Anthropic's documentation describes the latency benefit as near-zero time-to-first-token for the cached portion, with a 90% cost reduction on cached tokens.

**OpenAI** applies prompt caching automatically, without explicit opt-in. Caching triggers on prefixes of 1,024 tokens or more. The observable benefit is up to ~80% latency reduction on the cached prefix segment, with a 50% cost discount on cached input tokens.

**Google Gemini** supports explicit context caching with configurable TTLs. Documentation covers cost and token structures but, like the other providers, doesn't specify the storage-layer isolation architecture.

The general model across providers — based on public documentation — is that a hash of the prompt prefix content (combined with model version and other request parameters) serves as the cache key. Two requests share a cache entry when they match on the full key. Providers have not published specifications of the exact key derivation scheme, including whether project, organization, or tool parameters are included; the precise granularity may vary and is not independently verifiable.

## The Timing Side-Channel

The attack begins with an observable fact: **cached requests return faster than uncached ones**. Providers advertise this as a benefit. It's also an information leak.

The structure of a cache oracle:

1. **Establish a baseline.** Measure time-to-first-token (TTFT) for a known-uncached prefix of the target length. This calibrates the expected cold-path latency under current network and queue conditions.

2. **Probe the target.** Issue a request beginning with the text prefix you want to test for cache presence. Measure TTFT.

3. **Interpret the result.** If TTFT is significantly below baseline, the prefix was already in cache when your probe arrived — implying some prior request had populated it. If TTFT matches baseline, the prefix was cold (your probe just warmed it).

4. **Repeat for statistical confidence.** Network jitter, server queue variation, and geographic routing create noise. A single measurement is unreliable; an adversary probes repeatedly and looks for consistent deviation from the cold baseline.

What does a positive result mean? The target prefix text was recently active in the cache namespace your request accessed. For the scenarios below, the interpretation depends on exactly whose cache namespace that is.

> **⚠️ Evidence status.** The latency differential between cached and uncached LLM API responses is documented by providers as a feature and measurable by any API consumer. The structured use of this differential as an *oracle attack* against production LLM APIs has not been published in peer-reviewed literature as of this writing. The threat is theoretically well-motivated — the mechanism is identical to demonstrated CPU cache timing attacks (Flush+Reload, Prime+Probe, and the broader Spectre-class literature). Whether the signal-to-noise ratio is sufficient for reliable inference under real-world network jitter has not been independently confirmed. This is an emerging risk, not a deployed exploit.

## What an Attacker Can Actually Learn

The information gain from a cache oracle depends critically on what cache namespace the probe touches.

### Intra-Account Probing

Under standard provider implementations, cache namespaces are scoped to the API *account* — the entity identified by the API key used to make the request. Two calls using the same API key share a cache namespace; calls from different accounts are isolated.

This means the most immediately actionable attack scenario is **intra-account**: an attacker who has API access (even partial access, e.g., a shared key in a multi-tenant application) can probe whether specific prefixes are cached *within the same account*. This is relevant when:

- A multi-tenant SaaS application issues API calls for multiple customers under a single provider API key. An attacker who is one customer can probe for another customer's cached system prompt prefix.
- A development/staging environment shares an API key with production. Probing from staging can detect what system prompts are active in production.
- A contractor or internal attacker has limited API access but not direct access to the system prompt configuration.

The oracle doesn't return the content of the cached prefix — it only confirms or denies presence of a *tested* prefix. For a brute-force oracle over an unknown prompt, the attacker must enumerate candidate strings, which is only tractable when the search space is small (known templates, short prefixes, constrained vocabulary). An iterative character-by-character probe extending a confirmed prefix can in principle recover unknown suffixes one token at a time if the signal is reliable enough — making the leakage potentially stronger than simple whole-string confirmation, though significantly harder to execute in practice under network jitter.

### Cross-Account Timing: Where Isolation Should Hold

Cross-account cache oracle attacks — detecting a competitor's system prompt, for instance — are **not expected to work** under standard per-account namespace isolation. The attacker's request touches only their own account's cache, regardless of whether the target text exists in another account's cache.

Cross-account leakage would require the isolation guarantee to be weaker than documented: a misconfiguration, a shared underlying storage tier, or a transient failure during infrastructure events. Providers have not published documentation on the storage-layer enforcement of account isolation, which means the guarantee is unverifiable externally. But the standard architecture should prevent cross-account timing inference.

> **Scope of the threat.** The practical attack surface is intra-account, not cross-account. Organizations that share API keys across teams or expose API access to external parties are the most exposed.

## Concrete Threat Scenarios

**Tenant isolation in multi-tenant applications.** A company builds a customer-facing AI assistant. All customers share the same backend API key. Tenants submit different queries but some tenants have long-lived session context that gets cached. A malicious tenant can probe for another tenant's conversation prefix — confirming or denying the exact content without triggering any application-layer filter, because the timing probe operates below the application layer.

**Existence-confirmation of proprietary system prompts.** A company's system prompt is designed to be secret (the "don't reveal your instructions" approach). A competitor already suspects what the prompt might say and wants to confirm. Under intra-account isolation, this is only possible if the attacker has access to the same API key, but in a shared-infrastructure scenario (multi-tenant app, shared development environment, third-party integration), the attacker might. The oracle confirms whether the suspected text is currently deployed without requiring model cooperation.

**Configuration probing via known templates.** AI tool vendors often ship default system prompt templates. An attacker who knows the default can probe whether a given deployment is using an unmodified template — an indicator of security posture.

**Temporal session correlation.** In an application that caches conversation context, timing probes can establish whether a specific user's session was recently active — a privacy leak independent of content.

## The Classical Parallel: Timing Attacks Across Security Disciplines

LLM cache timing attacks inherit a long lineage:

**Cryptographic timing attacks (Kocher, 1996).** RSA and DSA decryption time varies with key bits. Measuring ~a million decryption operations allows full private key recovery. The fix: constant-time exponentiation regardless of key value.

**Web timing attacks (Felten & Schneider, 2000).** HTTP response times can leak whether a user has visited a specific URL (cross-site timing). Used to defeat same-origin policy. The fix: timing normalization in browsers and servers.

**CPU cache side-channels (Flush+Reload, Spectre, Meltdown).** Shared CPU cache state leaks information between processes and across security boundaries. Measured in cycles, not milliseconds — but the principle is identical. The fix: cache partitioning, flushing on context switch, hardware mitigations.

**HTTPS compression timing (BREACH, CRIME, 2012–2013).** Compressed HTTPS response sizes vary with content, leaking secrets via response size and timing correlation. The fix: disable HTTP response compression for pages containing secrets.

The pattern is consistent: shared infrastructure with observable behavior creates side-channels. Every time a new caching or optimization layer is added to shared infrastructure, the timing-attack analysis needs to be redone.

## Mitigations

### For Application Developers

**Use separate accounts or projects per tenant, not just separate API keys.** If your application serves multiple tenants, ensure each tenant operates in an isolated cache namespace — typically a separate provider account or project, depending on how the provider partitions cache state. API keys alone may not provide cache isolation if multiple keys map to the same underlying account or project namespace; check provider documentation for the exact isolation unit before assuming key-level separation is sufficient. Where supported, sub-account namespace isolation (e.g., separate projects or organizations) is the correct isolation boundary.

**Add a deployment-unique identifier to every system prompt.** Include a short, stable, deployment-specific prefix at the beginning of your system prompt — a UUID or deployment name works. This changes the provider-computed cache key, preventing an attacker who knows your generic prompt template from using a timing oracle to confirm your deployment uses it. The identifier doesn't need to be secret; it just needs to be unique per deployment.

**Treat system prompts as non-confidential by default.** The timing oracle can only *confirm* a known string — it doesn't extract unknown content. But if your security model depends on the exact wording of your system prompt being secret, you have a problem regardless of timing attacks: system prompts are frequently leaked via direct elicitation (see the [system prompt extraction post](/blog/system-prompt-extraction-attacks)). Design your system prompt assuming it can be discovered. The secret should not be the text; the security should come from the model's behavior regardless of prompt visibility.

**Minimize unnecessary cross-tenant API key sharing.** Audit where API keys are shared in your infrastructure. Shared keys in multi-tenant scenarios, development environments, or third-party integrations are the primary intra-account attack surface.

**Log and baseline your cache hit rates.** If your provider exposes cache hit status in API responses, log it. An unexpectedly early cache hit on a freshly-deployed system prompt — before your own service has sent enough requests to warm the cache — is an anomaly worth investigating.

### For Providers

**Timing normalization.** Add a minimum response time floor that eliminates the observable differential between cache hits and misses. This is the standard defense for password-comparison timing attacks and applies directly. The tradeoff: users lose the latency benefit of cache hits (though the cost benefit can still be preserved).

**Per-account cache hit obfuscation.** Rather than returning cached responses immediately, inject random micro-delays to blur the signal. Less reliable than full normalization but lower impact on the user-visible latency benefit.

**Explicit storage-layer isolation documentation.** Publish a clear architectural description of where cache namespace boundaries are enforced. "Per-account" is a routing-level description; what matters is whether the isolation is enforced at the storage layer, which determines whether infrastructure failures or misconfigurations could produce cross-account leakage. This transparency enables enterprise customers to make informed risk assessments.

**Per-tenant cache namespacing for enterprise deployments.** Some providers offer enterprise tiers with stronger isolation. Making sub-account namespace isolation available allows application developers to achieve per-tenant isolation without managing separate API keys.

## Summary

| Attack | Requirement | Isolation Dependency | Evidence Status |
|---|---|---|---|
| Intra-account cache oracle (same API key) | API access; knowledge of target prefix | Intra-account namespace | Theoretically well-motivated; not peer-reviewed |
| Cross-tenant timing in multi-tenant app | Access to shared-key application | Shared-key architecture | Theoretically well-motivated; not peer-reviewed |
| Cross-account oracle (competitor detection) | API access | Requires cross-account isolation weakness | Not expected to work under standard architecture |
| Cache namespace injection via second-preimage | Hash collision in key derivation scheme | Hard under well-designed schemes | No reported instances |

The threat model for prompt cache timing attacks is most concrete for organizations sharing API keys across tenants or deployments. The timing differential is real; the oracle attack is theoretically sound; empirical confirmation of practical signal quality under real-world conditions hasn't been published. The cost-effective mitigation — separate API keys per tenant, deployment-unique prefix identifiers — is tractable now and doesn't require waiting for provider-side countermeasures.

As context windows grow and caching becomes more aggressive (100K-token caches are already deployed), the cached surface per request grows and timing differentials become larger and easier to measure. This is a risk class that's easier to architect around before deployment than after.

---

*Related: [Adversarial Prompt Caching: Timing Attacks and Injection via Shared KV Caches](/blog/adversarial-prompt-caching-kv-timing-attacks) — broader treatment including cache injection vectors; [System Prompt Extraction Attacks](/blog/system-prompt-extraction-attacks) — why system prompts shouldn't be relied on for confidentiality regardless of cache attacks; [Securing the AI Inference Stack](/blog/securing-ai-inference-stack-gpu-memory-model-serving) — self-hosted vLLM context for the same timing side-channel class; Anthropic [prompt caching documentation](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching); OpenAI [prompt caching documentation](https://platform.openai.com/docs/guides/prompt-caching); Kocher, "Timing Attacks on Implementations of Diffie-Hellman, RSA, DSS, and Other Systems," CRYPTO 1996.*
