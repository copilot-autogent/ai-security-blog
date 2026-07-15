---
title: "Slopsquatting: When AI Hallucinated Package Names Become a Supply Chain Attack"
description: "LLMs hallucinate package names at rates exceeding 20%. Attackers register those hallucinated names on npm, PyPI, and crates.io with malicious payloads. No typo required — the developer trusts the AI. This post explains the mechanics, documents the evidence, and gives developers concrete defenses."
pubDate: 2026-07-15
tags: ["supply-chain", "llm-security", "package-security", "code-generation", "defense-patterns"]
category: supply-chain
evidenceLevel: strong
relatedPosts: ["model-hub-supply-chain-attacks", "hallucination-security-surface-package-fabrication-wrong-advice", "ml-model-provenance-signing-sboms-verification"]
---

In April 2023, security researcher Bar Lanyado at Vulcan Cyber ran a simple experiment. He asked ChatGPT, Bard, and CodeLlama to recommend Python and JavaScript packages for common development tasks — parsing JSON, generating UUIDs, handling HTTP requests. He then checked every recommendation against the actual registries.

More than 20% of the packages the models recommended didn't exist.

This isn't a reliability problem. It's the precondition for a supply chain attack.

## What Slopsquatting Is

The term — a portmanteau of "slop" (AI-generated low-quality output) and "typosquatting" — names a specific attack pattern:

1. An LLM generates code or installation instructions that reference a package name that does not exist in the target registry.
2. An attacker identifies that name (either by querying LLMs at scale or by monitoring unregistered-but-plausible namespaces) and registers it with a malicious payload.
3. A developer follows the AI's instructions, runs `pip install` or `npm install`, and executes attacker-controlled code.

The critical distinction from traditional typosquatting is **where the error originates**. In typosquatting, the human misspells a package name — `reqeusts` instead of `requests`, `lodsh` instead of `lodash`. There's a user error in the chain that better tooling or habits can catch.

In slopsquatting, there is no user error. The developer types exactly what the AI told them. The package name is plausible, often stylistically consistent with the ecosystem, and the model presents it with the same confidence it uses for every other recommendation. The developer has no external signal that anything is wrong.

This shifts the threat model from "humans make mistakes under time pressure" to "LLMs generate plausible-sounding fiction, and developers act on it."

## The Statistics Behind the Risk

Lanyado's 2023 Vulcan Cyber study remains the most-cited quantification of the phenomenon. The methodology was straightforward: ask multiple LLMs to recommend packages for specific tasks, then check each recommendation against npm and PyPI. The study surveyed ChatGPT, Bard, and CodeLlama across hundreds of package recommendations and found:

- More than 20% of recommended packages didn't exist at query time
- Hallucinated packages were concentrated in less-common tasks (edge use cases, niche libraries, platform-specific integrations) — the model's training data had less signal to anchor on
- Many hallucinated names were syntactically plausible: they followed naming conventions, used common prefixes and suffixes (`-utils`, `py-`, `node-`), and were indistinguishable in format from legitimate packages

Checkmarx extended this research in 2024 with ecosystem-scale scans. Their findings documented **persistent hallucinations** — the same fictional package names appearing across repeated queries and across different models — and identified cases where hallucinated names had subsequently been registered by third parties. The Checkmarx research established that the squatting half of the attack isn't hypothetical: unregistered names that LLMs recommend are a known search target.

The persistence finding matters. If a hallucinated package name were random noise, attackers would need to monitor every model query to catch the window. But Lanyado and Checkmarx both found that many hallucinations are stable — the same model, given the same or similar prompt, recommends the same non-existent package repeatedly. This means attackers can enumerate a set of high-confidence targets by querying models in bulk, register those names in advance, and wait.

## The Attack Chain

The mechanics of execution are straightforward once the name is registered:

```
Developer prompt → LLM response → pip install <hallucinated-name> → attacker setup.py runs
```

In Python, `setup.py` runs at install time for source distributions (sdists) — specifically during the build phase that `pip install` triggers when a pre-built wheel isn't available. An attacker who controls the package and publishes only an sdist controls code that executes on the developer's machine before they've seen any of the package's "functionality." For wheel distributions, malicious code can still be embedded in the package's own modules, which execute as soon as the developer imports the package. npm's `preinstall` and `postinstall` lifecycle scripts run unconditionally during `npm install` regardless of distribution format.

A realistic payload at this stage typically aims for:

- **Credential theft**: reading `.env` files, `~/.aws/credentials`, `~/.ssh/` private keys, browser-stored secrets, and exfiltrating them over HTTPS to an attacker-controlled endpoint
- **Persistence**: adding a cron job or launch agent that survives package removal
- **Lateral movement**: using the developer's local network access or cloud credentials to pivot into production infrastructure
- **CI/CD compromise**: if the install happens in a CI pipeline (common when developers share a new `requirements.txt` without a lockfile update review), the attack runs in a privileged environment with access to deployment secrets, artifact signing keys, and production credentials

