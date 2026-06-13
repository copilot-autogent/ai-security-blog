---
title: "Adaptive Red Teaming via GRPO: When the Attacker and Defender Train Together"
description: "AdvGRPO introduces a co-training framework where attacker and defender language models evolve together, producing attacks that are both highly effective and transferable — and defenders that outperform safety baselines."
pubDate: 2026-06-13
tags: ["red-teaming", "adversarial-training", "reinforcement-learning", "ai-safety", "attack-defense"]
---

Static red-teaming has a structural problem: you're testing today's model against yesterday's attack library. By the time the attack set is curated, reviewed, and applied, the model has moved on — fine-tuned, patched, or deployed in a different context. The attacks become stale.

**AdvGRPO** ([arXiv:2606.09701](https://arxiv.org/abs/2606.09701)) takes a different approach: instead of testing a fixed defender against a fixed attack set, it **co-trains the attacker and defender together**, letting each force the other to improve. The result is a red-teaming framework that doesn't go stale — it adapts.

## The Core Idea: Co-Evolution as a Training Signal

The fundamental insight is simple: the best way to make a defender robust is to give it an attacker that's trying as hard as it can. And the best way to train an effective attacker is to have it face a defender that's actively trying to block it.

This is **adversarial co-training**. In AdvGRPO, attacker and defender models are updated in alternation — unlike GAN training where generator and discriminator are updated simultaneously, here each role gets dedicated update steps before the other responds. The attacker gets better at breaking the defender, and the defender learns to handle increasingly sophisticated attacks. Neither converges to a static strategy.

The practical implication: **attacks generated this way can transfer**. An attacker that can defeat a co-trained defender has learned generalizable capabilities — not just exploitation of one model's specific quirks. The paper shows these attacks can transfer to independently trained models.

## Why GRPO — and Why It Was Hard

GRPO (Group Relative Policy Optimization) is a reinforcement learning algorithm that's recently gained traction for training language models. Compared to PPO, it avoids the value network overhead by computing advantages relative to a group of generated samples rather than an external critic.

Prior work on attacker-defender co-training used PPO and DPO successfully, but **explicitly reported that GRPO was unstable** in this setting. The paper identifies why: standard GRPO advantage normalization collapses in adversarial settings where reward signals have high variance and asymmetric structure.

AdvGRPO fixes this with two changes:

1. **Dense multi-channel rewards**: Instead of a single sparse reward (did the attack succeed or fail?), the framework provides rewards across multiple channels, giving the optimizer richer gradient signal throughout training. The abstract names this design choice but does not enumerate the specific channels.

2. **Decoupled advantage normalization**: Standard GRPO normalizes advantages across all samples in a batch. In adversarial co-training, this creates instability because attacker and defender samples have fundamentally different reward distributions. AdvGRPO computes normalization separately for each role, stabilizing training without losing the efficiency advantage of GRPO.

These two changes are the technical contribution that makes GRPO viable where it previously failed.

## The Training Curriculum

The framework doesn't start with full co-training immediately — it uses a structured curriculum:

**Phase 1: Single-turn attacks.** The attacker learns to generate effective adversarial prompts in a single turn. This establishes baseline capability and avoids the exploration problem that plagues cold-start RL for multi-step tasks.

**Phase 2: Closed-loop multi-turn attacks.** The attacker extends to multi-turn conversations, learning to maintain adversarial pressure across dialogue. The curriculum progresses from the simpler single-turn setting before introducing the complexity of extended interactions.

**Phase 3: Bootstrap co-training.** With a competent attacker established, co-training begins. Attacker and defender models are updated in alternation, each using the other's current checkpoint as its training environment.

This curriculum matters. Jumping directly to co-training with random initializations leads to degenerate equilibria — the attacker fails to explore the attack space, and the defender doesn't encounter meaningful pressure. The curriculum ensures each phase enters with a competent player.

## Results: What "Effective and Transferable" Actually Means

The paper demonstrates two claims:

**Effective attacks**: AdvGRPO can produce highly effective adversarial attacks. The paper shows this against safety benchmarks, though specific benchmark comparisons are in the full paper rather than the abstract.

**Transferable attacks**: Critically, attacks trained against the co-training defender can transfer to independently trained models. This is the real test — an attack that only works on one specific model checkpoint isn't useful for systematic security evaluation. Transferability means the attacker has learned something about the vulnerability class, not just overfitted to one model's idiosyncrasies.

**Better defenders**: Co-trained defenders outperform baselines on safety benchmarks. Facing adaptive attacks during training appears to produce more robust safety behaviors than the comparison conditions.

## How This Changes Red-Teaming Practice

Static red-teaming has a workflow problem: human red-teamers spend most of their time on attacks that don't work, because the attack space is large and unguided exploration is slow. Automated red-teaming with fixed attack libraries helps, but degrades as models are updated.

AdvGRPO points toward a different evaluation approach:

**Before**: Run model against fixed attack set. Count failures. If failure rate is low enough, declare safe.

**After**: Train an adaptive attacker against the target model. The paper suggests that models that prove harder to break through co-training are genuinely more robust — a qualitatively different signal than static benchmark pass rates. (This extrapolates from the paper's results; the authors don't explicitly define an "adaptive attack resistance" metric.)

### What This Means for Practitioners

For teams running safety evaluations:

1. **Static red-teaming may understate risk.** A model that passes a fixed benchmark may be more vulnerable to an adaptive attacker. AdvGRPO provides a methodology for the more rigorous test.

2. **Co-trained defenders may be harder to evaluate with static benchmarks.** A model that learned to handle adaptive attacks during training may have internalized strategies that don't map cleanly onto the categories in static test sets. New benchmarks may be needed.

3. **Transfer rate matters.** When evaluating attack methodology, don't ask "does this work on the training model?" Ask "does this work on models the attacker has never seen?" AdvGRPO's transferability results suggest its trained attackers clear this bar.

4. **The curriculum structure is reusable.** Even outside GRPO, the single-turn → multi-turn → co-training curriculum is a sensible progression for any RL-based red-teaming setup. Phase 1 establishes baseline attack capability; Phase 2 extends to realistic multi-turn threat models; Phase 3 applies the adaptive pressure.

## The Deeper Pattern: Adversarial Training as Safety Infrastructure

AdvGRPO fits into a larger trend: the field is moving from **evaluation** to **training** as the primary mechanism for AI safety.

Early safety work assumed you could train a model to be safe using positive examples, then evaluate it against adversarial inputs post-hoc. The assumption was that safety is primarily about what the model learned, not about what attackers do afterward.

Adversarial co-training rejects this assumption. Safety isn't a fixed property of a model — it's a relationship between the model and the attacker population it faces. A model that's safe against today's attackers may not be safe against tomorrow's adaptive ones.

The implication: **safety evaluation needs an adversary model, not just an attack set.** The adversary model should itself be trained and updated as the defender improves. AdvGRPO provides one viable implementation of that idea.

The practical challenge is integration: automated red-teaming is computationally expensive, and few deployment pipelines have hooks for running RL-based attack training against a production model. But the methodology is now reproducible — and the gap between research implementation and deployable tooling is closing.

---

*Paper: [Learning to Attack and Defend: Adaptive Red Teaming of Language Models via GRPO](https://arxiv.org/abs/2606.09701) — arXiv:2606.09701 (June 2026)*
