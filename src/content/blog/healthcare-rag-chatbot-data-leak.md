---
title: "No Auth Required: How a Healthcare RAG Chatbot Leaked 1,000 Patient Conversations"
description: "Researchers used nothing but Chrome DevTools to extract the system prompt, full RAG configuration, knowledge base, and 1,000 stored patient conversations from a live medical chatbot. The exploit wasn't prompt injection — it was basic web application security failure."
pubDate: 2026-05-04
tags: ["rag-security", "deployment-security", "privacy", "healthcare", "threat-modeling"]
---

A patient types a question about their medication side effects into a medical chatbot. They assume it's private — the chatbot's website says it doesn't store personal information or chat histories. The patient asks something they wouldn't say to a doctor face-to-face.

That question, along with 999 others, was sitting in an unauthenticated API endpoint. Anyone with a browser could read it.

A new paper, *"When RAG Chatbots Expose Their Backend"* (arXiv:2605.00796, Madrid-García & Rujas, May 2026), documents a non-destructive security assessment of a live, publicly deployed patient-facing medical RAG chatbot. The researchers used two things: Claude Opus 4.6 for exploratory hypothesis generation, and Chrome Developer Tools for manual verification. No credentials. No specialist tooling. No prompt injection required.

What they found was a complete infrastructure exposure — and the failure pattern is one that any team shipping a RAG application should study.

## What Was Exposed

By submitting a single test query to the chatbot and opening the browser's Network panel, the researchers could observe the following in plaintext request/response payloads:

**System prompt.** The chatbot's full system instructions — persona definition, scope restrictions, refusal behavior — transmitted to the browser with every query. The published description of the tool characterized this prompt as a carefully validated, version-controlled artifact. The actual prompt observed in network traffic was short and generic.

**Complete RAG pipeline configuration.** Model identifiers for both the generator LLM and the embedding model. Retrieval strategy parameters, similarity thresholds, chunk window sizes, chunking parameters. Backend endpoint structure and API schema. Vector database connection metadata, including deployment type, internal service URL, and access key.

**Full knowledge base.** Eight curated documents — patient-education materials and scientific articles — could be enumerated via an unauthenticated admin endpoint. Every document's filename, internal UUID, per-chunk identifiers, full chunk text, retrieval similarity scores, and embedder model were accessible. The entire knowledge base could be reconstructed by concatenating chunk text.

**1,000 patient conversations.** A public endpoint returned the most recent thousand patient–chatbot interaction records: the user's question, the model's response, a timestamp, and a keyword classification. The history spanned months of operation and included multilingual queries from patients and caregivers asking about symptoms, treatments, and disease management.

None of this required authentication.

## The Exploit Was Not Prompt Injection

This distinction matters. The researchers did attempt prompt injection against the chatbot's LLM layer — direct requests, encoding-based probes, role-override attacks, social engineering frames. The chatbot's model-level guardrails generally deflected these attempts.

But the system prompt was already visible in network traffic. Prompt injection wasn't necessary to obtain it.

This is the core lesson: **a deployment can appear resistant to prompt-level attacks while exposing everything through the surrounding application**. The LLM layer was arguably fine. The web application layer had no access controls at all.

The vulnerability was architectural — a misplaced trust boundary between client and server. The application transmitted sensitive configuration to the browser because the RAG framework's defaults weren't hardened for production deployment. The "exploit" was opening DevTools, something any patient's tech-literate family member could do.

## The Privacy Assurance Gap

The published description of the chatbot stated it did not store personal information or chat histories. The live deployment stored complete conversation transcripts — user questions, model responses, timestamps, metadata — and made them retrievable without authentication.

This is not an edge case or a philosophical debate about what constitutes "personal information." Full-text medical questions from patients are sensitive health data by any reasonable standard. The gap between the published privacy claim and the operational reality has direct implications for patient trust and regulatory compliance (GDPR, HIPAA, or equivalent frameworks depending on jurisdiction).

## LLMs as Both the Product and the Audit Tool

