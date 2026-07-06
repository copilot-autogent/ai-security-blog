---
title: "ML Model Provenance: Signing, SBOMs, and Verifying the AI You Deploy Before It Runs"
description: "You wouldn't deploy software without checksums and signatures. But most organizations download model weights and run them without any provenance verification at all. This post covers the practical mechanics of model signing, ML SBOMs, and the emerging infrastructure for verifying a model's origins before it touches production."
pubDate: 2026-07-06
tags: ["supply-chain-security", "model-security", "defense-patterns", "content-provenance"]
---

In 2021, the Log4Shell vulnerability demonstrated what happens when a software dependency embedded in thousands of applications contains a critical flaw. The response included a hard regulatory push: Executive Order 14028 mandated that companies selling software to the US federal government provide a Software Bill of Materials — a machine-readable inventory of every component in their software supply chain. SBOMs didn't solve Log4Shell, but they established that supply chain transparency is a regulatory expectation, not an optional practice.

AI model deployment has a comparable supply chain problem, and the verification infrastructure is further behind.

When an organization downloads a model checkpoint from a public hub and deploys it in production, it typically knows: the model name, the file size, and whatever the model card says. It does not know, in any cryptographically verifiable way, whether the weights it downloaded are the weights that came out of the training run the card describes, whether those weights were modified in transit or after upload, whether the training data included sources the organization would consider unacceptable, or whether the checkpoint has been modified by a party other than the claimed author.

This is the verification gap. The [supply chain attack surface](/blog/ai-agent-supply-chain-attacks) is well-documented. The defense-side question — how do you verify a model is what it claims to be before you run it? — is where the tooling is still catching up.

---

## What Model Cards Do and Don't Verify

Model cards are the most common provenance document in the current ecosystem. A well-written model card specifies the model's intended use, training data sources and composition, evaluation methodology and results, and known limitations. They are valuable. They are also entirely unverified.

A model card is a text document attached to a repository. Nothing cryptographically binds the model card to the weights in the repository. Nothing prevents a model author from overstating training data curation, understating evaluation failures, or omitting disclosures of known problems. Nothing prevents a third party from forking a model repository, modifying the weights, and leaving the original model card intact — or from uploading entirely different weights than those the card describes.

Model cards represent what the uploader *claims* about the model. They are closer to a product datasheet than to a signed attestation. In a world without other verification mechanisms, they are worth reading. In a world with model signing and provenance attestation, they become one input among several that can be checked against a verifiable record.

The model card standard has a format problem too. There is no mandatory field set. One model card includes a full dataset breakdown and evaluation methodology; another is three sentences. Tooling that tries to parse model cards for compliance signals encounters inconsistency that makes automated processing unreliable. The [Hugging Face model card specification](https://huggingface.co/docs/hub/model-cards) defines recommended fields, but cannot enforce that any of them are filled accurately.

Model cards are necessary and useful. They are not sufficient.

---

## Cryptographic Signing for Model Weights

The conceptual extension from software signing to model signing is direct. When you install software from a trusted source, the package is typically signed by the publisher's key, and your package manager verifies that signature before installation. The signature gives you two properties: **authenticity** (this package was produced by someone who controls the private key) and **integrity** (the package hasn't been modified since it was signed).

Model weights are large binary files — not fundamentally different from other software artifacts from a signing perspective. The same mechanisms apply.

### The Sigstore Approach

[Sigstore](https://www.sigstore.dev/) is a Linux Foundation / OpenSSF project that provides signing infrastructure designed to be practical without requiring every developer to manage cryptographic key pairs. Its core insight is that most signing failures happen because key management is hard: private keys get lost, forgotten, compromised, or never created in the first place. Sigstore's *keyless signing* model removes the key management burden by binding signing events to a short-lived certificate tied to an OIDC identity (such as a GitHub Actions workflow or a Google account).

The mechanism: when you sign an artifact with Sigstore's `cosign` tool using keyless mode, Fulcio (Sigstore's certificate authority) issues a short-lived certificate tied to your verified OIDC identity. The signing event — the certificate, the public key, and the artifact digest — is recorded immutably in Rekor, Sigstore's append-only transparency log. A verifier can later check the Rekor record to confirm that a specific identity signed a specific artifact at a specific time, without needing to hold or trust a long-lived signing key.

