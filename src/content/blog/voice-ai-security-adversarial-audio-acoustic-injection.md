---
title: "Voice AI Security: Adversarial Audio, Ultrasonic Injection, and Attacks on Speech-Enabled AI Agents"
description: "Voice-enabled AI agents inherit a distinct attack surface that text-focused security misses entirely. Adversarial audio perturbations fool ASR pipelines invisibly, ultrasonic commands exploit microphone physics, and voice authentication breaks when attackers control TTS. Here's the threat model practitioners need."
pubDate: 2026-07-14
tags: ["voice-ai", "adversarial-examples", "acoustic-attacks", "speech-recognition", "ai-agents", "threat-modeling", "audio-security"]
relatedPosts: ["adversarial-examples-foundational-ml-attack-production", "multimodal-jailbreak-attacks"]
---

Text-based AI security has a growing toolkit: prompt injection defenses, token-level classifiers, RLHF safety alignment. What none of these protect against is an attack delivered at 23 kHz — above the threshold of human hearing.

As AI agents are deployed in voice interfaces — phone-based customer service agents, voice-activated assistants in healthcare and finance, LLM-powered IVR systems, real-time conversational AI — they inherit an attack surface that text-focused security models don't address. The audio modality is a continuous signal, not a discrete token stream. It has a physical channel: a microphone, a speaker, proximity to the attacker. And it operates in an environment where the AI can hear things humans cannot.

This is a distinct threat model from deepfake voice cloning (which targets humans) or image-based multimodal jailbreaks (which target vision-language models). The attacks described here target **AI systems via the audio modality** — exploiting the speech processing pipeline itself.

## Why the Audio Modality Is a Different Attack Surface

The voice AI pipeline has a structure that doesn't exist in text-based systems:

```
Physical environment → Microphone → Audio signal → ASR model → Transcribed text → LLM → Response
```

Each stage of this pipeline has its own attack surface:

- **Physical environment**: Attackers with physical proximity can introduce audio the device will process. This includes ultrasonic signals humans can't hear, audio played from a nearby speaker or TV, and signals embedded in ambient noise or music.
- **Microphone hardware**: Microphone components demodulate certain ultrasonic signals into the audible range — not a software bug, but a hardware physics property that creates an attack vector.
- **ASR model**: Adversarial noise additions to audio can cause the speech-to-text layer to transcribe entirely different text, while the original audio sounds unchanged to a human listener.
- **LLM downstream**: If the transcribed text is trusted as authentic user input, any attacker who can control what the ASR produces can inject arbitrary instructions into the LLM layer.

Compare this to a text-only system: there's no physical channel, no hardware physics to exploit, and no ASR stage where an imperceptible perturbation can redirect transcription. Voice systems carry vulnerabilities that simply don't exist in the text domain.

## Attack 1: Adversarial Audio Perturbations

The most technically rigorous attack on voice AI pipelines adapts adversarial example techniques to the audio domain. The foundational result comes from Carlini and Wagner (2018), who demonstrated 100% targeted attack success against the DeepSpeech ASR system with perturbations inaudible to human listeners.

The technique is conceptually similar to image adversarial examples (small, imperceptible modifications that cause misclassification), but the audio domain introduces specific challenges:

- Audio is a time-series signal with temporal structure; perturbations must preserve perceptual quality across the entire waveform, not just individual frames.
- The human auditory system has complex masking properties — certain frequencies are imperceptible when played alongside other audio — which adversarial audio exploits to hide perturbations.
- ASR models operate on features computed from the waveform (MFCCs, spectrograms) rather than raw samples, so perturbations must survive the feature extraction step.

Carlini and Wagner used gradient-based optimization (similar to C&W image attacks) to find audio perturbations that cause DeepSpeech to transcribe a target phrase of the attacker's choosing, subject to the constraint that the perturbation is below a perceptual threshold. The key result: **any audio file can be turned into any target transcription while remaining near-indistinguishable to a human listener**.

### Implications for ASR-Fronted AI Agents

For a voice AI agent that trusts ASR output as representing the user's intent, this attack is an instruction injection primitive at the audio layer. An attacker who can play audio near a device — or stream it during a phone call — can inject arbitrary text into the LLM's context.

