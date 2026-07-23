# AI, agents, and games

## Trust boundary

Keep AI inference off chain. AI may propose code, moves, prices, routes, or
transactions, but SilverScript must enforce deterministic limits and settlement.
Never let an AI verdict alone transfer escrowed funds.

## Recommended architecture

1. The user or agent states an intent.
2. AI produces a structured action or transaction plan.
3. A deterministic simulator/validator checks the action.
4. A SilverScript covenant enforces asset, value, permission, deadline, and
   settlement invariants.
5. A constrained signer signs only if local policy and simulation pass.
6. An indexer monitors confirmations and feeds verified state back to the agent.

## AI covenant copilot

Generate a protocol specification before generating `.sil` code. Include state
fields, transition table, invariants, trust assumptions, timeouts, termination,
and output identities. Compile in a pinned toolchain, generate transaction
builders, then generate adversarial cases. AI-generated code must never be
deployed directly without deterministic checks and human review.

## Agent wallet/vault

Enforce on chain or in a constrained signer:

- per-transaction and daily spend limits;
- covenant/token allowlists;
- minimum received amount and maximum slippage;
- expiry, cooldown, emergency pause, and human co-sign thresholds;
- restricted fee and change outputs;
- revocable session authorization instead of exposing a master seed.

## Games

Turn-based deterministic games are the cleanest first product: AI selects a move
and the covenant verifies it. The official SilverScript repository includes a
multi-contract chess example suitable for an AI Agent Arena prototype.

For real-time physics games such as snooker:

- run AI and physics off chain with a versioned deterministic engine;
- commit shot inputs and before/after state roots;
- use player signatures, deadlines, resignation, and challenge rules;
- keep wager custody and payout conditions in the covenant;
- use AI vision only as evidence or assistance, never as the sole fund arbiter;
- disclose any arbiter/validator trust and provide timeout/refund escape paths.

Subjective AI work such as image or prose quality needs bonded evaluators,
optimistic challenges, or mutually agreed arbitration. A result hash proves
commitment to bytes, not quality or truthful inference.