For ML models, this means a training pipeline can emit a Sigstore signature at the moment a checkpoint is produced, recording the training run's identity (e.g., a GitHub Actions workflow run) and a cryptographic digest of the checkpoint file. Anyone who later downloads the checkpoint can verify that signature against Rekor — confirming the file hasn't changed since the signing event and that the signing identity matches what the model publisher claimed at release time.

### The model-transparency / ModelSigning Project

Google and the Open Source Security Foundation (OpenSSF) released the `model-transparency` project (also published as the `model-signing` library) to make Sigstore-based signing practical for ML artifacts. The library handles the specific challenges of signing large model checkpoint files — including multi-file model representations (a single model checkpoint can span dozens of sharded files) and the integration with common ML workflows.

NVIDIA subsequently began signing models in the NGC Catalog using Sigstore infrastructure, representing one of the first large-scale deployments of cryptographic model signing at a major commercial model registry.

Signing does not happen at the point of download — it happens at the point of publication, ideally integrated into the training or release pipeline. The practical deployment pattern is:

1. Training completes; the checkpoint is produced.
2. A CI/CD step signs the checkpoint files with Sigstore, recording the signing event in Rekor.
3. The checkpoint and signature are published to the model hub.
4. Consumers download the checkpoint and verify the signature, confirming authenticity and integrity before loading.

Step 4 is currently the weakest link. Verification tooling exists — for blob artifacts outside of OCI registries, `cosign verify-blob` is the relevant command, or the model-signing project's own verification tooling for manifests produced by that tool. But verification is not integrated into `torch.load()`, HuggingFace's `from_pretrained()`, or other standard model loading APIs. Consumers have to consciously add verification to their deployment workflow; the default is to load without checking.

This is the same problem software package managers solved by making verification the default, not an optional step. The ML ecosystem has not yet converged on a similar norm.

---

## ML Software Bills of Materials

An SBOM documents the components of a software artifact — every library, dependency, and third-party module that went into building it. Executive Order 14028 (May 2021) made SBOMs a condition of selling software to US federal agencies, driving widespread adoption of SBOM tooling and establishing the format as a compliance baseline across the software industry.

An ML-SBOM extends this concept to the components of a trained model. The contents differ from a software SBOM because the "supply chain" for a model is different: the meaningful upstream components are training datasets, preprocessing pipelines, base model weights, and fine-tuning configurations — not software libraries in the traditional sense (though those matter too, in the training infrastructure itself).

### CycloneDX ML-BOM

