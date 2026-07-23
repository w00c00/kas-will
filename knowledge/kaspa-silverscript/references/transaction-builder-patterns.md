# Transaction builder patterns from Argent Playground

## Reviewed snapshot and boundary

- Playground: <https://github.com/michaelsutton/argent-playground>
- Reviewed commit: `66aeadcbace83d9a2376cca96c1fea142df74e7f`
- Argent commit used for the local build check:
  `ec80ea27ce9679224d09bb4b807413791db5e77e`
- Reviewed date: 2026-07-22
- The selected examples compiled successfully with Rust 1.95.0.

Argent `.ag` is a protocol-oriented source language that produces SilverScript
and runtime artifacts. It is not accepted as `.sil` input by this Studio. The
reviewed Argent workspace pins the separate
`michaelsutton/silverscript@990ddb63b79a6098c65afaaf18a7703b17b6a271`.
Do not copy Argent syntax or version claims into contracts compiled against the
Studio's pinned official `kaspanet/silverscript` toolchain.

Primary examples:

- `basic_counter.rs`:
  <https://github.com/michaelsutton/argent-playground/blob/66aeadcbace83d9a2376cca96c1fea142df74e7f/src/bin/basic_counter.rs>
- `dex_asset.rs`:
  <https://github.com/michaelsutton/argent-playground/blob/66aeadcbace83d9a2376cca96c1fea142df74e7f/src/bin/dex_asset.rs>

## Reusable protocol patterns

1. Treat source, compiler artifact, transaction builder, transaction context,
   and final transaction as separate evidence-bearing stages.
2. Describe each transition with explicit input state, entrypoint and arguments,
   expected output state, covenant identity binding, and sompi value invariant.
3. Derive covenant IDs for genesis outputs from the actual transaction context;
   do not use human-selected IDs in production.
4. For multi-covenant transitions, define every actor role and require the exact
   co-spent covenant, implementation/type handle, owner mode, and successor.
5. Preserve asset identity and quantity independently from the UTXO value.
   A matching script template or output position is not asset identity.
6. Make the builder reject wrong output order, missing continuations, duplicate
   aliases, wrong covenant IDs, value drift, and authorization substitutions
   before wallet signing.

## What the DEX demo proves and does not prove

The demo is useful for atomic composition: Core registration can genesis-create
Pair actors, swaps co-spend Pair and two asset actors, and reserve migration
requires a current registry proof plus asset ownership authorization.

It is deliberately incomplete as a production DEX. Its source excludes fees,
partial fills, change lots, slippage, and canonical KAS deposit/withdrawal. The
registry is bounded to four linear records, pricing is a fixed whole-lot ratio,
and demo keys/outpoints are deterministic fixtures. Never present it as an AMM,
production asset standard, or deployable mainnet DEX.

## Required AI output

For every generated SilverScript transition, produce a transaction plan with:

- entrypoint/policy and typed arguments;
- all input roles, states, covenant IDs, values, and authorizations;
- all output roles, successor states, covenant bindings, and values;
- cardinality and ordering constraints;
- asset/value conservation equations;
- at least one concrete adversarial transaction mutation that must fail.

Compile and test the resulting `.sil` source with the official pinned compiler.
The plan is a review artifact, not executable proof and not authorization.