The practical threat scenarios include:

- **Phone channel injection**: An attacker plays crafted audio during a customer service call. The AI agent's ASR transcribes the attacker-chosen instruction, not the audio the human listener heard.
- **Shared physical environments**: In open offices, retail environments, or any space with a voice-enabled AI device, an attacker with a nearby speaker can inject commands.
- **Recorded media**: Audio files sent as voice messages or played in calls can carry imperceptible adversarial perturbations.

Text-input filtering doesn't see this attack. It operates upstream of any text-layer defense.

## Attack 2: DolphinAttack — Ultrasonic Voice Commands

The DolphinAttack, published by Zhang et al. at ACM CCS 2017, exploits a different property of the audio pipeline: **microphone hardware demodulates ultrasonic signals**.

The mechanism works as follows:

1. The attacker modulates a voice command onto a carrier signal above 20 kHz — above the threshold of human hearing.
2. Because microphone hardware is not perfectly bandlimited, the ultrasonic signal is received by the microphone and demodulated into the audible range by hardware nonlinearities in the analog front-end.
3. The resulting demodulated signal is processed by the device's voice activation and ASR systems, which "hear" it as an audible command.
4. The human in the room hears nothing. The device acts on the command.

This is not a software vulnerability. It's a consequence of physical component behavior in widely deployed microphone hardware. Zhang et al. tested the attack against **sixteen different smart devices** including iPhone, Apple Watch, MacBook, Amazon Echo, Samsung Galaxy, Google Nexus, and Audi Q3 (in-car voice control) — all were vulnerable.

The attack range is limited (meters, not kilometers), but the physical constraints can be worked around:

- Directional speakers can extend range and focus the signal.
- Roy et al. (2018) demonstrated a long-range variant using parametric arrays — transducer arrays that can focus ultrasonic beams over longer distances, achieving command injection from across a room or through physical barriers.
- The carrier frequency and modulation scheme can be adapted to exploit specific hardware properties, making hardware-level mitigation non-trivial.

### Commands That Can Be Injected

The DolphinAttack paper demonstrated a range of commands including: "Hey Siri, FaceTime [attacker number]", "OK Google, turn on airplane mode", "Alexa, open the backdoor [on a connected home system]", and navigation instructions in a vehicle's voice interface. The attack is general: any command the device would accept from a human user can be injected ultrasonically.

For modern LLM-backed voice agents, the injection surface is substantially larger than for command-based smart speakers. A voice agent that can browse the web, send emails, make calls, or execute code is a much higher-value target for ultrasonic command injection.

## Attack 3: Hidden Voice Commands in Ambient Audio

The adversarial audio and ultrasonic attacks above require proximity and some technical capability. A third attack class requires neither: embedding voice commands in music, ambient sound, or public address broadcasts.

Vaidya et al. (2015) — in a paper with the memorable title "Cocaine Noodles" — identified an early version of this attack: speech processed through certain transformations was unintelligible to humans but recognized as specific phrases by ASR systems. The paper established the principle that human speech perception and machine speech recognition are not equivalent, and that this gap can be exploited.

Subsequent work has refined this into practical attacks:

- Voice commands can be embedded in music such that humans hear only the music, while voice-activated devices activate and process the command.
- Commands can be overlaid on legitimate public address audio at low amplitude, invisible to human attendees but recognized by devices in the space.
- "Over-the-air" attacks play adversarial audio through speakers and rely on the device's microphone picking up the manipulated signal.

The underlying mechanism exploits the fact that ASR systems have fundamentally different auditory sensitivity profiles than humans. A machine speech recognizer trained on large audio datasets has learned acoustic patterns that can be triggered by signals that don't correspond to how the phonetic content sounds to a human auditory system. Adversarial audio crafted to exploit these differences looks like noise or music to a person, while activating specific recognition pathways in the model.

## Attack 4: Voice Authentication Bypass

Many phone-channel AI agents authenticate users via voiceprint verification: compare the caller's voice to an enrolled voiceprint, and grant access if the match score exceeds a threshold. This authentication mechanism breaks down when:

