---
title: "The AI Security Tooling Landscape: Garak, PyRIT, Promptfoo, and the Open-Source Red-Team Ecosystem"
description: "A practitioner's map of the open-source and commercial AI security tools landscape: what each tool does, which attack classes it tests, how to integrate it into a CI/CD pipeline or red team engagement, and which gaps no existing tool yet covers."
pubDate: 2026-07-13
tags: ["red-teaming", "llm-security", "tools", "garak", "pyrit", "promptfoo", "devsecops", "vulnerability-scanning", "open-source"]
relatedPosts: ["automating-red-team-ai-at-scale", "llm-guardrails-decision-guide", "ai-incident-response-playbook", "ai-security-tool-comparison-snyk-codeql-q-autofix", "prompt-injection-defenses-privilege-separation-structured-outputs"]
---

The AI security practitioner's toolkit doesn't look like a traditional security toolkit. Burp Suite won't tell you whether a language model can be jailbroken through role-playing. Semgrep won't catch prompt injection in your LangChain pipeline. OWASP ZAP has nothing to say about whether your model hallucinates toxic content under adversarial pressure.

This post maps the current open-source and commercial AI security tooling landscape for practitioners who need to build or expand a testing program. The goal isn't comprehensive coverage of every tool — it's enough accuracy about the tools that matter most to give you a real starting point.

A caveat before we begin: this landscape changes rapidly. Star counts, capability matrices, and project statuses shift between the time a post is written and the time you read it. Treat specific capability claims as a starting point for your own verification against official documentation, not as authoritative current state.

## Why Traditional Security Tools Miss AI Vulnerabilities

Traditional SAST and DAST tools were designed around a threat model that assumes a code artifact — source code, compiled binary, network endpoint — where vulnerabilities arise from implementation defects: memory safety errors, injection points, missing authentication checks. Their analysis engines reason about control flow, data flow, and protocol conformance.

AI vulnerabilities don't arise from implementation defects in that sense. They arise from the *behavior* of the model itself:

- **Prompt injection** exploits the model's inability to reliably separate instructions from data — a problem with no equivalent in traditional web security analysis
- **Jailbreaks** exploit the tension between a model's base training and its fine-tuned safety constraints — invisible to any static or dynamic analyzer
- **Hallucination elicitation** probes whether a model fabricates dangerous information (synthesis routes, medical advice) under the right framing — a behavioral failure mode, not a code defect
- **Training data extraction** attempts to recover memorized private data from model outputs — requires query-response analysis over model APIs, not source inspection

Addressing these requires a fundamentally different tooling approach: **behavioral probing** through the model's API, with test cases designed around known attack classes rather than code patterns.

## The Landscape Map

AI security tooling falls into three categories that align with where in your pipeline you use them:

| Category | Role | When to use |
|---|---|---|
| **Offensive / vulnerability scanning** | Systematically probe a model for exploitable weaknesses | Pre-deployment assessment, ongoing red team engagement |
| **Evaluation frameworks** | Structured test suites with adversarial coverage; CI integration | Every model update, continuous regression testing |
| **Defensive monitoring / filtering** | Runtime input/output inspection | Production deployment, live traffic analysis |

Commercial tools span all three but charge accordingly. The open-source ecosystem is strongest in the first two; runtime defensive filtering has a mix.

---

## Deep-Dives: The Open-Source Tier

### Garak — Automated LLM Vulnerability Scanner