[CycloneDX](https://cyclonedx.org/capabilities/mlbom/) — the OWASP-originated BOM standard that is now also an Ecma International standard (ECMA-424) — includes explicit ML-BOM capability. The specification defines how to record:

- **ML model components**: the model architecture, base weights, fine-tuning layers
- **Datasets**: the datasets used in training and fine-tuning, with references and provenance claims
- **Training environment**: frameworks, hyperparameters, hardware configurations
- **Algorithms**: the training algorithms and optimization procedures applied

CycloneDX ML-BOM outputs are machine-readable (JSON or XML), which means they can be processed by automated compliance tooling, consumed by security scanners, and verified against policy rules.

**SPDX** (the Linux Foundation's SBOM standard, now ISO/IEC 5962) has also been extended with ML-relevant fields. The two standards remain parallel and somewhat overlapping; the industry has not converged on one for ML use cases specifically.

### What an ML-SBOM Enables

An ML-SBOM enables questions that model cards can't answer reliably:

- **Dataset provenance**: What datasets were used in training? Can each be referenced by a specific, verifiable version identifier?
- **License compliance**: What are the licensing terms of the training data, and are they compatible with the intended deployment?
- **Data restriction flags**: Does the training data include content that is restricted for certain deployment contexts (e.g., healthcare data, data from minors)?
- **Base model lineage**: Does this fine-tuned model derive from a base model whose terms of service restrict commercial use?

These questions matter for compliance. They also matter for operational security: an organization that wants to verify a third-party model is operating within its stated data use commitments currently has no machine-readable way to do so. An ML-SBOM with cryptographic attestation would provide that.

The regulatory direction is clear. The NIST AI Risk Management Framework (AI RMF) references traceability and documentation of AI systems. EU AI Act compliance for high-risk AI systems includes documentation requirements for training data and development methodologies that have structural similarity to SBOM-style disclosures. The question is not whether ML SBOMs will be required — it is when, and in what form.

---

## Model Registries and Artifact Integrity

Container image security provides a useful precedent. Docker image digests (`sha256:...`) give a content-addressed identity to any image. Container signing tools allow image publishers to attest that a specific digest was produced by a specific identity. Consumers can pin to a specific digest and verify the signature before running a container — and this is increasingly the default in production Kubernetes deployments.

The same infrastructure can apply to model artifacts.

**Digest pinning**: Rather than referencing a model by name (`meta-llama/Llama-3-8B`), reference it by a specific commit hash or content digest. This gives integrity — no adversary can produce a different file with the same SHA-256 digest, since SHA-256 collision resistance makes this computationally infeasible. But integrity alone does not give you authenticity: knowing *which* digest is the expected one in the first place requires trusting whoever provided that information to you. This is why digest pinning and signing are complementary, not interchangeable.

**Signed manifests**: Combining digest pinning with a Sigstore-or-similar signature gives both integrity and authenticity. A signed manifest that records the model name, the digest, the signing identity, and the timestamp means a consumer can verify not just that they got the right file, but that a specific, verifiable identity vouched for that file. For Sigstore keyless signatures, the signing event is additionally recorded in Rekor, an append-only public transparency log — the publisher cannot retroactively alter this record, giving verifiers an out-of-band trust anchor that is independent of the model repository itself.

**HuggingFace Hub** stores model files in a Git-based repository with content-addressable storage. This gives integrity (the commit hash covers the file contents), but does not inherently give authenticity (the commit hash doesn't tell you whether the contents are what the claimed author intended). Signed commits — GPG-signed Git commits from model publishers — provide an intermediate step; HuggingFace supports verified commit badges for GPG-signed commits from verified organizations.

**MLflow Model Registry** provides versioned artifact storage with metadata tracking, and supports integration with artifact signing workflows, though out-of-the-box signing is not the default.

The trajectory is toward model registries that treat signing as infrastructure rather than an optional add-on — analogous to how container registries evolved from storing unsigned images to treating signed manifests as a deployment gate in production environments.

---

## Training Data Provenance: The Unsolved Layer

Model signing verifies that the weights you downloaded match the weights that were published. ML-SBOMs document what datasets were used to train those weights. Both of these are useful. Neither answers the deeper question: how do you verify that the claimed training data is what was actually used, and that it meets your organization's standards?

This is the hardest layer of the provenance problem.

**Data Cards**: Analogous to model cards, Data Cards are structured documentation for datasets covering composition, collection methodology, preprocessing, known biases, and intended uses. Google's Data Card Playbook and HuggingFace's dataset cards are the most prominent implementations. Like model cards, they are unverified documentation, not cryptographic attestation.

**Dataset version pinning**: Datasets on HuggingFace have version identifiers and commit hashes, providing integrity for a specific dataset snapshot. An ML-SBOM referencing a specific dataset commit hash gives verifiable identification of the exact training data — as long as the SBOM itself is trustworthy.

**The undisclosed web scraping problem**: The most significant gap in training data provenance is the pervasive practice of large-scale web scraping without granular disclosure. Models trained on Common Crawl snapshots, or derivatives of them, incorporate content from billions of web pages with varying provenance, licensing, and content policies. A model card that says "trained on Common Crawl and other web data" is technically correct and practically uninformative for anyone trying to understand whether specific categories of content (proprietary code, copyrighted text, personal data) appear in the training set.

**C2PA for training data provenance**: The [C2PA standard](/blog/content-provenance-c2pa-synthid) was designed to establish content authenticity — whether a given piece of media is what it claims to be, produced by whom it claims. Applied to training data, C2PA provenance manifests on content assets provide a mechanism for dataset curators to record the origin and authenticity of individual training examples. A training dataset where each item carries a C2PA manifest would provide more granular provenance than current practice. This is a future capability, not a current deployment reality; C2PA adoption is concentrated in generated-content contexts rather than training-data-curation contexts. The related post on [content provenance](/blog/content-provenance-c2pa-synthid) covers the current state of C2PA deployment in detail.

**Membership inference and dataset attribution**: Research tools exist for probing whether a specific piece of content was likely included in a model's training data (membership inference attacks), and for identifying which datasets contributed to specific model behaviors. These are forensic tools rather than provenance mechanisms — they help investigate after the fact rather than verify before deployment. The [membership inference](/blog/membership-inference-attacks) post covers this attack surface from the privacy perspective.

The honest assessment: training data provenance is where the current tooling has the most significant gaps. Signing tells you the weights are authentic; an ML-SBOM tells you what was claimed about the training; neither gives you a cryptographic proof that the claimed training data matches what was actually used. Closing that gap requires integrations between training infrastructure, dataset provenance systems, and attestation mechanisms that don't yet exist at production scale.

---

## Practical Verification Checklist

When deploying a third-party model — particularly an open-weight model from a public registry — the following checks represent the current state of practical verification. Not all are possible for all models; the list represents what should be demanded as baseline, with the expectation that signing and SBOM coverage will expand over the next few years.

**Before downloading**:

- Does the model have a complete model card with stated training data, evaluation results, and intended use? Incomplete or vague cards are a signal that provenance claims are not being made with confidence.
- Is the model published by a verified organization with a history of responsible disclosure and documentation? Name recognition is a weak signal; verified organization status on the hub is a slightly stronger one.
- Does the model have an active community, recent issue responses, and a version history that matches claimed development history? Sparse repos with no history are higher risk.
- Are there any open security reports or flagged content warnings on the model page?

**At download time**:

- Record the exact commit hash or content digest of the weights you downloaded. This gives you an integrity baseline — if the weights change on the hub later, you'll be able to detect it. Note that full model checkpoints include sidecar files (`config.json`, tokenizer files, sharded index files) alongside the weight shards — pin the commit hash for the full repository snapshot, not just the weight files individually.
- If Sigstore signatures are available (currently limited to models signed through the model-transparency project or similar), verify them before loading. For blob artifacts use `cosign verify-blob`, or the model-signing project's own verification tooling for manifests produced by that tool. When verifying a Sigstore keyless signature, the trust anchor is the entry in the public Rekor transparency log — this is an append-only public record that the publisher cannot control retroactively, providing an independent verification point outside the model repository. Compare the signing identity (the OIDC-bound certificate) against the publisher's documented release pipeline (e.g., a specific GitHub Actions workflow in a specific organization), using that documentation as a guide rather than the model card, which is mutable.
- If the hub provides a Picklescan or Guardian scan report indicating the checkpoint is clean, note it as a weak signal. The [malicious model files post](/blog/malicious-ai-model-files-pickle-exploits-arbitrary-code-execution) covers the limitations of scan-based defenses; a clean scan is not a security guarantee.
- Prefer safetensors format over pickle-based formats where available. This eliminates the pickle/deserialization arbitrary code execution risk at load time; however, `trust_remote_code=True` (a non-default flag in `from_pretrained()`) can still execute custom Python from the model repository regardless of file format.

**Before loading in production**:

- **If you must load a pickle-format checkpoint**: do not treat sandbox loading as a safe verification step on its own. For pickle-based formats or checkpoints with `trust_remote_code`, the act of loading already executes attacker-controlled code. The correct pre-production verification sequence is: (1) prefer safetensors where a version exists; (2) if pickle-only, scan with Picklescan/Guardian first; (3) if loading is necessary for evaluation, do so in an ephemeral, no-egress, no-credential environment — network-isolated with no access to cloud provider tokens, database credentials, or internal services — so that any payload has no exfiltration path. This is isolation, not verification; the sandbox does not tell you the model is safe, it limits the blast radius if it isn't.
- Verify the model outputs against the benchmarks the model card claims before promoting to production.
- If an ML-SBOM is available (rare currently, becoming more common), parse it for dataset declarations and verify compatibility with your organization's data use policies and licensing requirements.
- For regulated deployments (healthcare, finance, government), document the provenance steps taken. Even if full cryptographic attestation isn't available, a documented record of what was checked and when provides an audit trail for compliance purposes.

**Ongoing**:

- Monitor the upstream model repository for changes, especially weight updates that aren't accompanied by a new version or changelog. An unexplained weight update to a model you've pinned is a signal worth investigating.
- Re-verify provenance when updating to a new model version. The provenance chain resets at each new checkpoint.
- Subscribe to security advisories from major model hubs; HuggingFace and others publish notifications when malicious models are removed or flagged.

---

## The Regulatory Direction

The current state is early infrastructure: model signing is technically possible but not universally deployed; ML-SBOMs are specified but not broadly generated; verification tooling exists but isn't integrated into default loading workflows. The regulatory and standards trajectory is clear, however.

EO 14028's SBOM mandate created a market for SBOM tooling and established the expectation that supply chain transparency is a compliance requirement, not a best practice. That expectation is extending to AI systems. The NIST AI Risk Management Framework's traceability requirements, the EU AI Act's documentation requirements for high-risk AI systems, and sector-specific guidance from regulators in healthcare (FDA's AI/ML-based SaMD guidance) and financial services all point toward formal provenance documentation as a compliance baseline.

The practical implication for organizations deploying AI systems: the question is not whether to implement provenance verification, but how far ahead of regulatory requirements to get. Organizations that build signing verification and ML-SBOM generation into their MLOps pipelines now are doing the work that will be required later, while also reducing their exposure to the supply chain attacks documented in the [companion post on AI supply chain attacks](/blog/ai-agent-supply-chain-attacks).

---

## Closing Frame

Software package managers made signature verification the default because experience proved that leaving it optional meant it was routinely skipped. The ML ecosystem is still in the "optional step" phase: the tooling exists, the standards are emerging, and the early adopters have deployed it. Broad adoption requires that verification be the default behavior of model loading APIs, not an additional step that practitioners have to consciously add.

The near-term trajectory:
- Sigstore-based model signing will become more common as the model-transparency project matures and integrates with major model hubs.
- CycloneDX ML-BOM and SPDX ML extensions will see tooling support as regulatory requirements drive demand.
- Major model registries will move toward signed manifests as default, following the container registry precedent.
- Verification integration into `from_pretrained()` and similar APIs is the critical unlock for widespread adoption — when verification happens transparently at load time, the opt-in barrier disappears.

In the meantime, the checklist above represents what's achievable today. It's incomplete compared to the mature software supply chain — no cryptographic proof of training data fidelity, limited signing coverage, verification not integrated into standard tooling. But using safetensors format, pinning to specific digests, verifying available signatures, and preferring models from verifiable publishers is a meaningfully better posture than treating downloaded model files as trusted data.

The core principle doesn't change between software and models: trust is established by verification, not by assumption. The model you're about to run in production is a large binary you downloaded from the internet. That it looks like a tensor file rather than an executable doesn't change the obligation to verify it.

---

*This post covers the defensive, verification side of AI model supply chain security. See also: [AI Agent Supply Chain Attacks](/blog/ai-agent-supply-chain-attacks) for the attack surface this post defends against; [Sleeper Agents in Production](/blog/sleeper-agents-ai-supply-chain-backdoor) for the behavioral backdoor threat that signing helps detect by establishing chain of custody; [Malicious AI Model Files](/blog/malicious-ai-model-files-pickle-exploits-arbitrary-code-execution) for the pickle deserialization attack that safetensors format prevents; and [Content Provenance: C2PA and SynthID](/blog/content-provenance-c2pa-synthid) for the related problem of provenance for AI-generated content.*