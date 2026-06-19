---
title: "VEGA: Zero-Knowledge Proofs for Digital Identity in the Age of AI Agents"
description: "Microsoft Research's VEGA system generates cryptographic proofs from government credentials in 92ms — letting AI agents verify identity facts without ever seeing the underlying document."
pubDate: 2026-06-20
tags: ["zero-knowledge-proofs", "digital-identity", "agent-security", "nhi-trust", "privacy", "cryptography"]
---

When an AI agent books a flight on your behalf, should it ever need to see your passport? When your digital wallet proves you're over 21 to enter a website, does the site need a copy of your driver's license?

Today the answer to both questions is usually yes — because the only way to assert a fact about a credential is to hand over the credential itself. Microsoft Research's [Vega](https://www.microsoft.com/en-us/research/blog/vega-zero-knowledge-proofs-for-digital-identity-in-the-age-of-ai/) changes that calculus. It's a zero-knowledge proof system that can prove facts about government-issued credentials in under 100 ms on a commodity phone, with no trusted setup, producing proofs small enough to transmit in a single network request. The credential never leaves the device.

This isn't a theoretical demonstration. It runs on real credential formats — mobile driver's licenses, the EU Digital Identity Wallet — and is implemented in Rust with open source plans underway. It was presented at IEEE S&P 2026 in San Francisco.

## What Zero-Knowledge Proofs Actually Do

The core idea of a zero-knowledge proof is deceptively simple: you prove you know something without revealing what you know.

In the identity context: instead of showing your driver's license (which reveals your name, address, license number, photo, and height alongside your age), you present a cryptographic proof that a validly-issued license contains a date-of-birth field placing you over 21. The verifier learns exactly one bit: the claim is true. Everything else stays hidden.

Prior systems made this impractical. The main obstacles were:

- **Trusted setups**: many ZKP systems require a ceremony to generate public parameters. If this setup is compromised, forged proofs become possible. And when the credential logic changes — a new field, a new predicate — the ceremony has to run again.
- **Proof size**: some approaches produced proofs too large for practical transmission, especially on mobile.
- **Latency**: generating a proof in a browser or on a phone took seconds to minutes, not the sub-100ms response time users expect.

Vega's contribution is threading all three needles simultaneously: no trusted setup, 108 KB proof, 92 ms generation on device.

## The Architecture: Fold, Reuse, Lookup

Vega's speed comes from two insights applied to the heaviest part of credential verification: hashing.

A mobile driver's license (about 2 KB) is encoded in CBOR and signed by the issuing authority. To prove anything about it, the prover must show they know the credential's preimage — which means reproducing the SHA-256 hash that the issuer signed. SHA-256 works by applying the same 64-byte compression step repeatedly, one block at a time. A naïve circuit unrolls all of those iterations, growing linearly with credential length. For a typical license, that's 30 compression rounds.