1. **TTS voice cloning**: High-quality text-to-speech models can now generate convincing voice reproductions from relatively short enrollment samples (seconds to minutes of audio). An attacker who has recorded a few minutes of the target's voice — from social media, voicemail greetings, public appearances — can generate audio that passes voiceprint authentication.

2. **Conversion attacks**: A voice conversion model transforms the attacker's own voice to match the target's voiceprint characteristics while preserving natural prosody and variation. This is harder to detect than fully synthetic speech because it contains natural human speech properties.

3. **Adversarial perturbations targeting the speaker verification model**: Rather than cloning the target voice, the attacker crafts audio that has a high similarity score to the target's enrolled voiceprint, without necessarily sounding like the target. This is a white-box attack that requires knowing the speaker verification model's architecture and parameters, but black-box variants exist that transfer across models.

Voice authentication is particularly relevant for phone-based AI agents in banking, healthcare, and financial services — exactly the deployment contexts where high-stakes authorization decisions are made. A voice agent that grants account access or authorizes transactions via voiceprint authentication faces a threat model where authentication bypass has direct financial consequences.

## Attack 5: Cross-Modal Injection via the Phone Channel

The phone channel introduces a specific variant of injection attacks that doesn't require any physical proximity. The scenario:

1. An attacker initiates or participates in a phone call with a business or system that uses an AI agent on the receiving end.
2. The attacker plays audio (via TTS or a recording) containing adversarial content — either adversarial audio perturbations or simply commands that the AI agent's ASR will transcribe as attacker-chosen instructions.
3. The AI agent processes the transcribed text as if it were a legitimate instruction from the caller.

This is prompt injection, but delivered via the telephone audio channel rather than text. The key property: the attacker controls what audio is injected into the phone call, but the AI agent trusts whatever its ASR produces as representing the caller's intent.

For AI agents connected to tools — CRM systems, calendaring, databases, payment processing — this is a code-execution-equivalent primitive. An injected instruction that says "update customer record" or "schedule callback to [attacker number]" or "send transcript to [attacker email]" is indistinguishable from a legitimate caller making the same request, if the ASR transcription is trusted.

## Why Existing Defenses Don't Transfer

The standard toolkit for LLM safety doesn't address audio attack vectors:

**Text-layer input filtering** operates on ASR output — it sees the transcribed text, not the audio. Adversarial audio attacks specifically manipulate what the ASR produces. The filter sees the attacker's chosen transcription, not the original content.

**Rate limiting and request throttling** don't stop ultrasonic attacks or physical-layer injection. A single ultrasonic command injection completes in the same time as a legitimate voice command.

**Human-in-the-loop review** cannot detect inaudible commands. HITL assumes the human reviewer can assess whether the AI's behavior was appropriate. For an ultrasonic command that triggered a device action silently, there's nothing for a human reviewer to hear.

**Prompt injection mitigations** designed for text-based agents (boundary markers, instruction separators, role-based context isolation) don't help when the injection happens at the audio layer, before text-based defenses see any content.

**Content safety classifiers** on LLM outputs catch the response to an injected command, not the injection itself — and many injected commands ("schedule a meeting", "send an email", "look up this account") produce responses that look entirely benign.

## The LLM-Native Voice Agent: A New Threat Surface

The pipeline described above — microphone → ASR → text → LLM — is increasingly being replaced by **end-to-end audio language models** that take raw audio as direct input: GPT-4o Realtime, Gemini Live, and similar systems.

This architectural shift has security implications in both directions.

**Potentially harder to attack**: End-to-end audio models don't have a discrete ASR stage where adversarial perturbations can redirect transcription to attacker-chosen text. Perturbations optimized against a specific ASR model don't automatically transfer to a model with a different architecture.

**Potentially easier to attack**: The attack surface broadens. An end-to-end audio model processes the full audio signal in a way that researchers don't yet fully understand. Adversarial audio techniques specifically designed for end-to-end audio LLMs have not been systematically studied, but the multimodal jailbreak research ([arXiv:2510.20223](https://arxiv.org/abs/2510.20223)) demonstrates that audio-domain attacks can achieve 74–75% attack success rates against models like GPT-4o-Audio and Gemini 2.5 Flash using simple signal perturbations (pitch shifts, echo, volume changes) that defeat safety alignment.