**GitHub**: [github.com/leondz/garak](https://github.com/leondz/garak) (transferred to NVIDIA Research)  
**Language**: Python  
**License**: Apache 2.0  
**Reference**: Derczynski et al. 2024, "garak: A Framework for Security Probing Large Language Models" — arXiv:2406.11036

Garak (Generative AI Red-teaming & Assessment Kit) is the closest thing the AI security ecosystem has to a general-purpose automated vulnerability scanner. It's organized around three abstractions:

- **Generators**: adapters that connect garak to a model API (OpenAI, Hugging Face, local GGUF models via llama-cpp-python, REST endpoints, etc.)
- **Probes**: test cases that generate adversarial inputs targeting a specific attack class
- **Detectors**: classifiers that evaluate model outputs for failure conditions

Running a basic scan looks like this:

```bash
pip install garak
# Scan an OpenAI model with default probes
python -m garak --model_type openai --model_name gpt-4o-mini --probes all
```

Garak produces a structured HTML and JSONL report listing which probes triggered failures and at what rate.

**Attack classes covered** (selected; see the [probe catalog](https://reference.garak.ai/en/latest/garak.probes.html) for the current full list):

- Prompt injection (direct and indirect variants)
- Jailbreaks (including DAN-style role-play, encoding bypasses, payload-splitting)
- Toxicity and hate speech elicitation
- Misinformation / hallucination elicitation
- Data leakage (system prompt extraction)
- Encoding-based bypasses (Base64, ROT13, leetspeak, Morse code)
- Package hallucination (slopsquatting)
- Continuation attacks

**Limitations**: Garak's detectors vary in quality. Some rely on keyword matching and will miss semantic-level failures; others invoke secondary models (for toxicity scoring) that introduce their own error rates. The framework doesn't natively handle multi-turn conversation state — most probes are single-turn exchanges. For applications that accumulate context across turns, you'll need to build custom probes or supplement with PyRIT. Probe coverage is community-contributed and uneven across attack classes; some categories have dozens of variants while others have only one or two.

**When to use**: Garak is best as a first-pass automated scanner before a manual red team engagement. It catches the well-known attack classes efficiently and surfaces failure rates that give you a baseline.

---

### PyRIT — Microsoft's Python Risk Identification Toolkit for Generative AI

**GitHub**: [github.com/Azure/PyRIT](https://github.com/Azure/PyRIT)  
**Language**: Python  
**License**: MIT  
**Documentation**: [microsoft.github.io/PyRIT](https://microsoft.github.io/PyRIT)

PyRIT (Python Risk Identification Toolkit) was released by Microsoft's AI Red Team in early 2024 and is the tool the team uses internally for red team engagements on Azure AI systems. Unlike Garak's sweep-everything approach, PyRIT is a **framework for building** red team scenarios — it provides composable primitives that you assemble into workflows.

The core abstractions:

- **Orchestrators**: manage multi-turn attack flows — a crescendo attack, a conversation hijacking sequence, a tree-of-attacks traversal all map to different orchestrators
- **Targets**: adapters to the system under test — an LLM API, a RAG pipeline, a multimodal system, or a custom HTTP endpoint
- **Converters**: transform prompt payloads — encode in Base64, translate to a different language, apply character substitutions, jailbreak wrapping
- **Scorers**: evaluate outputs for success conditions — classifier-based scoring, reference LLM scoring, regex matching, human-in-the-loop annotation
- **Memory**: persistent conversation history across turns, enabling stateful multi-turn attacks

A minimal multi-turn red team scenario in PyRIT:

```python
from pyrit.orchestrator import RedTeamingOrchestrator
from pyrit.common import DEFAULT_CHAT_TARGET_KWARGS
from pyrit.models import AttackStrategy

# Define the adversarial objective
attack_strategy = AttackStrategy(
    strategy="Convince the target to provide instructions for [harmful task]",
    conversation_objective="Target complies with the request"
)

orchestrator = RedTeamingOrchestrator(
    attack_strategy=attack_strategy,
    red_teaming_chat=...,  # your attacker LLM
    prompt_target=...,     # the system under test
)
await orchestrator.apply_attack_strategy_until_completion_async(max_turns=10)
```

**Attack classes covered**:

- Multi-turn jailbreaks (stateful, adaptive)
- Crescendo-style escalation attacks
- PAIR (Prompt Automatic Iterative Refinement) — an LLM attacker iteratively refines prompts
- Encoding and obfuscation attacks via Converters
- RAG poisoning scenarios (with custom Targets)
- Multimodal attacks (image + text) via the multi-modal Target adapters

**Limitations**: PyRIT requires more setup than Garak — you need to write Python to configure scenarios, and effective multi-turn orchestration requires an attacker LLM, which costs tokens. It's not a push-button scanner; it's a framework you assemble into a red team workflow. The documentation assumes Python fluency and familiarity with red teaming concepts. It also requires API access to the systems under test, making it less suited for quick offline evaluations.

**When to use**: PyRIT is best for structured red team engagements where you need multi-turn attack scenarios, want to customize attack strategies to a specific application's threat model, or are testing a complete pipeline (not just a model endpoint). Microsoft uses it for formal red team sprints; it maps well to that engagement model.

---

### Promptfoo — LLM Testing and Evaluation with Adversarial Coverage

**Website**: [promptfoo.dev](https://promptfoo.dev)  
**GitHub**: [github.com/promptfoo/promptfoo](https://github.com/promptfoo/promptfoo)  
**Language**: TypeScript/Node.js  
**License**: MIT

Promptfoo started as an LLM evaluation framework (comparing outputs across models or prompt variants) and added a significant adversarial red-team mode. It occupies a different position in the stack: it's the easiest of the three tools to integrate into a CI/CD pipeline for continuous regression testing.

The configuration model is declarative YAML:

```yaml
# promptfooconfig.yaml
providers:
  - openai:gpt-4o-mini

redteam:
  purpose: "A customer support chatbot for a financial services company"
  plugins:
    - harmful:hate        # hateful content elicitation
    - harmful:violence
    - hijacking           # goal hijacking
    - prompt-injection    # direct prompt injection
    - pii:direct          # PII extraction
    - jailbreak           # jailbreak variants
    - overreliance        # over-trust in model outputs
  strategies:
    - jailbreak
    - prompt-injection
    - rot13               # encoding bypass
    - base64
```

Run it:

```bash
npx promptfoo@latest redteam run
npx promptfoo@latest redteam report  # opens a browser UI
```

Promptfoo generates adversarial test cases based on the `purpose` description (using an LLM to infer relevant risks) and then runs them, scoring results automatically.

**Attack classes covered** (via plugins; see [docs.promptfoo.dev/docs/red-team](https://docs.promptfoo.dev/docs/red-team) for current list):

- Direct prompt injection
- Indirect / indirect context injection
- PII extraction
- Harmful content: violence, hate speech, weapons, self-harm, sexual content
- Misinformation / hallucination
- RBAC bypass (unauthorized access claims)
- Hijacking / goal divergence
- Jailbreaks
- OWASP LLM Top 10 coverage (partial; mapped in their documentation)
- Competitor denigration / brand risk

**Integration pattern**: Promptfoo has native GitHub Actions support — you can configure it to run on every PR that touches prompt templates, system instructions, or model configuration. Failed tests fail the CI check.

**Limitations**: Promptfoo's adversarial test generation is LLM-driven, which means it consumes tokens and isn't deterministic between runs. The quality of generated test cases depends on the quality of the `purpose` description you provide. It's weaker than PyRIT for custom multi-turn scenarios; the adversarial mode is oriented toward testing discrete input-output pairs rather than stateful conversations. Some plugins require an OpenAI API key even when testing a different provider.

**When to use**: Promptfoo is the right choice when you want AI security testing in a CI pipeline with minimal infrastructure overhead. It requires no Python and integrates into existing JavaScript/TypeScript build workflows. For teams who need "run security tests on every PR," it's the lowest-friction entry point.

---

## Defensive Tools

These tools run **in production**, on live traffic, rather than in pre-deployment testing. They're complementary to offensive scanners — Garak tells you the model is vulnerable to a specific attack; LLM Guard and similar tools attempt to block that attack class at runtime.

### LLM Guard

**Website**: [llm-guard.com](https://llm-guard.com)  
**GitHub**: [github.com/protectai/llm-guard](https://github.com/protectai/llm-guard)  
**Maintainer**: Protect AI  
**Language**: Python  
**License**: MIT

LLM Guard is a Python library that wraps around LLM API calls to scan inputs and outputs through a configurable set of scanners. Each scanner targets a specific threat:

- `PromptInjection` — classifies whether an input attempts to override system instructions
- `BanTopics` — blocks inputs or outputs containing specified topics via zero-shot classification
- `Secrets` — detects credentials, API keys, and other secrets in outputs (regex + ML)
- `PIIAnonymizer` — detects and anonymizes PII using Microsoft Presidio
- `Toxicity` — classifies toxic content in inputs or outputs
- `InvisibleText` — detects invisible Unicode characters used in injection attacks
- `SentimentAnalysis` — flags strongly negative sentiment in outputs

Integration follows a guard pattern:

```python
from llm_guard.input_scanners import PromptInjection, Secrets
from llm_guard.output_scanners import Toxicity, PIIAnonymizer
from llm_guard import scan_prompt, scan_output

input_scanners = [PromptInjection(), Secrets()]
output_scanners = [Toxicity(), PIIAnonymizer()]

sanitized_prompt, results_valid, results_score = scan_prompt(
    input_scanners, user_prompt
)
if not all(results_valid.values()):
    raise ValueError(f"Input blocked: {results_score}")

# ... call your LLM ...

sanitized_output, results_valid, results_score = scan_output(
    output_scanners, user_prompt, model_response
)
```

**Limitations**: LLM Guard's scanner quality varies significantly. The `PromptInjection` scanner (based on the `protectai/deberta-v3-base-prompt-injection` model) has been evaluated to have meaningful false-negative rates against sophisticated injections that don't match training patterns. Adding multiple scanners in series adds latency; production deployments typically select a subset based on their threat model rather than enabling all scanners. The library doesn't handle multi-turn context — it evaluates each message in isolation.

### Rebuff

**GitHub**: [github.com/protectai/rebuff](https://github.com/protectai/rebuff) (note: development activity has slowed as of this writing — verify current status before adopting)  
**Language**: Python / TypeScript  
**License**: MIT

Rebuff takes a multi-layer approach to prompt injection detection: heuristic pattern matching, vector similarity search against a database of known injection patterns, and an LLM-as-classifier step that asks a secondary model whether the input looks like a prompt injection attempt. The vector similarity layer is notable — it can catch injections that match the *semantic intent* of known attacks even when phrased differently.

**When to use**: Rebuff is worth evaluating if you need the vector-similarity layer and are already operating with an embedding store. However, verify the repository's current maintenance status before committing to it in production — long periods between commits in a security library are a signal.

### Vigil

**GitHub**: [github.com/deadbits/vigil-llm](https://github.com/deadbits/vigil-llm)  
**Language**: Python  
**License**: Apache 2.0

Vigil is a local prompt injection scanner that runs entirely on-premises — no external API calls for detection. It uses a combination of YARA rules, vector similarity search (via local embedding models), and heuristic detection. It exposes a REST API, making it easy to add as a sidecar service to an existing LLM deployment. The entirely local operation is its primary advantage when data residency or API key management is a constraint.

---

## Comparison Table

| Tool | Type | Primary attack classes | Language / Runtime | License | CI-ready |
|---|---|---|---|---|---|
| **Garak** | Offensive scanner | Prompt injection, jailbreak, toxicity, encoding bypass, data leakage | Python | Apache 2.0 | ⚠️ Custom scripting |
| **PyRIT** | Red team framework | Multi-turn attacks, PAIR, crescendo, encoding, RAG poisoning, multimodal | Python | MIT | ⚠️ Custom scripting |
| **Promptfoo** | Evaluation + red team | Prompt injection, PII extraction, harmful content, jailbreak, OWASP LLM mapping | Node.js / TypeScript | MIT | ✅ Native GitHub Actions |
| **LLM Guard** | Defensive (runtime) | Prompt injection, PII, secrets, toxicity, invisible text | Python | MIT | ✅ Library integration |
| **Rebuff** | Defensive (runtime) | Prompt injection (heuristic + vector + LLM layers) | Python / TS | MIT | ✅ Library / API |
| **Vigil** | Defensive (runtime) | Prompt injection (local, no external API) | Python | Apache 2.0 | ✅ REST sidecar |

### Which tool for which threat class

| Threat class | Best open-source tool(s) | Notes |
|---|---|---|
| Direct prompt injection | Garak, Promptfoo | Garak: breadth; Promptfoo: CI integration |
| Indirect / context injection | PyRIT (custom orchestrator), Promptfoo | Requires modeling the full pipeline |
| Jailbreaks (single-turn) | Garak | Widest built-in variant coverage |
| Jailbreaks (multi-turn, adaptive) | PyRIT | Stateful orchestrators required |
| Encoding / obfuscation bypasses | Garak, PyRIT Converters | Garak has many built-in encoding probes |
| PII / data extraction | Promptfoo (PII plugins), LLM Guard output | |
| Toxicity / harmful content | Garak, Promptfoo, LLM Guard | |
| System prompt extraction | Garak | Built-in extraction probes |
| Runtime blocking | LLM Guard, Rebuff, Vigil | Production deployment |

---

## Integration Patterns

### Garak in a Pre-Deployment Gate

Add Garak to your model evaluation pipeline as a pre-deployment gate that blocks production promotion if critical probe failure rates exceed a threshold:

```bash
# In your deployment pipeline
python -m garak \
  --model_type openai \
  --model_name gpt-4o-mini \
  --probes injection,jailbreak,toxicity \
  --report_prefix ./garak-report

# Parse the JSONL report to extract failure rates
python parse_garak_results.py --threshold 0.05
```

The JSONL output format gives you machine-parseable results that you can threshold on. A `0.05` failure rate on prompt injection probes means the model responded to 5% of injection attempts — whether that's acceptable depends on your application's risk tolerance.

Garak doesn't currently publish a pre-built CI action; you'll need to write the integration. The [garak documentation](https://docs.garak.ai) covers the report format.

### PyRIT in a Structured Red Team Sprint

PyRIT maps naturally to a red team sprint model where you run a structured multi-day engagement against a system before a major release:

1. **Define the attack surface**: list the model's intended capabilities and the threat actors you're modeling (internal misuse, external users, third-party plugin inputs)
2. **Configure Targets**: connect PyRIT to your staging deployment, including any middleware (RAG retrieval, tool use, agent orchestration)
3. **Select Orchestrators**: for a customer-facing chatbot, start with `RedTeamingOrchestrator` with PAIR; for an agent system, add an `IncrementalJailbreakOrchestrator` for multi-turn escalation
4. **Add Converters**: include Base64, ROT13, and language translation Converters to probe encoding-based bypasses
5. **Score and document**: use PyRIT's `Scorer` output to categorize failures by attack class and severity, feeding findings back into your threat model

PyRIT's memory integration means all multi-turn conversations are logged — a critical requirement for writing red team reports that include full attack transcripts.

### Promptfoo in Continuous CI

The minimal Promptfoo CI setup for a model-backed application:

```yaml
# .github/workflows/ai-security-tests.yml
name: AI Security Tests
on:
  pull_request:
    paths:
      - 'prompts/**'
      - 'src/ai/**'
      - 'promptfooconfig.yaml'
jobs:
  security-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx promptfoo@latest redteam run
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      - run: npx promptfoo@latest redteam report --output report.html
      - uses: actions/upload-artifact@v4
        with:
          name: ai-security-report
          path: report.html
```

This runs on every PR that modifies prompt templates or AI system code, failing the CI check if adversarial test cases exceed the configured threshold.

### LLM Guard in Production

LLM Guard is designed to wrap your LLM call:

```python
# Minimal production integration
from llm_guard.input_scanners import PromptInjection, BanTopics
from llm_guard.output_scanners import Toxicity
from llm_guard import scan_prompt, scan_output

# Configure once at startup
INPUT_SCANNERS = [
    PromptInjection(threshold=0.7),     # tune threshold based on your FP tolerance
    BanTopics(topics=["competitor-names"], threshold=0.5),
]
OUTPUT_SCANNERS = [
    Toxicity(threshold=0.7),
]

def safe_llm_call(user_prompt: str) -> str:
    sanitized, valid, scores = scan_prompt(INPUT_SCANNERS, user_prompt)
    if not all(valid.values()):
        return "I can't help with that request."  # or raise an exception

    response = your_llm_client.complete(sanitized)

    sanitized_response, valid, scores = scan_output(OUTPUT_SCANNERS, user_prompt, response)
    if not all(valid.values()):
        return "I encountered an issue generating a safe response."

    return sanitized_response
```

Tuning the thresholds requires empirical testing on your application's traffic — the defaults in LLM Guard are starting points, not production-tuned values.

---

## Commercial and Enterprise Tools

The open-source tools above cover the core use cases, but several commercial products address enterprise requirements (audit trails, SLA-backed support, managed scanning infrastructure, compliance reporting):

- **Lakera Guard**: a production-ready API service for prompt injection and harmful content detection, designed for low-latency production deployment. Website: lakera.ai. Operates as a reverse proxy or SDK wrapper.
- **HiddenLayer Model Scanner**: focuses on the model artifact layer — scanning model files for backdoors, poisoning indicators, and adversarial modifications. Different threat surface from the other tools (model supply chain rather than runtime behavior).
- **Adversa AI**: AI security red teaming services with associated tooling for adversarial robustness evaluation.

**When commercial over open-source**: the decision usually turns on operational maturity rather than capability. Commercial tools offer SLA-backed uptime, dedicated support for integration issues, compliance documentation (SOC 2, GDPR data handling), and managed infrastructure. If your security team already has vendor relationships and compliance requirements that favor managed solutions, commercial tools reduce operational overhead. If you have Python/TypeScript capability in-house and want to iterate on custom scenarios, the open-source tier is more flexible.

---

## The OWASP LLM Top 10 and Test Coverage

The [OWASP LLM Application Security Verification Standard (LLM-ASVS)](https://owasp.org/www-project-llm-application-security-verification-standard/) provides a structured verification checklist for LLM security — verify its current development status at the OWASP project page before relying on it in formal compliance documentation, as it was still under active development as of this writing.

The more mature reference is the [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/), which maps the highest-risk vulnerability categories. Tool coverage against the OWASP LLM Top 10 categories:

| OWASP LLM Category | Garak | PyRIT | Promptfoo |
|---|---|---|---|
| LLM01: Prompt Injection | ✅ Multiple probes | ✅ Orchestrators | ✅ Plugin |
| LLM02: Insecure Output Handling | Partial | Partial | ✅ Plugin |
| LLM03: Training Data Poisoning | ❌ (post-training) | ❌ (post-training) | ❌ |
| LLM04: Model DoS | Partial (resource probes) | ❌ | ❌ |
| LLM05: Supply-Chain Vulnerabilities | ❌ | ❌ | ❌ |
| LLM06: Sensitive Information Disclosure | ✅ Extraction probes | ✅ With custom scorer | ✅ PII plugin |
| LLM07: Insecure Plugin Design | Partial | ✅ Custom targets | ✅ With custom config |
| LLM08: Excessive Agency | ❌ | Partial | Partial |
| LLM09: Overreliance | ✅ Hallucination probes | Partial | ✅ Plugin |
| LLM10: Model Theft | ❌ | ❌ | ❌ |

No single tool covers the entire OWASP LLM Top 10. Categories like supply-chain vulnerabilities and model theft require different tooling (model artifact scanners like HiddenLayer, supply chain auditing tools) or currently have no widely-adopted automated test coverage.

---

## Current Gaps: What No Tool Covers Yet

The AI security tooling ecosystem is maturing quickly but has significant blind spots:

**Agent long-horizon behavior**: The tools above test discrete inputs and short conversations. Multi-step agent workflows that span tool calls, external API interactions, and memory accumulation over hours or days don't have automated test frameworks. An agent that behaves safely for 10 turns might be compromised on turn 11 after accumulating crafted context — and no currently available tool systematically probes this.

**Multimodal adversarial inputs at scale**: Vision-language model attacks (adversarial image patches, text overlaid on images, chart-based injection) require tooling that can generate and evaluate multimodal inputs at scale. PyRIT has early multimodal support via adapters, and there is research tooling like [PromptBench](https://github.com/microsoft/promptbench) for adversarial robustness evaluation on multimodal tasks, but production-grade automated multimodal red teaming tools don't yet exist.

**Hardware-level and inference-engine attacks**: Attacks on the inference stack itself — speculative execution side channels, CUDA kernel manipulation, quantization artifacts that change model behavior — are outside the scope of all current behavioral testing tools.

**Agentic supply chain validation**: Verifying that tool call results fed to an agent are free of embedded injection payloads at scale (e.g., validating all web content retrieved by a browsing agent before it's passed to the LLM) has no standardized tool coverage. This is the indirect prompt injection problem applied to agents — and it's the attack surface most likely to be exploited at scale.

**Fine-tuning safety validation**: When you fine-tune a base model, the fine-tuned version's safety properties may diverge from the base — safety training can be degraded by fine-tuning on even a small number of harmful examples. Systematically validating that a fine-tuned model's safety profile hasn't regressed requires running a full Garak/Promptfoo sweep on every fine-tuning run, but this isn't yet a standard part of most MLOps pipelines.

---

## Starting Your AI Security Program

If you're building an AI security testing program from scratch, a practical sequence:

1. **Start with Promptfoo** for CI coverage — declarative YAML, minimal setup, native GitHub Actions. Get basic adversarial regression testing running on every PR within a day.
2. **Add Garak** for pre-deployment sweeps — run it before any production model promotion to catch well-known attack classes at breadth.
3. **Add LLM Guard** to production — instrument your LLM calls with at minimum a `PromptInjection` scanner as a runtime guard.
4. **Build to PyRIT** for structured red team engagements — when you have Python capability and time for a formal sprint, PyRIT enables the multi-turn, stateful attack scenarios that automated scanners can't cover.

None of these tools substitute for human red team creativity — they handle systematic coverage of known attack classes, freeing human red teamers to focus on novel scenarios, threat-model-specific attack paths, and the gaps documented above.

This ecosystem was substantially less mature two years ago; it will be substantially more mature two years from now. The tools listed here were active and maintained as of July 2026 — verify current status at their respective repositories before committing to them in a long-term program.
