---
title: "Model Hub Supply Chain Attacks: Malicious Models, Tokenizer Exploits, and Typosquatting on Hugging Face"
description: "Downloading an open-weight model from a public hub is not a read-only operation. Custom tokenizer classes and auto_map configs execute arbitrary Python when trust_remote_code is set, LoRA adapters can trojanize safe base models, and typosquatted namespaces are a documented distribution vector. Here's the threat model practitioners need before they run from_pretrained()."
pubDate: 2026-07-09
tags: ["supply-chain", "model-security", "ai-security", "security", "data-poisoning", "pickling", "fine-tuning", "threat-modeling"]
---

Downloading a model feels like a read operation. You point a library at a repo name, wait for gigabytes to transfer, and assume the resulting weights are inert data. They're not. The download-time attack surface on public model hubs is broader and more varied than the pickle-deserialization framing that dominates most security discussions — and most practitioners running `from_pretrained()` don't have a concrete threat model for what they're actually pulling.

This post builds that threat model. The techniques below are documented, reproducible, and increasingly reported in the wild.

## Why Model Hubs Are a Different Kind of Supply Chain Risk

Package registries like PyPI and npm have spent years building security infrastructure: package signing, malware scanning, automated advisories, takedown procedures. The trust model is still imperfect, but it's deliberate.

Model hubs are newer, larger, and have different structural properties:

- **Scale without precedent**: Hugging Face alone hosts over 500,000 public models. PyPI launched in 2003 and took roughly 20 years to reach a comparable count. Hub uploads are frictionless.
- **Binary artifacts**: A Python package can be audited — source is readable. A 7B-parameter weight file is not. Auditing model weights for behavioral modifications requires running the model and probing it systematically, which most users don't do.
- **Executable artifacts at load time**: When `trust_remote_code=True` is set, custom tokenizer classes and model classes from the repo are executed. This is not implicit — it requires explicit opt-in — but it's a routine prompt during model loading and the code runs locally.
- **Different trust signals**: On PyPI, a package with 10 million weekly downloads from a five-year-old account is probably legitimate. On a model hub, download counts are easily gamed and namespace provenance is unclear to casual users.

JFrog's 2024 security research found hundreds of malicious models on Hugging Face containing embedded malware — including models serving as remote access trojan droppers — before detection and removal. This is not a theoretical concern.

## Attack Taxonomy

### 1. Tokenizer Code Execution

This is the most underappreciated vector. Hugging Face's `transformers` library supports **custom tokenizer classes** — Python files included in the model repository and executed locally when `from_pretrained()` loads them with `trust_remote_code=True`. The mechanism exists for legitimate reasons: custom tokenization logic is sometimes required for specialized models. But it means tokenizer loading is code execution.

The relevant parameter is `trust_remote_code`. When set to `True`, it explicitly permits running Python files from the repo. When left at its default (`False`), the library refuses to execute repo-defined classes — but that only protects you if the model doesn't require a custom class. For models that do, you're prompted to set the flag, which is when review of the repo code matters most.

HiddenLayer's 2024 research on model artifact formats documented concrete examples of how `tokenizer_config.json` can specify a `tokenizer_class` that references a Python file in the repo — this file executes when the user sets `trust_remote_code=True` during loading.

**Concrete scenario**: A malicious actor uploads a "fine-tuned" Llama variant. The base model weights are legitimate (possibly rehosted). The tokenizer directory includes a `tokenizer.py` with a custom class that, on `__init__`, exfiltrates environment variables to an attacker-controlled endpoint before returning a normal-looking tokenizer object. The user enables `trust_remote_code=True` without reading the file, sees no error, inference works, and the exfiltration happened during what felt like a file download.

### 2. Malicious LoRA Adapters

Low-rank adaptation (LoRA) lets practitioners fine-tune large models efficiently: instead of updating all weights, a small adapter matrix is learned and added at inference time. The adapters are small — tens to hundreds of megabytes, not the many-gigabyte base model. This property makes them an attractive distribution vector.

**The attack**: Distribute a malicious adapter file targeting a popular open-weight base model. Users who download the base model legitimately may separately download adapters from less-scrutinized sources — community adapter repos, Discord servers, model sharing forums. A malicious adapter can:

- Introduce behavioral backdoors: normal output for most inputs, but specific trigger phrases elicit attacker-controlled behavior
- Override safety training without modifying the base weights, making the modification less detectable
- Carry arbitrary binary payloads in tensor metadata that a companion script (distributed separately by the attacker) extracts and executes

The base model is clean. The adapter is small enough to evade manual review. When combined with a malicious loader distributed on the same channel, the result is compromised.

Hugging Face's adapter ecosystem (PEFT, PEFT hub integration) is vast and significantly less reviewed than the core model repos. Community adapters for popular models number in the thousands.

### 3. Typosquatting and Namespace Hijacking

