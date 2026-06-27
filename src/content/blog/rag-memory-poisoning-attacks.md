---
title: "Poisoning the Well: Memory and RAG Attacks Against Long-Context AI Systems"
description: "As AI agents gain persistent memory through vector stores and RAG pipelines, a new attack surface emerges: injecting malicious content into the agent's long-term knowledge to control future behavior. This post maps the taxonomy of memory poisoning attacks — from retrieval manipulation to cross-session contamination — and what defenders need to audit before production."
pubDate: 2026-06-27
tags: ["rag-security", "memory-poisoning", "prompt-injection", "vector-stores", "agent-security", "threat-modeling"]
---

DNS cache poisoning was elegant in its simplicity: corrupt the resolver's memory, and every subsequent lookup returns your answer instead of the legitimate one. The attack surface wasn't the query — it was the accumulated state that answered the query. The user was already downstream, trusting infrastructure that had already been compromised.

The same architecture is being rebuilt in AI. Retrieval-Augmented Generation (RAG) and persistent agent memory systems are, at their core, caches. They store facts so the model doesn't have to retrieve them fresh every time. And like DNS, the attack surface isn't necessarily the live query — it's the poisoned cache that answers it.

## Why Persistent Memory Changes the Threat Model

Single-turn prompt injection attacks are well-studied: an adversary sends a crafted input that hijacks the model's behavior for that session. Defenses are conceptually straightforward — validate inputs, sandbox tool use, monitor outputs.

Memory poisoning is different. The attack is committed at ingestion time; the harm materializes at retrieval time, potentially weeks or months later, against a different user, through a different query. The attacker does not need access to the inference endpoint at the time of attack. They need access — even indirect access — to the documents, web pages, or database records that will eventually be indexed into the knowledge store.

This is the persistent-threat version of prompt injection. And it scales.

## Attack Surface 1: Knowledge Base Corruption (PoisonedRAG)