Vega splits this differently. It defines one small "step" circuit that handles a single SHA-256 compression, then instantiates it once per block. Because all 30 instances are structurally identical, [NeutronNova's](https://eprint.iacr.org/2024/1605) folding scheme can collapse them into a single instance. The final proof — built by [Spartan](https://eprint.iacr.org/2019/550) — only needs to verify one step circuit plus a separate "core" circuit handling the signature check and predicate logic (e.g., "birth date is before today minus 21 years"). The proving key remains small regardless of credential length.

**Fold-and-reuse** takes this further. When a user presents their credential to multiple services — or through an AI agent that presents the same identity proof dozens of times per day — most of the expensive work happens once. The SHA-256 tables, the issuer signature commitment, the field location offsets: these are computed and cached on first load. Each subsequent presentation refreshes the cached commitments with fresh randomness (preserving unlinkability) and adds only the session-specific online component. The per-presentation cost drops substantially.

**Lookup-based credential parsing** avoids building a full CBOR parser circuit. The prover instead tells the circuit "the device public key starts at byte 847" and supplies those bytes. The circuit verifies three things: the bytes match the authenticated credential, a valid CBOR field prefix appears at the claimed location, and the bytes are contiguous so the prover can't splice fields from unrelated positions. A full parser replaced by a handful of lookups. This approach works because ISO/IEC 18013-5 mandates both canonical CBOR encoding and a schema-level structure with uniquely identified, non-repeating fields — the mDL schema doesn't permit duplicate keys or ambiguous field positions that would undermine the byte-offset lookup.

## Device Binding: Why Agents Can't Forge These Proofs

A zero-knowledge proof that can be generated by anyone who has a copy of a credential offers weak security. If an attacker exfiltrates a credential file, they can produce valid proofs indefinitely. In an AI agent context, this is especially critical: an agent acting on behalf of a user should be constrained to claims the user's device actually authorized.

Vega's device binding closes this. When a credential is provisioned, the issuer embeds the holder's device public key directly in the credential — tied to the phone's secure element, where the private key lives and cannot be extracted. Each proof requires the device to sign the verifier's session nonce using this private key. The ZKP circuit then extracts the device public key from the credential via the lookup mechanism and verifies that device signature over the nonce. The nonce binds the proof to a specific verifier exchange; well-designed implementations also bind it to the verifier's identity and the requested predicate scope to prevent a relay from presenting a proof to a different relying party than the user intended.

The consequence: possession of a credential file is not sufficient to produce a valid proof. Only the device holding the secure element private key can generate one. An AI agent can present a proof on behalf of a human — but cannot forge it, cannot escalate it. Replay resistance across sessions is not a property of the proof itself; it depends on verifiers issuing fresh single-use nonces and rejecting replayed proofs, which is a deployment requirement that verifiers must enforce.

This is the cryptographic answer to a question that's becoming increasingly pressing in agentic AI: how do you delegate identity without delegating the credential?

## Why This Matters for Non-Human Identity (NHI) Trust

The Vega paper's "where this leads" section is explicit about the agentic case. As autonomous agents begin booking travel, filling forms, interacting with APIs, and entering agreements on behalf of humans, they'll need to assert identity facts their principals hold. Current approaches have two failure modes:

1. **The agent holds the credential** — which means the agent is a target. Compromise the agent, exfiltrate its context, and you have the credential. You also have a system that can generate identity proofs unconstrained by the human's intent.

2. **The agent acts without identity** — which means services can't trust that an agent has the authority it claims, leading to friction, manual review, or blanket agent restrictions.

Vega offers a third path. The human's device generates a ZKP bound to the verifier's challenge nonce — a fresh value issued by the service the agent is talking to. The agent carries the resulting proof — a 108 KB opaque blob — and presents it to services. The services verify the proof cryptographically. The agent never holds the credential, cannot escalate the delegated claim beyond what the original proof committed to, and cannot present the proof to a different verifier (the nonce binding makes proofs non-transferable).

The model is better understood as **online co-signing** than portable delegation: because each proof is freshly device-signed against a specific verifier's challenge, the user's device must participate in each verification round. An agent cannot pre-generate a reusable proof cache for unknown future verifiers. For most interactive flows this is the right tradeoff — it keeps the user in the loop cryptographically. For fully offline or asynchronous pipelines, it's a constraint that requires architecture consideration.

"My principal is over 18." "My principal is a licensed physician." "My principal holds a valid EU Digital Identity Wallet." These claims can travel through agentic pipelines as verified facts, not as credentials at risk.

## The EU Digital Identity Wallet and Real-World Deployment

Vega isn't designed against a hypothetical credential format. Mobile driver's licenses use the ISO/IEC 18013-5 standard. The EU Digital Identity Wallet (EUDI) framework, which aims to make digital wallets available to all EU citizens, uses related formats. The UK's Online Safety Act and EU age-verification blueprints are pushing toward government ID-based age checks at scale.

Today's compliance approach has a predictable failure mode: the identity verification intermediary. You upload your passport to a third party, they issue an attestation (a cookie, a JWT, an on-chain token), and you present the attestation. You've given up your credential to prove a single fact. High-profile breaches have repeatedly exposed government IDs uploaded for exactly these routine verifications — they're not edge cases, they're the predictable consequence of asking users to hand over sensitive documents.

Vega's proof could sit directly in a browser extension or digital wallet. Age verification flows that currently require an upload could instead receive a ZKP generated in 92 ms. The verifier never sees the underlying credential. The credential itself isn't stored or transmitted — though verifiers can still retain the received proof, predicate outcome, and request metadata. The attack surface shifts from "breach the credential store" to "breach proof and metadata logs," which is a meaningfully smaller exposure than holding government document scans.

## On-Chain Identity Without an Intermediary

The same mechanism addresses a second class of problem: bridging government identity to on-chain systems.

Decentralized applications increasingly need real-world signals — KYC compliance, accredited investor status, jurisdiction checks. Today this is handled by centralized intermediaries who verify the credential off-chain and issue an attestation on-chain. The user loses privacy twice: once to the intermediary (who sees the full credential), and again on-chain (where the attestation may be linkable across transactions).

A Vega proof could replace the intermediary for off-chain identity assertion. The user proves a predicate from their government credential — "I am a resident of jurisdiction X" — and an off-chain verifier receives only the proof. No third party ever sees the license or passport. The rerandomization mechanism ensures that the same credential, presented to five different verifiers, produces five unlinkable proofs.

Two caveats apply to on-chain deployment specifically. First, gas costs: naively submitting a 108 KB proof as calldata is expensive on most EVM chains; practical deployments use off-chain verification with on-chain attestation of the result, or chains with cheaper data availability. Second, interactive nonce issuance fits poorly with smart contracts and public mempools — the verifier-side challenge needs an interactive round before proof generation, which doesn't map directly to typical contract call patterns. The cleaner architecture is a trusted oracle or verification service that receives the proof off-chain, validates it, and posts an on-chain assertion the contract trusts — preserving the privacy gain (the credential never hits the oracle permanently) while sidestepping the gas and interactivity constraints.

## Technical Underpinnings

The proof system beneath Vega is the [spartan2](https://github.com/microsoft/spartan2) project, already open source on GitHub. Vega itself is implemented in Rust and will be open sourced following the IEEE S&P presentation.

The key primitives assembled in Vega:

| Component | Role |
|-----------|------|
| **Spartan** | Efficient R1CS proving with succinct proofs, no trusted setup |
| **Nova** | Folding scheme for compressing many instances of the same computation |
| **NeutronNova** | Efficient batch folding — collapses 30 SHA-256 step instances into one |
| **NovaBlindFold** | Achieves zero-knowledge by folding a real instance with a random one — hides secret data with minimal overhead |

The prover key is 464 KB — fits comfortably on any phone. Proof generation: 92 ms. Proof verification: 23 ms. Proof size: 108 KB. These numbers are from the paper's benchmarks on a commodity client device (unspecified exact hardware in the blog post, with full specifications in the paper); real-world performance will vary with device tier and workload.

For smaller credentials (sub-1 KB), these numbers drop further: 62 ms generation, 83 KB proofs, 17 ms verification.

## The Security Model Is Worth Understanding

Zero-knowledge is a precise claim, not a marketing term. In Vega's case it means:

- The verifier receives the proof and learns only whether the claimed predicate is true or false about a validly-issued, in-scope credential
- The proof leaks nothing about the credential's other fields, its byte layout, its full contents
- Repeated proofs from the same credential are unlinkable (rerandomization ensures distinct commitments each time)
- The proof cannot be forged without the device's secure element private key, even with a copy of the credential

What it doesn't protect: the predicate itself is disclosed. If you prove "age ≥ 21", the verifier knows you're at least 21. If the predicate is narrow enough, this can still be identifying (a single verifier combining "licensed physician" + "issued in state X" + "age 35-40" might narrow the population significantly). Predicate design is a policy question, not a cryptography question.

Credential validity is also out of scope for the ZKP itself. A Vega proof demonstrates a cryptographically valid credential with a satisfying predicate, but it doesn't embed revocation status or expiry enforcement — those checks depend on the credential format (mDLs include an expiry field readable as a predicate) and verifier policy. A revoked or expired credential can still produce a cryptographically sound proof; verifiers must check credential freshness separately.

The system also doesn't protect against a compromised device or a compromised verifier. If the secure element is exploited, device binding fails. If the verifier is malicious, the predicate result gets logged. These are out-of-scope by design.

## What Changes When This Ships

The gap between theoretical ZKP research and production credential infrastructure has been wide for a long time. Systems that required trusted setups were fragile organizational commitments, not deployable primitives. Systems with second-scale proving times couldn't sit in browser auth flows. Systems with megabyte proofs couldn't run on mobile networks.

Vega narrows that gap substantially. Sub-100ms, sub-200KB, no trusted setup, Rust, ISO 18013-5 compatible. That combination is different from prior work.

If it eventually integrates with EU Digital Identity Wallets — the framework is in motion and the credential formats are explicitly targeted, though no confirmed integration timeline exists — millions of users could get privacy-preserving identity verification as a default, not an opt-in. Age verification flows, professional credential checks, and jurisdiction attestations would become provable facts that don't require showing anyone the source document.

For AI agents specifically: the question of "how does an agent prove who it's acting for?" starts to have a cryptographic answer rather than a policy one. An agent that can carry device-bound ZKPs doesn't need to hold credentials. A verifier that accepts ZKPs doesn't need to trust the agent's claims about its principal — it verifies the proof.

The alternative — agents that accumulate credentials in context windows, trust signals that are assertions rather than proofs, identity delegation built on shared secrets rather than cryptography — is a vulnerability class waiting for a name.

---

**Source**: [Vega: Zero-Knowledge Proofs for Digital Identity in the Age of AI](https://www.microsoft.com/en-us/research/blog/vega-zero-knowledge-proofs-for-digital-identity-in-the-age-of-ai/), Microsoft Research Blog (May 2026)  
**Paper**: [Vega: Low-Latency Zero-Knowledge Proofs over Existing Credentials](https://www.microsoft.com/en-us/research/publication/vega-low-latency-zero-knowledge-proofs-over-existing-credentials/), IEEE S&P 2026  
**Code**: [microsoft/spartan2](https://github.com/microsoft/spartan2) (proof system, open source)