PyPI typosquatting (`colourama` for `colorama`, `python-dateutil` vs `dateutil`) is well-documented. Model hubs have an analogous problem with model namespaces, and the trust signals are weaker.

Documented patterns:

- **Character substitution**: `meta-llama` (official) vs `meta_llama`, `metaIlama` (capital i for lowercase l), `rneta-llama`
- **Namespace squatting**: Registering `mistral-ai` before the legitimate org claims it, then publishing models with subtly modified behavior
- **Version confusion**: Uploading `meta-llama/Meta-Llama-3-8B-v2.1` when the official name is `meta-llama/Meta-Llama-3-8B` — users copy-pasting model IDs from blog posts may miss the difference
- **Rehosting with modifications**: Taking a legitimate model, making behavioral changes, and redistributing under a name that implies it's the original ("Meta-Llama-3-8B-Uncensored-Official")

The namespace issue is structural. Hugging Face's organization verification system has improved, but organization-level verification doesn't prevent individuals from registering confusingly similar names. Unlike certificate transparency, there's no append-only log of namespace claims that would surface squatting.

JFrog's 2024 research specifically documented model repos using character substitution in organization names to impersonate legitimate research labs.

### 4. Config JSON Code Paths

The `safetensors` format was designed to eliminate the pickle deserialization attack vector — and it succeeds at that specific goal. But adopting safetensors does not sanitize the rest of the model artifact.

A complete model download includes:

- `config.json` — may specify `auto_map` entries that redirect `AutoModel`, `AutoTokenizer`, and other `Auto*` class lookups to custom Python implementations in the repo
- `tokenizer_config.json` — may specify `tokenizer_class` pointing to a custom class from a Python file in the repo

The `auto_map` field in `config.json` is particularly significant. It allows the model config to redirect `Auto*` class instantiation — `AutoModel`, `AutoModelForCausalLM`, and similar entry points — to custom Python implementations in the repo. When `trust_remote_code=True` is set, those custom files are loaded and executed. The attack surface is not the weight file format — it's the configuration metadata that instructs the library to load and run custom code.

Switching to safetensors closes one door while `auto_map` and `tokenizer_class` configurations remain open.

### 5. Dataset Poisoning via Hub-Hosted Datasets

Hugging Face's `datasets` library uses the same hub infrastructure for dataset files as `transformers` uses for models. The most direct code-execution path is the **dataset loading script**: a Python file (`dataset_name.py`) that defines how data is loaded and preprocessed, executed locally when you call `load_dataset()` with `trust_remote_code=True` on a dataset that requires it.

Beyond loading scripts, poisoned dataset content (clean file format, malicious trigger patterns embedded in the data rows) can be used for data-poisoning attacks:

- Introduce trigger-response patterns into a fine-tuned model (behavioral backdoor via data poisoning)
- Modify reasoning patterns subtly enough to avoid standard evaluation benchmarks

The Hugging Face security team has documented several takedowns of malicious dataset repos. Dataset poisoning for downstream model backdooring is increasingly studied in academic literature as a supply chain threat distinct from weight manipulation.

### 6. Model Card Injection

This is the lowest-severity vector but worth flagging for completeness. Model cards are markdown files rendered in the browser — they are not executed locally by `from_pretrained()`. HF uses a sanitizer, but sanitization bypasses have been documented in similar platforms. The risk here is browser-side: XSS-style attacks against the Hub's web interface, or social engineering that misleads users about model capabilities, safety testing, or licensing.

More concretely: a model card can claim RLHF safety training that wasn't applied, claim performance benchmarks that weren't run, or claim a license (Apache 2.0) while the actual model weights are under a more restrictive term. Users who treat the card as authoritative documentation may make compliance decisions based on false information.

## Real Incidents

**JFrog 2024 Research**: JFrog's security research team analyzed Hugging Face repos and identified models containing embedded Python pickle payloads designed to download and execute additional malware on load. The research documented attack techniques including embedding malicious code in tensor metadata and configuration files. Several hundred repositories were identified before removal. ([JFrog Security Blog](https://jfrog.com/blog/data-scientists-targeted-by-malicious-hugging-face-ml-models-with-silent-backdoor/))