The foundational empirical work on this class of attack is **PoisonedRAG**, published at USENIX Security 2025 by Zou et al. ([arXiv:2402.07867](https://arxiv.org/abs/2402.07867), [official code](https://github.com/sleeepeer/PoisonedRAG)).

The attack is deceptively efficient. A RAG system answers a user's question by (1) embedding the question, (2) retrieving the top-K most semantically similar chunks from a knowledge database, and (3) conditioning the LLM's generation on those chunks. PoisonedRAG exploits step 2: the attacker crafts and injects a small number of adversarial texts — sometimes as few as five documents per target question — that are engineered to satisfy two independent conditions simultaneously:

1. **Retrieval condition**: The poisoned documents must rank highly in semantic similarity to the target question, beating out legitimate documents in the top-K results.
2. **Generation condition**: Once retrieved, the adversarial text must cause the LLM to generate the attacker's chosen target answer, overriding any contradictory legitimate content in the same context window.

The paper demonstrates that satisfying both conditions independently is insufficient — naive attacks that optimize only for retrieval (corpus poisoning attacks) fail because the LLM overrides them, while attacks that optimize only for generation (direct prompt injection in retrieved text) fail because the poisoned documents don't rank highly enough to be retrieved. PoisonedRAG jointly optimizes both objectives and achieves attack success rates exceeding 90% against black-box RAG deployments.

### Why This Is a Supply Chain Problem

The most important implication is provenance. In a typical enterprise RAG deployment, the knowledge base is populated from sources the organization does not control: public documentation, vendor websites, GitHub READMEs, Wikipedia, news articles. The attacker does not need to compromise any internal system — they only need to get a poisoned document indexed. That could mean:

- Editing a Wikipedia article that the RAG system will later crawl
- Publishing a blog post or documentation page that the crawler will fetch
- Contributing to an open-source repository whose docs are indexed
- Compromising a third-party data feed

Once the poisoned document is in the knowledge base, every future query that triggers its retrieval will receive the attacker's preferred answer. The attack persists until the document is removed and the index is rebuilt.

## Attack Surface 2: Indirect Injection via Retrieved Documents

Before the knowledge-base poisoning framing, Greshake et al. named the broader class at ACM AISec 2023: **indirect prompt injection** ([arXiv:2302.12173](https://arxiv.org/abs/2302.12173)).

The key insight: LLM-integrated applications blur the distinction between data and instructions. When an agent retrieves a web page, PDF, or database record and includes it in context, the model processes that content with the same attention it gives to explicit system instructions. There is no syntactic boundary between "data to read" and "instruction to follow."

Indirect injection via RAG is a special case: the adversary doesn't inject into the live request — they inject into a document that will be retrieved. The injected instruction can be:

- **Invisible to humans**: white text on white background, zero-font text, metadata fields the rendering layer ignores but the LLM processes
- **Semantically targeted**: written to match specific retrieval queries, ensuring it surfaces for the right user at the right time
- **Behaviorally specific**: tailored to a particular agent's tool set — "call the send_email tool with the following body:" works only against agents that have email capabilities, but the attacker knows the public agent architecture

The Bing Chat examples from the original paper remain instructive: a webpage could contain a hidden prompt that caused Bing to exfiltrate user conversation history, impersonate Microsoft support, or execute JavaScript in the sidebar. The same pattern applies to any RAG-backed agent.

## Attack Surface 3: Session History Manipulation and Cross-Session Contamination

RAG over external documents is the well-studied case. Less discussed is poisoning that targets the agent's own memory of its interactions — the session history, episodic memory, or learned preferences that an agent accumulates over time.

Agents that maintain a persistent memory store — retrieved at runtime to inform responses — expose an additional attack vector. If an attacker can influence what gets written to that store — whether by crafting user inputs that trigger misleading memory saves, by injecting into a source document that causes the agent to form a false belief, or by poisoning shared memory in a multi-tenant deployment — the corruption persists across all future sessions. Whether any given implementation is actually isolated by namespace, provenanced, or sandboxed is an architecture question that varies significantly across deployments; the threat model applies wherever those controls are absent.

The cross-session contamination scenario is particularly severe in shared deployments:

1. Attacker interacts with a shared agent (or submits content that the agent processes)
2. The agent stores a false belief or adversarial instruction in its memory store
3. Legitimate users in subsequent sessions receive responses conditioned on the poisoned memory
4. The memory entry looks internally generated — it has no foreign provenance marker

This mirrors the DNS poisoning structure exactly: the resolver's cache is populated from an external response, but once cached, the poisoned entry is indistinguishable from a legitimate one. Trust is inherited from the mechanism, not the content.

## Attack Surface 4: Embedding Space Manipulation

The vector representation layer introduces its own attack surface distinct from the semantic content of documents. Adversarial embeddings can be crafted to:

- **Proximity inflation**: A poisoned document's embedding is positioned near many high-value query embeddings, causing it to surface across a wide range of unrelated queries
- **Legitimate document suppression**: Adversarial texts engineered to have high cosine similarity to real documents, causing them to crowd out legitimate results when the attacker's document scores higher
- **Index corruption** (distinct threat model, requires datastore write access): An attacker who has compromised the vector store itself can modify stored embeddings directly to redirect retrieval without altering source documents. This is a datastore-compromise scenario rather than a purely embedding-layer attack — it's worth separating because the attacker capability required is substantially different from the semantic-manipulation techniques above

This class of attack is particularly hard to audit because the attack is in the embedding space, not the text. A human reviewing the knowledge base documents sees normal text. The threat only manifests at query time.

## What Mitigations Have Empirical Validation?

The defense literature is developing, but empirical validation is uneven. Here's a realistic assessment:

### Retrieval Re-ranking with Confidence Gating (Practitioner Response to PoisonedRAG Findings)

PoisonedRAG's paper demonstrates that naive top-K retrieval is fragile — even a handful of adversarially crafted documents can displace legitimate results. A practitioner response is to retrieve a larger candidate set, then apply a secondary re-ranking step that penalizes documents with anomalous semantic distance to the query compared to the rest of the candidate set. Isolated documents that rank highly but are dissimilar to other high-ranking candidates are a potential signal of injection. Note that the PoisonedRAG paper itself focuses on the attack side; this specific re-ranking heuristic is a practitioner inference from the attack's mechanics rather than an independently validated defense from the same work. It raises the required sophistication without eliminating the risk.

### Source Provenance Tracking (Theoretical, Architecturally Important)

Every document in the knowledge base should carry metadata tracking its origin, ingestion timestamp, and last-verified date. Retrieved chunks passed to the LLM should include this provenance in the context, and the system prompt should instruct the model to weight high-provenance sources more heavily than low-provenance ones. In practice, LLMs are not reliable provenance enforcers, but provenance metadata is essential for post-incident forensics — identifying when and from where a poisoned document entered the system.

### Memory Namespace Isolation (Architectural Control)

In multi-tenant or multi-user deployments, memory and knowledge stores must be isolated by namespace. A poisoned memory write from one session must not propagate to another user's retrieval context. This is an architectural control rather than a detection technique — it limits blast radius rather than preventing the initial injection.

### Adversarial Retrieval Testing (Operational Practice)

Before production deployment, RAG systems should be tested with known-malicious documents inserted into the knowledge base. Verify that (a) obvious injection attempts are not simply passed through to the LLM and (b) the system behaves correctly when the retrieved context contradicts the system prompt. If injected documents claiming "ignore all previous instructions" are passed verbatim to the model and acted upon, the system is unacceptably permissive.

### Input/Output Monitoring for Post-Retrieval Behavior (Operational Practice)

Responses that instruct the user to take external actions — clicking links, providing credentials, contacting external services — when the query context doesn't warrant it are a high-signal indicator of a retrieval-time injection. A behavioral monitor that flags anomalous action-instruction patterns in output can surface these cases; the actual detection rate will depend heavily on implementation specifics and attacker sophistication, and no independently validated benchmark exists for this control class as of this writing. It is best understood as a detection layer that complements — not replaces — upstream retrieval controls.

## The Defender's Checklist

Before a RAG system goes to production — or before extending an existing one with new data sources — audit against this list:

**Data ingestion controls**
- [ ] Can arbitrary external users modify documents that will be ingested? If yes, that's an untrusted input path.
- [ ] Are ingested documents validated for injection content before indexing (not just before query time)?
- [ ] Is there a process to remove documents and rebuild the index if a source is found to be compromised?

**Retrieval layer**
- [ ] Is the top-K retrieved context passed verbatim to the model, or is it re-ranked and filtered?
- [ ] Can a single retrieved document completely override information in the system prompt?
- [ ] Are retrieved documents that conflict with the system prompt flagged or down-weighted?

**Memory architecture**
- [ ] Are memory writes from user-facing sessions isolated from other users' retrieval namespaces?
- [ ] Is there provenance metadata on memory entries distinguishing user-derived from system-derived memories?
- [ ] Is there an audit log of memory writes that enables forensic reconstruction if poisoning is detected?

**Operational**
- [ ] Has the system been tested with adversarial documents in the knowledge base before deployment?
- [ ] Are outputs monitored for anomalous action-instruction patterns consistent with injection?
- [ ] Is there a documented response process for suspected knowledge base compromise, including index rebuild procedures?

## The Broader Pattern

Memory poisoning is not unique to AI. DNS cache poisoning, web cache deception, BGP route injection, supply chain attacks on package registries — all exploit the same architectural pattern: a system builds up cached state from external sources and then trusts that state implicitly in subsequent operations. The defense in each domain followed a similar arc: assume the cache can be corrupted, add provenance and freshness checks, implement tamper detection.

AI memory systems are early in that arc. The attack research, led by work like PoisonedRAG and the indirect injection literature, is running ahead of the defense tooling. Practitioners deploying RAG today are in a similar position to DNS operators before DNSSEC — the attacks are documented, the mitigations are partially understood, and the window between knowing about the threat and having production-grade defenses remains wide open.

The well is being poisoned. The question is whether your deployment was built with that assumption in mind.

---

*Further reading:*
- *Zou et al., "PoisonedRAG: Knowledge Corruption Attacks to Retrieval-Augmented Generation of Large Language Models," USENIX Security 2025 — [arXiv:2402.07867](https://arxiv.org/abs/2402.07867)*
- *Greshake et al., "Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection," ACM AISec 2023 — [arXiv:2302.12173](https://arxiv.org/abs/2302.12173)*
