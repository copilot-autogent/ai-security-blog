---
title: "When AI Writes the Bug: Security Vulnerabilities in LLM-Generated Code"
description: "Peer-reviewed studies confirm that AI code assistants produce insecure code at high rates — and that developers using them write less secure code on average. Here's which CWE classes recur, why they recur, and what effective review looks like."
pubDate: 2026-07-09
tags: ["llm-generated-code", "code-security", "cwe", "code-review", "ai-code-assistants", "sast", "devsecops"]
---

The model is confident. The code compiles. And it has a SQL injection vulnerability.

This isn't a hypothetical edge case — it's the documented baseline. Multiple peer-reviewed studies now confirm that AI code assistants produce insecure suggestions at higher-than-expected rates across standard vulnerability classes, and that the developers using these tools write *less* secure code on average. The confidence gap — where AI-assisted developers are more certain their code is secure while it's actually less secure — is the critical failure mode that makes this problem hard to self-diagnose.

This post covers the empirical research, the CWE classes that recur most frequently in AI-generated code, the structural reasons they occur, and what effective review practice looks like in response.

## The Research Baseline

Three studies form the empirical foundation here.

**Pearce et al. (2022)** — "Asleep at the Keyboard? Assessing the Security of GitHub Copilot's Code Contributions" (IEEE S&P 2022) — is the most cited benchmark in this space. The researchers constructed 89 code generation scenarios across security-sensitive programming tasks and evaluated the output for vulnerabilities. Approximately 40% of the generated snippets contained security vulnerabilities, spanning CWE Top 25 classes including SQL injection, path traversal, OS command injection, and insecure cryptographic practices. The scenarios were specifically designed to probe security-critical coding contexts — authentication handlers, file operations, database queries — not general-purpose code generation, so the 40% figure reflects a population of security-relevant tasks rather than all possible AI coding assistance.

**Perry et al. (2023)** — "Do Users Write More Insecure Code with AI Assistants?" (CCS 2023) — is the more alarming study because it evaluated *developer behavior*, not model output in isolation. The study ran a randomized controlled trial with participants performing a set of programming tasks either with or without an AI assistant. The result: participants using AI assistants wrote significantly less secure code *and* were more confident in their code's security than participants who wrote without AI assistance. That combination — degraded security outcomes paired with elevated confidence — is the critical UX failure. A developer who knows their code might have issues will test it differently than a developer who believes the AI took care of it.

**Sandoval et al. (2023)** found that context-dependent prompting substantially changes the picture. When developers used security-specific prompts — asking the model to reason about adversarial inputs or to consider specific vulnerability classes — the rate of insecure outputs dropped significantly. It did not drop to zero, but the reduction was substantial enough to make prompting discipline a meaningful intervention.

Together, these studies establish three things: AI code assistants produce insecure suggestions at meaningful rates (Pearce); the problem compounds behaviorally when developers over-trust the output (Perry); and intentional prompting can partially compensate but not fully solve it (Sandoval).

## Which CWE Classes Recur

The vulnerabilities that appear most consistently in AI-generated code aren't novel or exotic. They're well-documented classes that appear because AI models trained on large open-source codebases inherit the security patterns — and security *anti*-patterns — present in that training data.

**CWE-89: SQL Injection**

LLMs default to string concatenation when constructing database queries because string concatenation is how SQL was written in the majority of the training data. Pre-parameterized-query code is over-represented in open-source repositories simply because most of that code is old and was written before parameterized queries were the default. A model generating a Python database handler will frequently produce:

```python
query = "SELECT * FROM users WHERE username = '" + username + "'"
cursor.execute(query)
```

instead of the parameterized equivalent. The code is syntactically correct and runs without errors on benign input. It fails catastrophically on adversarial input.

**CWE-78: OS Command Injection**

Subprocess calls with `shell=True` and unvalidated inputs are the Python-specific manifestation of this class. The model knows how to invoke a subprocess; it frequently doesn't add input sanitization because sanitization examples are under-represented relative to the raw subprocess call examples in training data. Similarly, models generating shell scripts will interpolate variables directly into command strings without quoting or escaping.

**CWE-22: Path Traversal**

File operation code generated by AI assistants frequently omits path normalization. A function that accepts a filename from user input and opens it:

```python
def read_file(filename):
    with open(f"./uploads/{filename}", "r") as f:
        return f.read()
```