**The open research question**: Do adversarial audio perturbations optimized against end-to-end audio models cause the model to "hallucinate" or act on injected instructions? Early results from the multimodal jailbreak literature suggest the answer is yes — that audio-domain attacks on safety alignment work even against end-to-end audio processing architectures. This is an area of active and rapidly evolving research.

The practical implication: organizations deploying GPT-4o Realtime or Gemini Live in high-stakes contexts (phone agents with tool access, voice-controlled autonomous systems) should not assume that moving to an end-to-end architecture eliminates audio-domain attack risk. The threat model is different, not absent.

## Defenses: What Actually Helps

### Audio Adversarial Detection

Adversarial audio perturbations can be detected by analyzing the audio signal for properties that are statistically unusual:

- **Spectral anomaly detection**: Adversarial perturbations have characteristic spectral signatures. A detection layer that looks for unusual energy distributions in frequency bands can flag audio that may have been crafted.
- **Psychoacoustic masking analysis**: Adversarial audio exploits hearing masking models. An analysis layer that identifies regions where significant energy is concentrated in perceptually masked frequencies can serve as a signal.
- **Multi-model transcription comparison**: Run the audio through multiple ASR systems. Adversarial audio crafted to target one model will often produce different transcriptions on a second model. Significant disagreement between two ASR systems on the same audio is a detection signal.

### Ultrasonic Filtering

Ultrasonic command injection can be mitigated at multiple layers:

- **Hardware bandpass filtering**: Applying a hardware low-pass filter that cuts frequencies above ~18 kHz before they reach the microphone's analog-to-digital converter prevents demodulation of ultrasonic signals. Some device manufacturers have begun implementing this.
- **Software bandpass filtering**: A software filter applied to the raw microphone input before ASR processing can remove ultrasonic content from the signal.
- **Frequency analysis monitoring**: Logging the frequency distribution of microphone input and alerting when significant energy is detected above normal speech ranges (~8 kHz) can flag potential ultrasonic injection attempts.

### Multi-Modal Confirmation for High-Stakes Commands

For voice agents authorized to take high-stakes actions (financial transactions, access authorization, sending sensitive information), requiring **confirmation through a second channel** before execution breaks the audio-only attack chain. An ultrasonic command that activates "transfer funds" can still be blocked if the system requires confirmation via a separate app notification, PIN entry, or text message acknowledgment.

This is the voice equivalent of multi-factor authentication: the attacker can inject via audio, but can't easily replicate confirmation on an uncompromised out-of-band channel.

### Voice Authentication Hardening

For systems using voiceprint authentication:

- **Liveness detection**: Require the caller to respond to dynamic challenges (repeat a randomly generated phrase) rather than accepting pre-recorded audio. Liveness detection makes it harder to replay cloned audio.
- **Anti-spoofing classifiers**: Add a spoofing detection model that distinguishes synthesized speech from live speech, running in parallel with voiceprint matching.
- **Behavioral biometrics**: Supplement voiceprint matching with call metadata — calling pattern analysis, device fingerprinting, behavioral history — so that voice alone is not the sole authentication signal.
- **Risk-based authentication**: Require stronger authentication for high-stakes actions (money movement, sensitive record access) than for low-stakes queries (account balance inquiries).

### Intent Verification at the LLM Layer

Even if adversarial audio bypasses ASR-level detection, the LLM can apply sanity checks before acting on transcribed instructions:

- **Context consistency**: Does the transcribed instruction make sense given the conversation history? An abrupt shift to "email my contact list to this address" mid-conversation is a red flag even if the ASR transcription looks clean.
- **Instruction boundary detection**: Treat unexpected imperatives in ASR output ("ignore previous instructions", "now do X", bare commands without conversational context) as injection signals requiring confirmation.
- **Confirmation for sensitive actions**: Require explicit verbal confirmation for any action that accesses sensitive data, executes external commands, or has irreversible effects — don't act on a single transcribed instruction for high-stakes operations.

### Physical Security Controls

For deployments where the physical attack surface matters (always-on voice assistants, open-office AI devices, vehicle voice systems):

