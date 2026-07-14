---
title: "Voice AI Security: Adversarial Audio, Ultrasonic Injection, and Attacks on Speech-Enabled AI Agents"
description: "Voice-enabled AI agents inherit a distinct attack surface that text-focused security misses entirely. Adversarial audio perturbations fool ASR pipelines invisibly, ultrasonic commands exploit microphone analog front-ends, and voice authentication breaks when attackers control TTS. Here's the threat model practitioners need."
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
- **Microphone analog front-end**: Microphone amplifier and ADC components can demodulate certain ultrasonic signals into the audible range — not a software bug, but a hardware physics property that creates an attack vector.
- **ASR model**: Adversarial noise additions to audio can cause the speech-to-text layer to transcribe entirely different text, while the original audio sounds unchanged to a human listener.
- **LLM downstream**: If the transcribed text is trusted as authentic user input, any attacker who can control what the ASR produces can inject arbitrary instructions into the LLM layer.

Compare this to a text-only system: there's no physical channel, no hardware physics to exploit, and no ASR stage where an imperceptible perturbation can redirect transcription. Voice systems carry vulnerabilities that simply don't exist in the text domain.

## Attack 1: Adversarial Audio Perturbations

The most technically rigorous attack on voice AI pipelines adapts adversarial example techniques to the audio domain. The foundational result comes from Carlini and Wagner (2018), who demonstrated 100% targeted attack success against the DeepSpeech ASR system in a white-box, direct-waveform setting — feeding adversarial audio directly to the model rather than playing it over a speaker.

The technique is conceptually similar to image adversarial examples (small, imperceptible modifications that cause misclassification), but the audio domain introduces specific challenges:

- Audio is a time-series signal with temporal structure; perturbations must preserve perceptual quality across the entire waveform, not just individual frames.
- The human auditory system has complex masking properties — certain frequencies are imperceptible when played alongside other audio — which adversarial audio exploits to hide perturbations.
- ASR models operate on features computed from the waveform (MFCCs, spectrograms) rather than raw samples, so perturbations must survive the feature extraction step.

Carlini and Wagner used gradient-based optimization to find audio perturbations that cause DeepSpeech to transcribe a target phrase of the attacker's choosing, subject to the constraint that the perturbation is below a perceptual threshold. Their result: targeted audio files can be made to transcribe as any chosen phrase while remaining near-indistinguishable to a human listener, within the digital domain.

**Important scope note**: The C&W attack was evaluated in a direct (digital-waveform) threat model. Physical over-the-air variants — where adversarial audio is played through a speaker and captured by a microphone — are significantly harder, because codec compression, speaker distortion, and room acoustics all degrade the adversarial perturbation. Robust over-the-air adversarial audio is an active research area (CommanderSong, Qin et al. 2019, Yakura & Sakuma 2018) but requires substantially more effort than the digital attack and often assumes white-box access to the target ASR. The C&W result establishes the fundamental feasibility of audio adversarial attacks; robust physical deployment against deployed systems remains a harder, less-fully-characterized problem.

### Implications for ASR-Fronted AI Agents

For a voice AI agent that trusts ASR output as representing the user's intent, audio adversarial attacks represent an instruction injection primitive at the audio layer. Attackers who can control the audio input — either digitally (injecting adversarial audio into a recording or streaming pipeline) or physically via robust over-the-air techniques — can redirect ASR transcription to attacker-chosen text, bypassing any defense that operates on the transcribed output.

The practical threat scenarios include:

- **Digital pipeline injection**: Audio files sent as voice messages, or injected into a streaming audio pipeline, can carry adversarial perturbations without requiring over-the-air transmission.
- **Robust over-the-air injection**: More recent work has demonstrated perturbations that survive speaker-microphone transmission, though these require white-box access to the target ASR model and careful calibration for the physical environment.

Text-input filtering doesn't see this attack. It operates upstream of any text-layer defense.

## Attack 2: DolphinAttack — Ultrasonic Voice Commands

