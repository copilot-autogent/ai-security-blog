---
title: "RAG Privacy Attacks: How Retrieval-Augmented Generation Pipelines Leak Private Documents"
description: "RAG makes LLMs accurate by indexing private documents — but the retrieval pipeline introduces a new attack surface. Adversarial queries can extract document chunks, embedding inversions recover original text, and multi-tenant isolation fails in ways that bypass document ACLs entirely."
pubDate: 2026-07-04
tags: ["rag", "privacy", "data-exfiltration", "vector-databases", "embeddings", "multi-tenant", "prompt-injection"]
---

Imagine an enterprise deploys a RAG chatbot over its internal document repository — HR policies, legal contracts, engineering specs, financial forecasts. Access control is enforced at the source system level: employees can only retrieve documents they're authorized to view. The RAG pipeline provides the "relevant context" to the LLM, and the security model depends on "documents are only retrieved when relevant to authorized users."

An attacker with standard employee-level access begins crafting queries. Not to get answers — to extract documents. By the end of the week, they have confidential legal strategy memos and compensation bands they were never authorized to see. They never broke a password. They just asked the right questions.

This is the RAG retrieval attack surface. It is distinct from KV-cache contamination across inference batches (covered in the #177 post on cross-tenant contamination) — that's about shared computation state at the inference layer. This is about the **retrieval layer**: the vector database, chunking pipeline, and similarity-based document selection as the attack surface.

---

## RAG Architecture: Where Sensitive Data Flows

A standard RAG pipeline has five stages where sensitive data is present:

1. **Document ingestion and chunking** — source documents are split into overlapping chunks (typically 256–1024 tokens). The chunking strategy determines granularity of information that can be extracted per query.

2. **Embedding** — each chunk is converted to a dense vector via an embedding model (OpenAI `text-embedding-3-large`, Cohere `embed-v3`, open-source alternatives). The embedding captures semantic content; multiple researchers have demonstrated it captures more than that.

3. **Vector store indexing** — embeddings are stored in a vector database (Pinecone, Weaviate, Chroma, pgvector, Milvus) alongside metadata. The metadata typically includes document ID, source path, access control attributes, and timestamps.

4. **Retrieval at query time** — user query is embedded, and the top-*k* most similar document chunks are retrieved via approximate nearest-neighbor search. The similarity score and chunks are returned.

5. **Context injection and generation** — retrieved chunks are injected into the LLM prompt as context. The LLM generates a response grounded in the retrieved content.

At each stage, an adversary can attempt extraction. The retrieval layer (stages 2–4) is particularly exposed because it is specifically designed to respond to semantic queries — that's the feature that also makes it extractable.

---

## Retrieval Oracle Attacks: Document Extraction via Crafted Queries

The retrieval system is designed to find documents similar to a query. An adversary can invert this: if they want to extract a specific document's content, they craft queries that maximize cosine similarity to that document's chunks.

### Targeted Extraction (Known-Document)

If an attacker knows (or suspects) that a specific document exists in the index — say, a contract with a named counterparty — they can construct queries that directly target that document's likely content:

- Query with the document title or known excerpts to anchor similarity
- Iterate over slightly varied paraphrases to retrieve different overlapping chunks
- Reconstruct the document from overlapping chunk extractions

The analogy to SQL injection is apt: the query language (natural language + embedding similarity) becomes an adversarial input targeting the storage layer, not the LLM. The LLM is incidental — the damage happens at retrieval.

### Blind Extraction (Unknown-Document)

Without prior knowledge of document content, an attacker can use systematic tiling of the embedding space:

- Generate queries covering diverse semantic areas (legal, financial, HR, technical)
- Each query returns *k* document chunks; track which chunks have been seen
- Iteratively refine queries to reach uncovered parts of the document corpus

This is computationally intensive but feasible at employee-level query rates if the system lacks retrieval rate limiting. The key constraint is the size of the embedded document corpus — smaller corpora are fully extractable in hours.

### The Chunking Granularity Tradeoff

Finer chunking (smaller chunks, more overlap) improves retrieval precision but increases extraction granularity. An adversary extracting from a fine-grained index can reconstruct document structure more precisely. The security and utility requirements are in direct tension.

---

## Embedding Inversion: Recovering Text from Vectors

The embedding itself is sensitive. Morris et al. (2023) demonstrated in **vec2text** ([arXiv:2310.06816](https://arxiv.org/abs/2310.06816)) that dense text embeddings contain enough information to approximately recover the original text — with high fidelity for short passages.

The attack works through an iterative refinement process: starting from an initial text hypothesis, an inversion model refines the approximation to minimize the distance between its embedding and the target embedding. For short texts and modern embedding models, the reconstructed text is often near-verbatim.

### Practical Risk Surfaces

**API responses that include embeddings**: Any endpoint that returns raw embedding vectors alongside retrieval results exposes more information than it appears to. A caller who collects embeddings over multiple queries can reconstruct document content without ever receiving the document text directly.

**Embedding vectors in logs**: Observability pipelines often log query embeddings for debugging or analytics. If those logs are accessible to lower-privilege users, they constitute a side-channel to the document corpus.

**Shared embedding caches**: Caching query embeddings for performance (to avoid recomputing embeddings for repeated queries) may inadvertently expose those cached vectors to processes that share the cache.

**Model-specific fidelity**: The vec2text results were demonstrated against OpenAI and Cohere embedding models with particularly high fidelity. Open-source models show varying inversion quality, but the attack is demonstrated to work across model families. The practical implication: don't treat embedding vectors as opaque or non-sensitive.

---

## Multi-Tenant RAG: Isolation Failures

Enterprise RAG deployments often serve multiple users or teams from a shared vector index, relying on metadata filters to enforce document-level access controls. This isolation is harder to implement correctly than it appears.

### Namespace Collisions and Filter Bypasses

Most vector databases support **namespace** or **collection** isolation (logical separation of index segments) and **metadata filters** (query-time predicates on document attributes). A common pattern is to add a tenant ID filter to every query, so User A's queries only retrieve User A's documents.

The failure mode: **hybrid search interactions**. When combining vector similarity with metadata filtering, the order of operations matters. Some implementations apply the filter after the top-*k* retrieval — meaning the vector search considers all documents in the index, and the filter is applied as a post-processing step. This approach is vulnerable when the filter reduces results below *k*, causing the system to return lower-ranked cross-tenant documents to fill the result set.

The secure pattern requires filtering-before-ranking: the vector search must operate only over the tenant's document set, not the global index with post-hoc filtering. Not all vector database configurations enforce this by default.

### Cross-Tenant Poisoning via Shared Knowledge Bases

Enterprises commonly build shared knowledge bases — indexing public documentation, industry references, or cross-team guidelines accessible to all employees. This shared namespace creates an indirect contamination path:

A low-privilege attacker who can contribute to any input the RAG pipeline indexes — public wikis, shared issue trackers, customer-facing docs, GitHub repos — can plant adversarial content. When another user queries on a related topic, the injected content gets retrieved into their context window. This is the retrieval-specific pathway of indirect prompt injection (Greshake et al. 2023, [arXiv:2302.12173](https://arxiv.org/abs/2302.12173)).

The multi-tenant dimension: in a shared knowledge base, the attacker targets the intersection of "content I can influence" and "content that will be retrieved in high-value contexts." Shared documentation indexed alongside confidential internal content is particularly dangerous because the shared namespace creates a retrieval path from attacker-controlled content to privileged user contexts.

### Permission Propagation: The Stale Index Problem

Document access controls rarely propagate to the vector store in real time. The common pattern:

1. Document is indexed at upload time; ACLs are stored as metadata
2. Document is later restricted (employee departs, contract expires, project is classified)
3. Source system ACL is updated — but the embedding remains in the vector index

Queries after the ACL change still retrieve the stale embedding, and the chunk text in the vector store still contains the now-restricted content. The index becomes a snapshot of document permissions at indexing time, not a live reflection of current authorization state.

The same failure applies to **document deletion**: deleting a document from the source system doesn't automatically delete its embeddings from the vector store unless the deletion event is explicitly propagated. This is an architecturally easy failure to make — the vector store is often a separate system not integrated with the identity/access management pipeline.

---

## Metadata and Similarity Leakage

Even without extracting document content, the retrieval interface leaks structural information:

**Existence confirmation**: Querying with a specific phrase and observing whether it retrieves high-similarity results confirms whether that phrase exists in the indexed corpus. An attacker can probe for sensitive terms (names, project codes, financial figures) without seeing the source documents.

**Document structure inference**: Similarity score distributions reveal chunk density. High similarity scores for slightly varied queries indicate the queried concept is present across multiple document chunks — suggesting a substantial indexed document on that topic.

**Top-*k* exposure**: Returning more results per query increases retrieval quality but also increases the information surface. Each returned chunk is a potential extraction target.

---

## Threat Model

| Attack | Required Access | Primary Target | Impact |
|---|---|---|---|
| Targeted retrieval extraction | Employee-level query access | Specific known documents | Confidential document exfiltration |
| Blind corpus extraction | Employee-level query access | Entire indexed document set | Full corpus exfiltration (high effort) |
| Embedding inversion | Access to embedding API or logs | Any embedded text | Approximate text reconstruction |
| Namespace bypass via filter-after-rank | Employee-level query access (cross-tenant) | Other tenants' documents | Cross-tenant data access |
| Cross-tenant injection | Write access to shared indexable content | High-privilege user contexts | LLM response hijacking |
| Stale-index ACL bypass | Employee-level query access | Documents restricted after indexing | Access to revoked-permission content |
| Metadata existence probe | Employee-level query access | Document existence/content | Sensitive term enumeration |

---

## Defenses

### Tenant-Scoped Namespaces + Mandatory Pre-Filter Retrieval

The fundamental isolation control: every document must be tagged with an owner/tenant identifier, and vector searches must apply the tenant filter **before** ranking — not after. The vector index should logically operate over only the querying tenant's document set. Implement this at the query construction layer, not as an application-level guard that can be bypassed.

### Permission Propagation to the Vector Store

Treat the vector index as a dependent of the source system's ACL. When a document is restricted, reclassified, or deleted in the source, the vector store must be updated synchronously or via a reliable queue — not lazily on next-index-cycle. Implement a deletion audit log to verify propagation within an SLA.

### Retrieval Auditing

Log every retrieval event: which query, which chunks retrieved, which user, what similarity scores. Retrieval logs are the primary forensic artifact for detecting systematic extraction — an employee querying 3,000 diverse topics across two weeks generates a very different retrieval pattern than normal use. Behavioral analytics over retrieval logs can detect both targeted and blind extraction attempts.

### Rate Limiting on Retrieval

Systematic corpus extraction requires volume. Per-user rate limiting on embedding API calls and retrieval requests constrains blind extraction attempts. Rate limits should be calibrated to normal use patterns, not set permissively. Anomalous burst patterns (many diverse queries, rapid paging through results) should trigger throttling or alerting.

### Adversarial Document Detection Before Indexing

Before a document is indexed, apply content policy filtering to detect embedded prompt injection payloads. This is particularly important for any shared knowledge base that aggregates content from multiple sources or allows user contributions. Treat externally-sourced content as potentially adversarial at the indexing stage, not only at retrieval time.

### Avoid Returning Raw Embeddings in API Responses

Don't expose raw embedding vectors in retrieval API responses unless there is a specific application requirement. When embeddings are needed for application logic, generate them separately from the retrieval endpoint. Log aggregation pipelines should strip embedding vectors before storage.

### Differential Privacy for Embeddings (Research Stage)

**DP-embed** approaches — adding calibrated noise to embedding vectors before storage to degrade inversion quality while preserving approximate retrieval quality — are an active research area. The practical deployment challenge is the privacy-utility tradeoff: noise sufficient to frustrate vec2text inversion may degrade retrieval quality enough to matter. Current research results suggest the tradeoff is tractable for some embedding models and query distributions, but this is not yet a production-ready pattern.

---

## Distinguishing This from KV-Cache Contamination

The KV-cache contamination attack (post #177) operates at the **inference layer**: cached attention key-value states from one user's prompt can be reused in another user's generation context if inference batching shares KV cache across sessions. The attacker target is inference-time computation state.

RAG retrieval attacks operate at the **retrieval layer**: the vector database and embedding pipeline. The attacker target is the stored document corpus and the retrieval mechanism. The two attack surfaces are complementary — a fully hardened RAG pipeline needs defenses at both layers.

The retrieval layer is architecturally upstream of inference. A successful retrieval attack injects sensitive content into the LLM's context window before generation begins; KV-cache contamination affects the computation that transforms that context into an output. Defenders should evaluate both surfaces independently.

---

## Practical Recommendations

For teams building or auditing RAG deployments:

1. **Audit your vector search implementation for filter-before-rank.** Pull the query construction code; confirm the tenant filter is applied as a hard constraint on the search space, not a post-retrieval filter. This is the most common misconfiguration and the highest-impact fix.

2. **Map deletion propagation.** For every document type in your RAG corpus, trace the path from "document is deleted/restricted at source" to "embedding is removed from vector store." If that path is not automated and monitored, you have a stale-index exposure.

3. **Treat retrieval logs as a first-class security artifact.** Ensure retrieval events are logged with user identity, query semantics (not just the embedding), and chunk IDs returned. Confirm those logs are in scope for your security information and event management system.

4. **Do not return raw embedding vectors from retrieval APIs.** Review API response schemas; strip embedding fields unless actively used by the calling application.

5. **Apply content policy filtering at indexing time.** For any shared or user-contributed knowledge base, assume adversarial content. Filter before indexing, not only at generation time.

6. **Rate-limit retrieval at the per-user level.** Verify your rate limiting covers the embedding endpoint, not just the chat/generation endpoint. An attacker targeting the retrieval layer may bypass a rate limit that only applies to the LLM call.

---

*References:*

- *Lewis et al. 2020. [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks](https://arxiv.org/abs/2005.11401). NeurIPS 2020.*
- *Greshake et al. 2023. [Not What You've Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection](https://arxiv.org/abs/2302.12173). arXiv:2302.12173.*
- *Morris et al. 2023. [Text Embeddings Reveal (Almost) As Much As Text](https://arxiv.org/abs/2310.06816). arXiv:2310.06816.*