- **Directional microphones**: Microphones with narrow pickup patterns are harder to attack with ultrasonic emitters that aren't in the device's line of reception.
- **Wake-word enrollment and strict matching**: Devices that require speaker-specific wake words rather than generic "hey [device]" wake words limit who can activate the device.
- **Acoustic isolation**: Physical placement of voice-enabled devices away from public spaces reduces the attacker's ability to inject audio without being detected.

## Putting It Together: A Threat Model for Voice AI Deployments

Practitioners deploying voice-enabled AI agents should assess their threat model against each attack class:

| Attack | Attacker Capability Required | Detection Signal | Mitigation |
|---|---|---|---|
| Adversarial audio perturbations | Can play audio to device | Multi-ASR disagreement, spectral anomaly | Audio adversarial detection, context-layer intent verification |
| Ultrasonic injection (DolphinAttack) | Physical proximity with ultrasonic emitter | Above-band microphone energy | Hardware/software bandpass filter |
| Hidden voice commands in music/ambient | Can play audio near device | Low-amplitude command signature | Multi-ASR, voice activity detection thresholds |
| Voice authentication bypass | TTS/voice cloning capability + target audio sample | Liveness detection failure, anti-spoofing classifier | Liveness detection, anti-spoofing classifier, out-of-band confirmation |
| Phone-channel instruction injection | Can call the AI agent and play audio | Context inconsistency, instruction boundary detection | Intent verification at LLM layer, multi-turn confirmation for sensitive actions |

High-risk deployments — phone agents in banking or healthcare, voice-controlled systems with consequential tool access — should treat the full threat model as active, not theoretical. These attacks have been demonstrated against deployed consumer devices and production AI systems. The academic literature establishing them is from 2015–2018; the attack techniques are mature and widely documented.

## The Bottom Line

Voice AI agents face a threat class that text-based AI security doesn't address: attacks delivered through the physics of sound. Adversarial audio perturbations operate below human perception while redirecting ASR transcription. Ultrasonic signals exploit microphone hardware to inject commands humans cannot hear. Voice cloning breaks authentication assumptions in phone-channel deployments. End-to-end audio models are beginning to show the same audio-domain safety gaps as image-capable multimodal models.

The defenses exist — bandpass filtering, liveness detection, multi-modal confirmation, intent verification. But they require knowing that the threat model is fundamentally different from text-based AI systems. Organizations deploying voice AI without extending their security model to the audio modality are missing an attack surface that has been systematically documented and exploited for nearly a decade.

When your AI agent can be instructed by sounds it cannot hear, the attack surface extends beyond the keyboard.

---

**Key papers:**

- *Nicholas Carlini and David Wagner. "Audio Adversarial Examples: Targeted Attacks on Speech-to-Text." 1st Deep Learning and Security Workshop (DLS 2018), co-located with IEEE S&P 2018. [arXiv:1801.01944](https://arxiv.org/abs/1801.01944)*

- *Guoming Zhang, Chen Yan, Xiaoyu Ji, Tianchen Zhang, Taimin Zhang, and Wenyuan Xu. "DolphinAttack: Inaudible Voice Commands." ACM CCS 2017. [doi:10.1145/3133956.3134052](https://dl.acm.org/doi/10.1145/3133956.3134052)*

- *Tavish Vaidya, Yuankai Zhang, Micah Sherr, and Clay Shields. "Cocaine Noodles: Exploiting the Gap between Human and Machine Speech Recognition." USENIX WOOT 2015.*

- *Nirupam Roy, Sheng Shen, Haitham Hassanieh, and Romit Roy Choudhury. "Inaudible Voice Commands: The Long-Range Attack and Defense." USENIX NSDI 2018. [Paper](https://www.usenix.org/conference/nsdi18/presentation/roy)*

- *Divyanshu Kumar et al. "Beyond Text: Multimodal Jailbreaking of Vision-Language and Audio Models through Perceptually Simple Transformations." [arXiv:2510.20223](https://arxiv.org/abs/2510.20223) (2025) — documents audio-domain safety failures in GPT-4o-Audio and Gemini 2.5.*