The DolphinAttack, published by Zhang et al. at ACM CCS 2017, exploits a physical property of microphone hardware: **nonlinearities in the analog front-end (amplifier and ADC circuitry) demodulate ultrasonic signals into the audible range**.

The mechanism works as follows:

1. The attacker modulates a voice command onto a carrier signal above 20 kHz — above the threshold of human hearing.
2. The microphone's analog amplifier (LNA) and analog-to-digital converter are not perfectly linear at ultrasonic frequencies; their nonlinear response demodulates the carrier and produces a baseband signal in the audible range.
3. The demodulated signal is processed by the device's voice activation and ASR systems, which "hear" it as an audible command.
4. The human in the room hears nothing. The device acts on the command.

This is not a software vulnerability. It's a consequence of analog component physics in widely deployed microphone hardware. Zhang et al. tested the attack against **sixteen different smart devices** including iPhone, Apple Watch, MacBook, Amazon Echo, Samsung Galaxy, Google Nexus, and Audi Q3 (in-car voice control) — all were vulnerable.

The attack range is limited (meters, not kilometers), but the physical constraints can be worked around:

- Directional speakers can extend range and focus the signal.
- Roy et al. (2018) demonstrated a long-range variant using parametric arrays — transducer arrays that can focus ultrasonic beams over longer distances, achieving command injection from across a room or through physical barriers.
- The carrier frequency and modulation scheme can be adapted to exploit specific hardware nonlinearity profiles, making hardware-level mitigation non-trivial.

### Commands That Can Be Injected

The DolphinAttack paper demonstrated a range of commands including: "Hey Siri, FaceTime [attacker number]", "OK Google, turn on airplane mode", "Alexa, open the backdoor [on a connected home system]", and navigation instructions in a vehicle's voice interface. The attack is general: any command the device would accept from a human user can be injected ultrasonically.

For modern LLM-backed voice agents, the injection surface is substantially larger than for command-based smart speakers. A voice agent that can browse the web, send emails, make calls, or execute code is a much higher-value target for ultrasonic command injection.

## Attack 3: Hidden Voice Commands in Ambient Audio

A third attack class exploits the gap between human speech perception and machine speech recognition: embedding voice commands in music, ambient sound, or public address broadcasts.

Vaidya et al. (2015) — in a paper titled "Cocaine Noodles" — identified an early version of this attack: speech processed through certain transformations was unintelligible to humans but recognized as specific phrases by ASR systems. The paper established the principle that human speech perception and machine speech recognition have different acoustic sensitivity profiles, and that this gap can be exploited.

Subsequent work has refined this into practical attacks:

- Voice commands can be embedded in music such that humans hear only the music, while voice-activated devices activate and process the command.
- Commands can be overlaid on legitimate public address audio at low amplitude, invisible to human attendees but recognized by devices in the space.
- "Over-the-air" attacks play adversarial audio through speakers and rely on the device's microphone picking up the signal — a practical deployment of audio adversarial attacks that requires careful calibration.

The underlying mechanism exploits the fact that ASR systems have fundamentally different auditory sensitivity profiles than humans. A machine speech recognizer trained on large audio datasets has learned acoustic patterns that can be triggered by signals that don't correspond to how the phonetic content sounds to a human auditory system.

## Attack 4: Voice Authentication Bypass

Many phone-channel AI agents authenticate users via voiceprint verification: compare the caller's voice to an enrolled voiceprint, and grant access if the match score exceeds a threshold. This authentication mechanism breaks down when:

1. **TTS voice cloning**: High-quality text-to-speech models can now generate convincing voice reproductions from relatively short enrollment samples (seconds to minutes of audio). An attacker who has recorded a few minutes of the target's voice — from social media, voicemail greetings, public appearances — can generate audio that passes voiceprint authentication.

2. **Conversion attacks**: A voice conversion model transforms the attacker's own voice to match the target's voiceprint characteristics while preserving natural prosody and variation. This is harder to detect than fully synthetic speech because it contains natural human speech properties.

3. **Adversarial perturbations targeting the speaker verification model**: Rather than cloning the target voice, the attacker crafts audio that scores high on the voiceprint similarity metric, without necessarily sounding like the target. This is a white-box attack that requires knowing the speaker verification model's parameters, but black-box variants exist that transfer across models.