**Hugging Face 2024 Spaces Security Advisory**: Hugging Face disclosed an incident involving unauthorized access to Spaces infrastructure, potentially exposing API tokens used by Spaces applications. The incident illustrates that hub infrastructure itself is a target — and that token exposure at the platform level has downstream implications for the security of hosted artifacts. ([HF Security Advisory](https://huggingface.co/blog/space-secrets-disclosure))

**HiddenLayer 2024 AI Threat Landscape**: HiddenLayer's research documented multiple techniques for hiding malicious payloads in model artifact formats, including novel methods for embedding executable content in files that security scanners don't inspect (model card assets, non-weight tensors in checkpoint files). ([HiddenLayer Research](https://hiddenlayer.com/research/))

## Defenses

### Immediate: Default-Deny Remote Code

Never set `trust_remote_code=True` without explicit justification and review of the specific code being trusted. The default is `False` for good reason.

```python
# Wrong — enables arbitrary code execution from the repo without review
model = AutoModel.from_pretrained("some/model", trust_remote_code=True)

# Right — raises an error if the model requires remote code, which prompts you to review
model = AutoModel.from_pretrained("some/model")
```

If a model requires `trust_remote_code=True`, read the code in the repo before enabling it. The files to check include: `modeling_*.py`, `tokenization_*.py`, `configuration_*.py`, `processing_*.py`, `feature_extraction_*.py`, and any `__init__.py` that the repo exposes as a package. Review at the specific commit you intend to use, not at whatever HEAD currently points to.

### Prefer Safetensors — But Don't Stop There

Safetensors eliminates pickle deserialization but doesn't sanitize config files or custom Python code. Use the format but don't treat it as a complete remediation.

To verify file integrity for weight files (which are typically LFS-tracked), use the `huggingface_hub` Python library to retrieve the LFS SHA256 OID for each file at the specific commit you're pinning to, then compare against locally-computed SHA256 hashes of the downloaded files. For configuration files (non-LFS), compute SHA256 locally and cross-reference with a trusted out-of-band copy.

### Namespace Verification

Before downloading, verify the organization namespace belongs to the expected entity:

1. Check the org's verified badge on Hugging Face
2. Cross-reference the model ID against official documentation, the model's paper, or the org's official website
3. For model IDs shared in blog posts or Discord, independently look up the official namespace rather than copy-pasting

For a production system, pin the specific model commit SHA rather than floating on a branch name. A branch head can be updated after you've verified it.

```python
# Floating reference — can change without notice
model = AutoModel.from_pretrained("meta-llama/Meta-Llama-3-8B")

# Pinned to a specific commit — immutable reference
model = AutoModel.from_pretrained(
    "meta-llama/Meta-Llama-3-8B",
    revision="8cde5ca8380496c9a6cc7ef3a8b46a0372a1d920"  # full commit SHA
)
```

### Scan Model Artifacts

Dedicated model scanning tools inspect artifact formats beyond standard antivirus:

- **Protect AI ModelScan**: Open-source scanner for model files that detects known malicious patterns in pickle files, safetensors, and ONNX formats. Integrates into CI pipelines. ([GitHub](https://github.com/protectai/modelscan))
- **HiddenLayer Model Scanner**: Commercial offering with broader format coverage and behavioral heuristics.

Neither is exhaustive — they detect known patterns, not zero-days. But they catch the documented attack classes that JFrog and HiddenLayer have published.

For adapter files specifically (which are small enough to be tractable), a simple audit is feasible: load in a sandboxed environment, inspect the adapter's parameter shapes against the expected architecture, and run behavioral probes before deploying to production.

### Private Repos and Access Controls

For production use cases, don't pull from public hub repos directly. Instead:

1. Download a verified model to private infrastructure
2. Serve from an internal model registry with access controls
3. Treat hub-downloaded artifacts as untrusted inputs that require validation before promotion

This is the same trust model applied to container images: DockerHub is a source, not a deployment target for production workloads.

### SBOM for Model Artifacts

Complement model provenance governance with artifact integrity: record the exact repo commit SHA, file hashes for all artifact files (not just weights), and the `trust_remote_code` setting used at load time. This creates an audit trail that can detect post-download modifications and simplifies incident response when a model artifact is later found to be malicious.

## The Underlying Pattern

The through-line across these attack vectors is that model artifacts are **executable**, not just data — and the trust model most users apply treats them as data.

When you `pip install` a package, there's a broadly understood social contract: the package may contain arbitrary code, you're trusting the publisher, and security teams have tooling to analyze what runs. When you `from_pretrained()` a model, the same properties hold, but the mental model for most ML practitioners is still "I'm downloading weights." The weights are data; the config files, custom tokenizers, and adapter loaders are not.

Closing this mental-model gap is as important as deploying scanning tools. The practitioners most at risk are those who understand the security implications of `pip install` from an unknown source but don't apply the same scrutiny to model hub downloads.

---

*Primary sources: JFrog Security Research (2024), ["Malicious Code in Hugging Face Models"](https://jfrog.com/blog/data-scientists-targeted-by-malicious-hugging-face-ml-models-with-silent-backdoor/); HiddenLayer (2024), ["AI Model File Security"](https://hiddenlayer.com/research/); [Hugging Face Security Documentation on `trust_remote_code`](https://huggingface.co/docs/transformers/main/en/model_doc/auto#transformers.AutoModel.from_pretrained.trust_remote_code); [Protect AI ModelScan](https://github.com/protectai/modelscan); [Hugging Face 2024 Spaces security advisory](https://huggingface.co/blog/space-secrets-disclosure).*