The attacker's investment is modest: register a plausible package name, upload a tarball with a malicious install hook, and wait for victims to arrive via LLM recommendations. The registration itself is free on npm and PyPI. There's no infrastructure cost until exfiltration.

## Documented Cases

The Checkmarx 2024 research documented specific instances of previously-hallucinated package names being registered on npm and PyPI by parties other than their original maintainers (if any existed). In the most direct cases, the sequence is traceable: a name appears in LLM outputs, the name was unregistered, later the name is registered with a package whose content is inconsistent with its purported purpose.

Beyond research-documented cases, npm and PyPI administrators have removed packages identified as slopsquatting attempts — packages registered with names that appear in AI-generated code samples, containing install-time payloads targeting developer credentials. PyPI's name reuse policy (enforced since 2022 under PEP 541) means that once a legitimate package has held a name, reclaiming that name after deletion requires administrative review — this is a meaningful friction for attackers targeting well-known package names, but offers no protection for newly invented names that never existed on the registry.

The pattern has precedents in the broader typosquatting literature. The `ctx` PyPI incident (2022) — where a legitimate package name was claimed by a malicious upload — demonstrated that developers will install plausible-sounding packages without checking provenance. Slopsquatting removes even the step where the developer made the choice to type a name — the choice was delegated to the model.

## Why Existing Defenses Don't Stop This

The standard supply chain security toolkit was designed for a different threat model.

**Lockfiles** (`package-lock.json`, `poetry.lock`, `Cargo.lock`) solve the problem of dependency drift after an initial install. They record the exact version and integrity hash of what was installed the first time. But they only help *after* the first install has already happened. If a developer adds an AI-recommended package, installs it, and commits the lockfile, the lockfile faithfully records the malicious package's hash. The lockfile is not a validator of intent — it's a record of what was installed.

**SBOMs** (Software Bills of Materials) share the same limitation. An SBOM generated after a malicious install correctly inventories the malicious package. It doesn't warn you that the package was there because an LLM hallucinated its name. SBOM tooling can flag known-bad package hashes (if the malicious package is in a threat database), but a freshly-registered attack package with no prior incident reports won't appear in any threat intelligence feed.

**Supply chain scanners** (Snyk, Dependabot, OSS-Index, Grype) operate against known vulnerability databases and known-malicious package lists. A package registered last week specifically to capitalize on a fresh hallucination won't be in those databases. The scanner will see a healthy package with no known CVEs and pass it clean.

**Code review** catches a lot, but "add `utilslib-x` to requirements.txt" looks exactly like any other dependency addition. The reviewer would need to independently verify that `utilslib-x` is a real, legitimate package — a step that isn't part of most code review workflows.

The defense gap is structural: all existing tools operate on *known* information. Slopsquatting exploits packages that are new to the registry, potentially registered minutes before a developer tries to install them. No scan of existing databases catches a zero-day package.

## Mitigations That Actually Work

Effective defenses require moving the verification step *before* the install, not after it.

### 1. Registry existence check before install

Before running any AI-suggested install command, verify the package exists and has a credible history:

```bash
# Python — check package metadata (note: pip index is experimental in pip ≥21.2)
pip index versions <package-name>
# or use the PyPI JSON API directly (stable, no pip dependency)
curl -sf https://pypi.org/pypi/<package-name>/json | grep -o '"version":"[^"]*"' | head -5
```

A package that returns "not found" is the obvious red flag. But also check the creation date, download counts, and whether there's a GitHub repository that matches the claimed maintainer. A package registered two days ago with zero stars and no README is a credible warning sign even if it technically "exists."

### 2. AI dependency diff in CI/CD

Add a CI step that compares AI-generated dependency additions against your locked baseline and flags new packages for review. The specific checks worth automating:

- Query the PyPI JSON API or npm registry metadata API for each new package's creation date — flag packages less than 30 days old
- Check download statistics (PyPI Stats, npm download counts) — very low download counts are a risk signal
- Verify the package has an associated source repository linked in its metadata

Tools like `pip-audit` and `npm audit` scan against known vulnerability databases, but they don't natively gate on package age or download counts. That registry-metadata check requires a dedicated script or a service like `deps.dev` (Google's Open Source Insights API), which exposes package metadata including project health signals. The OSSF Scorecard GitHub Action evaluates source repository security practices but requires the package to have a linked repo. Combine these as complementary layers rather than treating any single tool as sufficient.

### 3. Sandboxed install environments

Run initial installs in a container or VM snapshot that is isolated from host credentials and file system. The goal is to limit the blast radius if the install is malicious. A workable approach:

```bash
# Download the package tarball without executing it (wheels-only avoids sdist build hooks)
docker run --rm -v $(pwd)/pkg-cache:/cache python:3.12-slim \
  pip download <package> --only-binary=:all: -d /cache
# Inspect the contents before bringing into your real environment
unzip -l pkg-cache/*.whl
```

