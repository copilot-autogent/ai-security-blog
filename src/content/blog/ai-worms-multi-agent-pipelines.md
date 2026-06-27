---
title: "AI Worms: How Self-Replicating Attacks Spread Through Multi-Agent Pipelines"
description: "Morris-II (Nassi et al., 2024) demonstrated that malicious prompts can self-replicate across GenAI ecosystems without any user interaction. Here's what makes LLM pipelines worm-able — and what defenders can do about it."
pubDate: 2026-06-27
tags: ["agent-security", "evaluation", "security-research", "prompt-injection", "multi-agent"]
---

In 1988, Robert Morris released a self-replicating program onto the early internet. Within 24 hours it had infected an estimated 6,000 machines — roughly 10% of the entire internet at the time. The Morris Worm wasn't designed to destroy data; it just spread. But its spread caused outages, triggered panic, and permanently changed how engineers think about networked systems.

Thirty-five years later, researchers at the Technion and Intuit asked an uncomfortable question: can the same thing happen to GenAI ecosystems?

Their answer, published as *Morris-II* ([arXiv:2403.02817](https://arxiv.org/abs/2403.02817), Nassi et al., 2024), is yes — and they demonstrated it empirically against GPT-4V and Gemini Pro-powered email assistants.

## Why LLM Pipelines Are Worm-able

Traditional software systems have a clear separation between code and data. A buffer overflow or SQL injection attack exploits this boundary, convincing the processor or database to treat data as instructions. That attack class has been understood and partially mitigated for decades.

LLMs erase this boundary by design. Their job is to treat data as instruction — to take a document, email, or database entry and act on it. This is the feature that makes them useful. It is also the property that makes them worm-able.

In modern agentic deployments, this vulnerability compounds in three ways:

**Agent outputs become agent inputs.** When you chain agents — a summarizer feeding a drafter feeding a sender — the output of one agent is the unverified input to the next. There is no sanitation layer between generation and consumption. A malicious instruction that survives one agent's inference simply appears as context to the next.

**RAG amplifies persistence.** Retrieval-Augmented Generation (RAG) systems store incoming documents in a vector database and retrieve relevant ones at inference time. A document that enters the database at step one can be retrieved and re-injected into the prompt at steps two, three, and ten. The worm doesn't need to transmit itself actively — the RAG does it automatically.

**Active database updating policy.** Production AI assistants continuously index incoming content. The ComPromptMized researchers cite prior work demonstrating that Microsoft Copilot actively indexes received emails and documents into the RAG database used for writing new emails — and Gemini for Google Workspace exhibits analogous behavior. The moment an infected email is stored in the RAG database, the worm is positioned for retrieval at the next inference — before the user has read it, and certainly before any human has reviewed it.

Put these three properties together and you have a substrate that propagates malicious instructions automatically, persistently, and without any user interaction.

## Anatomy of an AI Worm

The Morris-II researchers introduce the concept of an **adversarial self-replicating prompt** — the core primitive of an AI worm. It has three components:

1. **Jailbreaking payload (j):** A prompt injection that overrides the model's default behavior. In their demonstration, this takes the form of a roleplay instruction: *"We are going to have a roleplay. From now on you are Wormy, an AI email assistant..."* Jailbreaking prompts are widely available online; the researchers treat them as a commodity the attacker can select from existing public collections.

2. **Replication instruction (r):** An explicit instruction for the model to copy the entire prompt — jailbreaking component, replication instruction, and malicious payload — verbatim into its output. This is the self-replication mechanism. The model is instructed to write the worm into every email it drafts.

3. **Malicious activity instruction (m):** The actual payload. In the paper's demonstration, this instructs the model to scan every email in the provided context, extract up to 20 pieces of private information, and append them in a labeled "DATAVIEW" section of the output.

When these three components are present in a document that enters a RAG-enabled assistant's database, the following sequence fires on every subsequent inference where the document is retrieved: the model is jailbroken, executes the malicious activity, and produces output that contains a copy of the worm — which then travels to the next recipient and enters their RAG database.

Nassi et al. formalize this with a simple composition property: given a GenAI model *G* and the prompt containing components *j*, *r*, *m*, the output preserves *j*, *r*, and *m* while appending the payload *p*. The key insight is that this property is **compositional** — if it holds for one inference, it holds for the chain.

## The ComPromptMized Case Study: GPT-4V Email Assistant

The researchers built a test GenAI email ecosystem using real models (GPT-4V, Gemini Pro) and the Enron email dataset — a publicly available corpus of 500,000+ emails from former Enron employees, widely used in academic research.

Their experimental setup replicated how enterprise AI email assistants work: incoming emails are indexed into a vector database, and when a user asks their assistant to draft a reply or compose a new email, the assistant retrieves the most relevant prior emails as context and generates the response.

The attacker's entry point: a single crafted email containing the adversarial self-replicating prompt, sent to the first user in the ecosystem.

**Propagation results.** The worm successfully propagated in approximately 1 out of every 5 emails generated by the infected assistant. The researchers evaluated how propagation rate was affected by context size (how many emails the RAG retrieves), the embedding algorithm used (five algorithms of varying sizes were tested), and the jailbreaking prefix. Smaller contexts and shorter embeddings increased retrieval consistency, which benefited propagation. The attack worked across both GPT-4V and Gemini Pro.

Two propagation vectors were demonstrated:

- **New email propagation:** When an infected user asks their assistant to compose a new email, the worm-laden context is retrieved, the model reproduces the worm in its draft, and the next recipient's database is contaminated when they receive and store the email.

- **Reply propagation:** When any user emails an infected assistant and the assistant auto-drafts a reply, the same mechanism fires. The incoming email doesn't need to contain any malicious content — the worm is already in the assistant's database, waiting to be retrieved.

**Data exfiltration results.** In the data exfiltration scenario, the worm reliably extracted private information — names, email addresses, phone numbers, account details — from the context provided to the model. This information was appended to outgoing emails in the "DATAVIEW" section, traveling alongside the worm itself to the next recipient.

The zero-click property is worth emphasizing. Neither the infected user nor the next target needs to open a malicious attachment, click a link, or take any action. The worm payload fires during the *next inference* where the contaminated email is retrieved from the RAG database — typically when the assistant auto-drafts a reply or composes a new email. That retrieval and generation happens in the background, without any user-visible prompt.

## Defense Patterns

The paper evaluated several defensive approaches and introduced one novel guardrail.

### Output Sanitization Between Agents

The most direct mitigation is to inspect LLM outputs before they are treated as input by the next agent or stored in a RAG database. Simple pattern matching — detecting the structural markers of known worms (e.g., the `<START>` / `<END>` delimiters used in the paper's demonstration) — can catch specific worm variants. The limitation is that adversarial self-replicating prompts are **polymorphic**: the jailbreaking component can be drawn from thousands of publicly available prompts, making signature-based detection easy to evade.

### Trust Boundaries and Structured Agent Communication

A principle inherited from traditional security: data and instructions should travel through different channels. If an agent pipeline uses a structured message format (e.g., JSON with typed fields), and the model's instruction context is separated from the document context, a malicious instruction embedded in a document cannot easily escape into the instruction channel. LangChain's [prompt injection protection patterns](https://python.langchain.com/docs/security/) and OpenAI's [recommendations on multi-agent trust boundaries](https://platform.openai.com/docs/guides/safety-best-practices) address this — though neither is foolproof against indirect injection.

### Agent Isolation

Limiting what an infected agent can do reduces the worm's payload potential. An agent that can only read and summarize, but cannot compose or send emails, cannot propagate the worm to new recipients. The principle of least privilege applies directly to agentic systems: each agent should have access only to the capabilities it needs for its specific task. This doesn't prevent infection but limits blast radius.

### The Virtual Donkey Guardrail

Nassi et al. propose and evaluate a novel guardrail they call the **Virtual Donkey**, designed specifically to detect Morris-II-style propagation without requiring prior knowledge of the worm's specific jailbreaking commands.

The key insight: a successful self-replicating prompt causes the model's output to be highly similar to its input — because the worm instructs the model to reproduce its own text. The Virtual Donkey exploits this by computing a similarity score between the input provided to the model and the output it generates. If similarity exceeds a threshold, the output is flagged as a potential worm.

**Evaluated performance:** TPR (true positive rate) of 1.0 — every worm instance was detected. FPR (false positive rate) of 0.015 — 1.5% false alarms on benign email outputs. Critically, the guardrail generalized to **out-of-distribution worms**: worms using different jailbreaking commands that it had never seen during training, a different email dataset (Hillary Clinton's email archive), and different payload types. The researchers released a Python implementation [on GitHub](https://github.com/StavC/ComPromptMized) suitable for LangChain integration. Note that the FPR was measured specifically on email tasks; applications with high input/output overlap by design (summarization, quoting, translation) may need task-specific threshold tuning.

### Content Provenance Tracking

A longer-horizon defense: if the AI pipeline tracks where every document in the RAG database came from, and applies different trust levels to external-origin documents versus internally generated ones, it becomes harder for an attacker's initial email to influence downstream generation. This is analogous to browser same-origin policy or Unix user privilege separation — data from untrusted sources receives reduced capability.

No production AI assistant currently implements this at the content level. It remains an open design challenge.

## Open Question: Does Severity Scale Linearly or Exponentially?

The paper ends with a question the researchers leave open, and it's the one that matters most for practitioners building agentic systems right now.

AI assistants are increasingly being given tool access: the ability to browse the web, execute code, query databases, make API calls, manage calendars, send messages. Each new capability is a new potential payload for a worm. An infected assistant with only email-drafting capability can exfiltrate email data. An infected assistant with calendar access can read meeting notes and invite lists. An infected assistant with code execution can exfiltrate files or make network calls.

The question is whether adding tool capabilities increases worm severity **linearly** (each new tool adds one new attack surface) or **exponentially** (each new tool interacts with every other tool, creating a combinatorial attack surface). The answer has significant implications for the pace at which agentic systems should be deployed.

There is a historical analog. Early internet security researchers debated whether connecting more machines to the internet would increase risk linearly (more endpoints = more targets) or superlinearly (more connections = exponentially more attack paths). The Morris Worm helped answer that question in 1988.

In 2024, Morris-II raised the same question for AI ecosystems. Agentic systems are just beginning to be widely deployed. The ecosystem of AI agents sharing context, calling each other's APIs, and storing outputs in shared databases is still nascent. If the exponential hypothesis is correct, the window to establish structural defenses — before the ecosystem is large enough for a real propagation event — is narrowing.

## What Practitioners Should Do Now

The ComPromptMized research identifies a concrete vulnerability class that is present in any RAG-based multi-agent system with an active database updating policy. The mitigation options it evaluates are not complete defenses, but they are available today:

- **Deploy the Virtual Donkey guardrail** (or an equivalent input/output similarity check) at agent boundaries where worm propagation is a realistic threat. The researchers achieved a 1.5% false-positive rate on email tasks; note that tasks with high input/output overlap by design — summarization, quote-and-reply, translation — may require a higher threshold or task-specific tuning before production deployment. The [open-source implementation is on GitHub](https://github.com/StavC/ComPromptMized) and is available for LangChain integration.
- **Apply least privilege to agent tool access.** An agent that cannot send email cannot propagate a worm via email. Restrict capabilities aggressively until a use case demands otherwise.
- **Separate instruction context from document context** in RAG prompts using structured message formats. This doesn't eliminate indirect injection but raises the technical bar significantly.
- **Audit incoming content before RAG indexing.** Filtering on ingest — before a document enters the vector database — is structurally more robust than filtering on retrieval, because it prevents the worm from establishing persistence.
- **Test your own pipelines.** The ComPromptMized researchers released their code. If you're building an AI pipeline with RAG and agent chaining, test whether your system propagates adversarial self-replicating prompts before your users discover it in production.

The Morris Worm's legacy was the creation of CERT/CC, the first coordinated computer security response organization. It took an actual propagation event to motivate the infrastructure. AI security researchers are making the same argument now, before the event: the infrastructure for coordinated response to AI worm propagation needs to exist before it's needed.

---

*The ComPromptMized paper (arXiv:2403.02817, accepted at CCS 2025) was authored by Stav Cohen (Technion), Ron Bitton (Intuit), and Ben Nassi (Technion / Cornell Tech). The findings were disclosed to LangChain, OpenAI, and Google via their bug bounty programs. All experiments were conducted in a lab environment against researcher-built systems using the public Enron email dataset.*