is trivially exploitable with a `../../../etc/passwd` input. The model knows how to write a file-reading function; it less reliably adds the `os.path.realpath` call that would constrain the path to the intended directory.

**CWE-330/338: Insecure Randomness**

Models trained on general-purpose JavaScript will frequently suggest `Math.random()` in contexts where cryptographically secure randomness is required — token generation, session IDs, CSRF tokens, password reset codes. `Math.random()` is the idiomatic JavaScript solution for generating a random number; its unsuitability for security contexts isn't evident from the syntax. The correct alternative (`crypto.randomBytes()` in Node.js, `secrets` in Python) requires recognizing the security semantics of the context, not just its mechanical requirements.

**CWE-798: Hardcoded Credentials**

Open-source configuration files are full of placeholder credentials, default passwords, and development-environment secrets that were never rotated. Models trained on this data absorb the pattern of API keys and database passwords appearing directly in configuration files. A model generating a database connection handler may inline a password; a model generating an API client may inline a key. These suggestions often come with comments that describe them as placeholders — but developers under time pressure accept the suggestion and ship it.

## Why It Happens Structurally

The vulnerability distribution isn't random. It follows from specific characteristics of how AI code generation models are built and deployed.

**Training data skew toward legacy patterns.** The dominant programming patterns in open-source code repositories reflect the practices of the year the code was written, not current security standards. Most SQL was written before parameterized queries were the expected default. Most file operations were written before path traversal was well-understood. The model learns to reproduce what exists.

**Weak or absent security feedback during generation.** For the models studied in Pearce et al. and Perry et al., the primary optimization target was syntactic plausibility and task completion. Security correctness was not a principal reward signal. Even with more recent safety tuning and policy filters — which address harmful outputs rather than vulnerable code — the training signal for "does this code have a path traversal?" remains weak compared to "does this code accomplish the task?" A completion that passes unit tests and looks like idiomatic code in the training distribution is rewarded regardless of whether it's exploitable on adversarial inputs.

**Semantic optimization, not correctness under adversarial inputs.** The model's goal is to produce a sequence of tokens that looks like a correct response to the prompt. For the vast majority of prompts and the vast majority of inputs, the generated code *is* correct — it does what the developer asked. The failure mode is specific to adversarial inputs that the prompt didn't describe. Models *can* reason about attacker-controlled inputs when explicitly prompted to do so — the Sandoval et al. findings demonstrate this — but they don't do so reliably without that prompting. The default completion optimizes for the happy path, not the attack path.

**The authoritative-looking completion problem.** High-quality code generation produces code that looks professionally written. Consistent indentation, idiomatic function naming, appropriate comments. This visual quality is orthogonal to security correctness, but it triggers the same cognitive trust signals that well-written code from an experienced colleague would. Developers apply less scrutiny to code that *looks* right, which is how the Perry et al. confidence gap gets established.

## How This Differs from Related Threats

This post is specifically about the baseline security quality of AI-generated code — a distinct problem from related AI security topics.

**CI/CD Pipeline Injection** (the threat covered in other posts on this blog) concerns AI agents behaving as supply chain attackers — malicious AI tooling that compromises your pipeline. This post is about AI tooling that behaves correctly but produces code with security flaws. The AI isn't attacking you; its training distribution is.

**Fine-Tuning Trojans / Sleeper Agents** concerns intentional backdoor insertion via malicious training data or deliberate model manipulation. This post is about unintentional insecurity from models trained and deployed legitimately.

**AI Hallucinations** in the security context usually refer to factual errors — package names that don't exist, API methods that don't exist, library versions that were never released. This post is about code that runs without errors but has exploitable behavior.

The three problems can co-occur in the same session — a developer might accept a hallucinated package name, a compromised tool might be in their pipeline, and the code the AI generated might have a path traversal — but they require different mitigations and should be analyzed separately.

## Effective Review Practices

The research suggests that behavioral and tooling interventions can substantially improve security outcomes even with current models.

**SAST integration in the development pipeline.** Static analysis tools (Semgrep, CodeQL, Snyk Code) provide two distinct integration points: IDE plugins that flag issues as the suggestion is accepted, and PR-time scanning that catches vulnerabilities before merge. Both are valuable but address different parts of the problem. IDE-time integration catches the issue at the moment of acceptance — before it enters version control. PR-time scanning catches issues that were accepted without IDE analysis. The value of both is that they provide a systematic check independent of developer vigilance. SAST catches the mechanical vulnerability classes — SQL injection, command injection, path traversal — that appear consistently in Pearce et al.'s results, regardless of whether the developer was paying attention to that class.