Note the limitations: `--only-binary=:all:` fails if no pre-built wheel exists (sdist-only packages); using `--network=none` prevents the download step itself, so network isolation must be applied *after* download and before any build step. For sdist packages, the safest option is to download the tarball first, inspect it manually, then build in an isolated environment. There's no fully automated sandbox primitive in pip that's both safe and transparent — manual inspection remains part of the workflow for high-risk cases.

### 4. Validate AI-suggested packages against a curated allowlist

For production CI/CD pipelines, maintain an explicit allowlist of approved packages. Any package not on the allowlist requires a human review step before it's permitted in a build. This is operationally expensive, but for security-sensitive pipelines (CI systems with cloud credentials, build systems producing signed artifacts), it's the only control that guarantees pre-validation.

### 5. Provenance attestation for packages you publish

If your pipeline produces packages, sign them with Sigstore (`cosign`) and attach in-toto attestations. This protects consumers of your packages from a related but inverse problem — it doesn't directly prevent slopsquatting attacks against you, but it contributes to a broader ecosystem where unsigned packages are a signal worth investigating.

For consuming signed packages, npm's `npm audit signatures` and Python's evolving PEP 740 attestation infrastructure allow verification that a package's published artifact matches what the maintainer signed. Adopt these verification steps now; ecosystem support is growing.

### 6. Developer workflow: flag AI-suggested installs

The simplest and most immediately deployable mitigation: treat any package name that came from an LLM as *unverified* until you've done a 30-second registry check. Build the habit into your team's workflow. Add it to your development guidelines. This doesn't require tooling — it requires treating "the AI told me to install X" as a prompt to verify X, not as a verified instruction.

## Distinct From Related Threats

Slopsquatting sits at the intersection of several documented threats but is distinct from each:

**Model hub typosquatting** ([model-hub-supply-chain-attacks](/blog/model-hub-supply-chain-attacks)) targets model weights on platforms like Hugging Face. The attacker registers a malicious model under a name similar to a popular one. The attack surface is model downloads, not package installs. The hallucination mechanism doesn't apply — typosquatting on model hubs relies on human misspelling or namespace confusion, not LLM recommendation.

**LLM hallucination as a general security surface** ([hallucination-security-surface-package-fabrication-wrong-advice](/blog/hallucination-security-surface-package-fabrication-wrong-advice)) covers the broader space of hallucination-derived security failures: wrong credentials, incorrect security advice, fabricated CVE details. Slopsquatting is a specific exploitation path within that surface — the one where hallucinated package names become actionable attack vectors.

**AI agent supply chain attacks and ML SBOMs** ([ml-model-provenance-signing-sboms-verification](/blog/ml-model-provenance-signing-sboms-verification)) address the supply chain for AI systems themselves — verifying model provenance, signing model weights, attesting training pipelines. Slopsquatting is about AI systems creating supply chain vulnerabilities in *software* (packages), not vulnerabilities in the AI supply chain itself.

## The Structural Problem

Slopsquatting exposes a fundamental tension in how developers are adopting AI coding assistants. The value proposition of these tools is speed — they reduce the cognitive load of remembering exact API names, package configurations, and implementation patterns. That value is real. But the speed comes from the model generating outputs that *look correct*, not from outputs that have been verified against authoritative sources.

LLMs that operate purely as text generators — base models or chat models without tool access — don't query package registries before generating install commands. They produce statistically plausible tokens based on training data. A package that was widely discussed in Stack Overflow threads from 2020 will be recommended confidently in 2026 even if it was deprecated in 2022, removed from the registry in 2023, and re-registered by an attacker in 2024. The model has no mechanism to know any of this.

The 20%+ hallucination rate Lanyado documented isn't a bug in a specific model — it's a property of the approach. Models that generate more fluent, confident text also generate more plausible-sounding fictional package names. Better models may hallucinate less, but the research doesn't show elimination — it shows reduction. At the scale of development teams running AI-assisted coding at high volume, "reduced hallucination rate" still produces a substantial volume of unverified package recommendations.

The mitigation stack above treats this as a process problem that can be contained with verification steps. That framing is correct for the near term. The longer-term solution — AI coding tools that perform live registry lookups before generating install commands — would address the root cause, and some tools are beginning to integrate this. Until that capability is standard, the verification burden falls on the developer.

---

*This post draws on Bar Lanyado / Vulcan Cyber's 2023 research ("Can You Trust ChatGPT's Package Recommendations?"), Checkmarx Supply Chain Security team's 2024 ecosystem scan findings, and documented npm/PyPI incident reports. The structural analysis of why lockfiles, SBOMs, and scanners fail against this threat class is informed by the broader supply chain security literature, including the SLSA framework and OpenSSF Scorecard project documentation.*