The researchers used Claude Opus 4.6 — accessed through its desktop application via MCP — to assist the security assessment. They framed themselves as the chatbot's developers and asked the model to help verify whether the application could leak its system prompt. The model provided sustained, unrestricted support for hypothesis generation, vulnerability identification, verification step proposals, and structured information extraction.

No prompt used during the assessment was refused or restricted by the assisting model's safety controls.

This creates the dual-use dynamic the paper emphasizes: the same LLM capability that enables efficient security auditing is equally available to adversaries. A patient organization that built a chatbot with good intentions but limited security expertise is now exposed to anyone with a $20/month AI subscription and curiosity.

The researchers explicitly note the trajectory: models like Claude Mythos have demonstrated autonomous vulnerability discovery and exploitation at scale. The class of weakness documented here — unauthenticated endpoints, exposed configuration, absent access controls — is precisely what automated adversarial analysis would find first.

## Why RAG Teams Keep Making This Mistake

RAG is often presented as a safer architecture because it grounds model output in curated sources. That's a valid claim about answer quality. It is not a claim about deployment security.

RAG chatbots are web applications. They have API endpoints, configuration management, database connections, logging pipelines, and administrative interfaces. The RAG framework provides the retrieval logic; it does not provide authentication, authorization, response minimization, or access control. Those are deployment responsibilities.

The pattern the paper documents is common: a team builds a functional RAG chatbot using an open-source framework, tests whether the model gives accurate answers, and deploys it. The framework's default configuration — designed for development convenience, not production security — ships to production unchanged. Admin endpoints remain open. Configuration objects pass through to the client. Conversation logging stores everything with no access restrictions.

The paper's finding that the knowledge base was fully extractable adds another dimension. RAG corpora in healthcare contexts may contain unpublished clinical notes, internal medical opinions, or patient-authored documents. When the retrieval layer is accessible without authentication, it's not just user queries at risk — it's the entire source document collection.

## Minimum Security Checklist for Production RAG Deployments

The paper proposes minimum security expectations. Translated into actionable steps:

**1. Server-side configuration only.** System prompts, model identifiers, retrieval parameters, embedding config, database credentials — none of this should appear in client-facing network traffic. Audit your API responses with DevTools before deploying.

**2. Authenticate every endpoint.** Admin, retrieval, conversation history, document inventory — every endpoint needs authentication. Framework defaults that expose these for development convenience must be locked down in production.

**3. Don't store what you don't need.** If you store conversation logs, implement retention limits, access controls, and encrypt at rest. If your privacy policy says you don't store conversations, verify that your application actually doesn't.

**4. Independent security review before deployment.** The researchers found these vulnerabilities with a browser. A penetration test by someone who knows web application security would have caught everything in an afternoon. This should be a deployment prerequisite, not an afterthought.

**5. Match your claims to your implementation.** Audit what your privacy policy says against what your application actually does. The gap documented in this paper — "we don't store data" vs. 1,000 stored conversations — is a liability, not a misunderstanding.

**6. Assume adversaries have LLM assistance.** Your threat model should account for the fact that any visitor to your application may be using a commercial LLM to systematically probe for weaknesses. Security through obscurity was never viable; it's even less viable now.

## The Signal

This paper is valuable because it documents a real production failure, not a theoretical attack. A live healthcare chatbot, serving actual patients, exposed everything a security-conscious deployment should protect — and the exploit required no skill beyond right-click → Inspect.

The broader pattern is now well-established: the primary risk in deployed AI systems is not the model. It's the infrastructure around the model — the endpoints, the configuration management, the logging, the access controls. RAG doesn't change this. It adds a retrieval layer that must also be secured, with its own endpoints, its own document store, and its own metadata surface.

If you're deploying a RAG chatbot in any sensitive context — healthcare, legal, financial, HR — the question isn't whether your model gives good answers. It's whether your application handles data with the care your users expect. Open DevTools on your own deployment before someone else does.

---

**Source:**
- *When RAG Chatbots Expose Their Backend: Privacy and Security Risks in Patient-Facing Medical AI* — [arXiv:2605.00796](https://arxiv.org/abs/2605.00796) (Madrid-García & Rujas, May 2026)