Voice authentication is particularly relevant for phone-based AI agents in banking, healthcare, and financial services — exactly the deployment contexts where high-stakes authorization decisions are made. A voice agent that grants account access or authorizes transactions via voiceprint authentication faces a threat model where authentication bypass has direct financial consequences.

## Attack 5: Cross-Modal Injection via the Phone Channel

The phone channel introduces a variant of injection attacks that doesn't require physical proximity. The scenario:

1. An attacker initiates or participates in a phone call with a system that uses an AI agent on the receiving end.
2. The attacker plays audio (via TTS or a recording) containing adversarial content — commands that the AI agent's ASR will transcribe as attacker-chosen instructions.
3. The AI agent processes the transcribed text as if it were a legitimate instruction from the caller.

This is prompt injection delivered via the telephone audio channel. The key property: the attacker controls what audio is injected into the phone call, and the AI agent trusts whatever its ASR produces as representing the caller's intent.

**Important constraint**: Traditional adversarial audio perturbations (of the C&W type) generally don't survive PSTN/VoIP codec compression and resampling. However, the phone channel threat doesn't require such perturbations. An attacker playing audio that contains **plaintext injected instructions** via TTS — spoken commands designed to be transcribed by the agent's ASR as instructions rather than user requests — does not need adversarial perturbations to succeed. The attack surface is the agent's failure to distinguish attacker-supplied audio content from legitimate user commands, not the perturbation technique.

For AI agents connected to tools — CRM systems, calendaring, databases, payment processing — an injected instruction that says "update customer record" or "schedule callback to [attacker number]" or "send transcript to [attacker email]" is indistinguishable from a legitimate caller making the same request, if the ASR transcription is trusted without context validation.

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

**Potentially harder to attack for ASR-targeted perturbations**: End-to-end audio models don't have a discrete ASR stage where adversarial perturbations optimized against a specific ASR model can redirect transcription. Transfer between architectures is not automatic.