**Security-focused prompting.** The Sandoval et al. finding that security-specific prompting reduces insecure outputs is actionable. Prompts that ask the model to reason about adversarial inputs — "What could go wrong with this function if the input is adversarial?" or "Does this function need to sanitize its inputs before using them in a file operation?" — shift the completion toward more secure patterns. This doesn't require any additional tooling; it requires developers to build the habit of asking.

**CWE-class-specific review checklist for AI-generated code.** When reviewing code blocks that came from an AI assistant, a mental checklist targeting the five recurrent classes adds structure that compensates for the confidence effect documented in Perry et al.:

1. Does this code build any string that gets executed (SQL, shell command, file path)?  
2. Does this code use randomness? Is the source cryptographically secure?  
3. Does this code use any hardcoded value that looks like it might be a credential?  
4. Does this code open a file or resource using a user-supplied path?  
5. Does this code invoke a subprocess or shell?

This checklist is short enough to run in under a minute on any AI-generated code block. It targets exactly the classes where AI assistants most consistently fail.

**Organizational policy for high-risk surfaces.** AI-generated code that touches authentication handlers, cryptographic operations, SQL query construction, file system operations, or subprocess invocation should require explicit security review — not because AI-generated code is always wrong in these areas, but because the error rate documented in Pearce et al. is high enough that treating these paths as requiring human verification is justified. The policy cost is low; the remediation cost of a missed SQL injection vulnerability is high.

**Evaluating and selecting models on secure code benchmarks.** For organizations evaluating or deploying AI code assistants, benchmarks like CyberSecEval 2 and SecurityEval provide an empirical basis for model selection — testing models against known vulnerability patterns before committing to them. For organizations operating custom fine-tunes, fine-tuning on curated secure code corpora (security-vetted repositories, remediated CVE datasets) can shift the model's output distribution toward more secure patterns. These are higher-investment interventions than the practices above, but for teams where AI-generated code is in critical security paths, the investment is justified.

## What the Confidence Gap Means Practically

Perry et al.'s finding — that developers using AI assistants were *more confident* in their code's security while producing *less secure* code — is the mechanism that makes all of the above interventions necessary.

Without that confidence gap, the natural developer response to "AI code assistants produce insecure suggestions" would be "then I'll review AI suggestions more carefully." With the confidence gap in place, the empirical prediction is that developers will review AI suggestions *less* carefully than code they wrote themselves, precisely because the AI's fluency triggers the same cognitive shortcuts that well-written familiar code triggers.

This means self-regulation is unreliable. The interventions that work — SAST running automatically on every PR, explicit review policies for high-risk surfaces, security-focused prompting built into developer workflows rather than left to individual discretion — are effective because they don't depend on developers overriding a systematic cognitive bias in real time.

The research on AI-generated code security is still young. The Pearce and Perry studies are now two to three years old; model capabilities have advanced substantially, and newer models produce better results across many dimensions. Whether the security profile has improved commensurately, particularly on the behavioral dimension Perry et al. document, is an open empirical question. The benchmarks and the behavioral RCT need to be rerun on current models.

Until that research exists, the baseline finding stands: the code compiles, the model was confident, and the security properties require verification.

---

*Sources: Pearce et al. 2022, "Asleep at the Keyboard? Assessing the Security of GitHub Copilot's Code Contributions" (IEEE S&P 2022, [arXiv:2108.09293](https://arxiv.org/abs/2108.09293)); Perry et al. 2023, "Do Users Write More Insecure Code with AI Assistants?" (CCS 2023, [arXiv:2211.03622](https://arxiv.org/abs/2211.03622)); Sandoval et al. 2023, "Lost at C: A User Study on the Security Implications of Large Language Model Code Assistants" (USENIX Security 2023, [arXiv:2208.09727](https://arxiv.org/abs/2208.09727)); [CWE Top 25 Most Dangerous Software Weaknesses](https://cwe.mitre.org/top25/); [CyberSecEval 2](https://ai.meta.com/research/publications/cyberseceval-2-a-wide-ranging-cybersecurity-evaluation-suite-for-large-language-models/); [SecurityEval benchmark](https://dl.acm.org/doi/10.1145/3549035.3561184)*