**Documented safety alignment failures in the audio domain**: The multimodal jailbreak research ([arXiv:2510.20223](https://arxiv.org/abs/2510.20223)) demonstrates that simple audio perturbations (pitch shifts, echo, volume changes) can defeat safety alignment in end-to-end audio models at rates of 74–75% against models like GPT-4o-Audio and Gemini-2.5-Flash on high-stakes content categories. This is specifically a safety bypass result — it shows that safety behaviors trained on text don't generalize to the audio modality, so audio inputs can produce harmful outputs that equivalent text inputs would refuse.

**The open research question**: Whether adversarial audio can cause end-to-end audio models to treat attacker-injected content as trusted instructions (the instruction injection threat, distinct from safety bypass) is less established. The physics of ultrasonic injection still applies to any device with a microphone; how an end-to-end audio model would process demodulated ultrasonic content is an open question that the academic literature has not fully characterized.

The practical implication: organizations deploying GPT-4o Realtime or Gemini Live in high-stakes contexts should not assume that moving to an end-to-end architecture eliminates audio-domain attack risk. The safety alignment failure mode is documented; the instruction injection threat warrants scrutiny specific to the architecture being deployed.

## Defenses: What Actually Helps

### Audio Adversarial Detection

Adversarial audio perturbations can be detected by analyzing the audio signal for properties that are statistically unusual:

- **Spectral anomaly detection**: Adversarial perturbations have characteristic spectral signatures. A detection layer that looks for unusual energy distributions in frequency bands can flag audio that may have been crafted.
- **Psychoacoustic masking analysis**: Adversarial audio exploits hearing masking models. An analysis layer that identifies regions where significant energy is concentrated in perceptually masked frequencies can serve as a signal.
- **Multi-model transcription comparison**: Run the audio through multiple ASR systems. Adversarial audio crafted to target one model will often produce different transcriptions on a second model. Significant disagreement between two ASR systems on the same audio is a detection signal.

### Ultrasonic Filtering

Ultrasonic command injection must be addressed at the **hardware layer**. Because the demodulation occurs in the analog front-end before digitization, software-only approaches have fundamental limits:

- **Hardware low-pass filtering**: A hardware filter applied before or within the analog front-end, cutting frequencies above ~18 kHz before they reach the ADC, prevents the demodulation nonlinearity from producing audible signals. This is the most reliable mitigation. Some device manufacturers have begun implementing this in response to published research.
- **Software filtering limitation**: A software filter applied to the *digitized* microphone signal operates after analog-to-digital conversion — the point at which DolphinAttack's demodulation has already occurred. Software filtering can suppress any residual ultrasonic energy in the digital domain, but does not prevent the demodulated baseband signal from already appearing in the audio stream.
- **Hardware-layer frequency monitoring**: Systems with access to raw analog signal characteristics (prior to digitization) can instrument ultrasonic band energy as an intrusion detection signal. Standard software-only monitoring of the digitized signal will not reliably detect the ultrasonic carrier in most deployed stacks, since the carrier is demodulated — not preserved — by the analog front-end.

### Multi-Modal Confirmation for High-Stakes Commands

For voice agents authorized to take high-stakes actions (financial transactions, access authorization, sending sensitive information), requiring **confirmation through a second channel** before execution breaks the audio-only attack chain. An ultrasonic command that activates "transfer funds" can still be blocked if the system requires confirmation via a separate app notification, PIN entry, or text message acknowledgment.

This is the voice equivalent of multi-factor authentication: the attacker can inject via audio, but can't easily replicate confirmation on an uncompromised out-of-band channel.

### Voice Authentication Hardening

For systems using voiceprint authentication:

- **Challenge-response liveness detection**: Require the caller to respond to dynamic challenges (repeat a randomly generated phrase or answer a novel question). This raises the bar for replay attacks using static cloned audio, though note that real-time neural TTS systems can generate arbitrary speech on demand — challenge-response alone is not sufficient against an attacker using live voice synthesis.
- **Anti-spoofing classifiers**: Add a spoofing detection model that distinguishes synthesized speech from live speech, running in parallel with voiceprint matching. Current anti-spoofing classifiers have meaningful error rates against high-quality neural TTS, so this should be treated as a signal rather than a hard gate.
- **Behavioral biometrics**: Supplement voiceprint matching with call metadata — calling pattern analysis, device fingerprinting, behavioral history — so that voice alone is not the sole authentication signal.
- **Risk-based authentication**: Require stronger authentication for high-stakes actions (money movement, sensitive record access) than for low-stakes queries (account balance inquiries). No single voice authentication mechanism is currently robust against determined adversaries with high-quality TTS access; layering is necessary.

### Intent Verification at the LLM Layer

Even if adversarial audio bypasses ASR-level detection, the LLM can apply sanity checks before acting on transcribed instructions:

- **Context consistency**: Does the transcribed instruction make sense given the conversation history? An abrupt shift to "email my contact list to this address" mid-conversation is a red flag even if the ASR transcription looks clean.
- **Instruction boundary detection**: Treat unexpected imperatives in ASR output ("ignore previous instructions", "now do X", bare commands without conversational context) as injection signals requiring confirmation.
- **Confirmation for sensitive actions**: Require explicit verbal confirmation for any action that accesses sensitive data, executes external commands, or has irreversible effects — don't act on a single transcribed instruction for high-stakes operations.

### Physical Security Controls

For deployments where the physical attack surface matters (always-on voice assistants, open-office AI devices, vehicle voice systems):

- **Directional microphones**: Microphones with narrow pickup patterns are harder to attack with ultrasonic emitters that aren't in the device's line of reception.
- **Wake-word enrollment and strict matching**: Devices that require speaker-specific wake words rather than generic wake words limit who can activate the device.
- **Acoustic isolation**: Physical placement of voice-enabled devices away from public spaces reduces the attacker's ability to inject audio without being detected.

## Putting It Together: A Threat Model for Voice AI Deployments

Practitioners deploying voice-enabled AI agents should assess their threat model against each attack class:

| Attack | Attacker Capability Required | Detection Signal | Mitigation |
|---|---|---|---|
| Digital adversarial audio perturbations | Can inject audio into digital pipeline | Multi-ASR disagreement, spectral anomaly | Audio adversarial detection, intent verification |
| Robust over-the-air adversarial audio | White-box ASR access + physical proximity | Multi-ASR disagreement (less reliable) | Ensemble ASR, intent verification |
| Ultrasonic injection (DolphinAttack) | Physical proximity with ultrasonic emitter | Hardware-layer analog energy (not reliably visible to software) | Hardware low-pass filter (pre-ADC) |
| Hidden voice commands in music/ambient | Can play audio near device | Low-amplitude command signature | Multi-ASR, voice activity detection thresholds |
| Voice authentication bypass | TTS/voice cloning capability + target audio sample | Anti-spoofing classifier, behavioral anomaly | Anti-spoofing classifier + behavioral biometrics + out-of-band confirmation |
| Phone-channel instruction injection | Can call the AI agent and play TTS audio | Context inconsistency, instruction boundary detection | Intent verification at LLM layer, multi-turn confirmation for sensitive actions |

Attacks with peer-reviewed, widely replicated demonstrations against production consumer hardware — DolphinAttack (16 devices), Carlini & Wagner (DeepSpeech, digital domain), Vaidya et al. (ASR gap exploitation), and phone-channel injection via TTS — represent an established threat model. Robust over-the-air adversarial audio and instruction injection against end-to-end audio LLMs are active research areas where feasibility has been partially demonstrated but the full characterization is ongoing.

## The Bottom Line

Voice AI agents face a threat class that text-based AI security doesn't address: attacks delivered through the physics of sound. Adversarial audio perturbations operate below human perception while redirecting ASR transcription — with robust over-the-air variants extending feasibility to physical environments. Ultrasonic signals exploit microphone analog front-end nonlinearities to inject commands humans cannot hear. Voice cloning and adversarial voiceprint attacks break authentication assumptions in phone-channel deployments. End-to-end audio models face documented safety alignment failures in the audio domain.

The defenses exist — hardware low-pass filtering, anti-spoofing classifiers, multi-modal confirmation, intent verification at the LLM layer. But they require knowing that the threat model is fundamentally different from text-based AI systems. Organizations deploying voice AI without extending their security model to the audio modality are missing an attack surface that has been systematically documented for nearly a decade.

When your AI agent can be instructed by sounds it cannot hear, the attack surface extends beyond the keyboard.

---

**Key papers:**

- *Nicholas Carlini and David Wagner. "Audio Adversarial Examples: Targeted Attacks on Speech-to-Text." 1st Deep Learning and Security Workshop (DLS 2018), co-located with IEEE S&P 2018. [arXiv:1801.01944](https://arxiv.org/abs/1801.01944)*

- *Guoming Zhang, Chen Yan, Xiaoyu Ji, Tianchen Zhang, Taimin Zhang, and Wenyuan Xu. "DolphinAttack: Inaudible Voice Commands." ACM CCS 2017. [doi:10.1145/3133956.3134052](https://dl.acm.org/doi/10.1145/3133956.3134052)*

- *Tavish Vaidya, Yuankai Zhang, Micah Sherr, and Clay Shields. "Cocaine Noodles: Exploiting the Gap between Human and Machine Speech Recognition." USENIX WOOT 2015.*

- *Nirupam Roy, Sheng Shen, Haitham Hassanieh, and Romit Roy Choudhury. "Inaudible Voice Commands: The Long-Range Attack and Defense." USENIX NSDI 2018. [Paper](https://www.usenix.org/conference/nsdi18/presentation/roy)*

- *Divyanshu Kumar et al. "Beyond Text: Multimodal Jailbreaking of Vision-Language and Audio Models through Perceptually Simple Transformations." [arXiv:2510.20223](https://arxiv.org/abs/2510.20223) (2025) — documents audio-domain safety alignment failures in GPT-4o-Audio and Gemini-2.5-Flash.*
