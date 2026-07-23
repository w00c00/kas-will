---
name: kaspa-silverscript
description: Design, implement, compile, test, audit, and explain Kaspa SilverScript covenants, KCC20 integrations, transaction builders, game/escrow/AMM settlement, AI-agent wallets, and covenant SDKs. Use whenever a task mentions Kaspa SilverScript, .sil files, covenant opcodes such as OpCov or OpAuth, KCC20, the Kaspa Covenant Game Kit, on-chain automatic settlement, or the latest SilverScript behavior and security. Also use when reviewing Kaspa contracts whose correctness depends on covenant input/output identity.
---

# Kaspa SilverScript

Treat AI as an off-chain author, planner, auditor, or agent. Keep authorization,
asset identity, value conservation, timeouts, and settlement deterministic in
SilverScript.

## Start every task

1. Classify the task as explanation, design, implementation, audit, transaction
   construction, deployment, or upstream-version research.
2. Fix the relevant network, SilverScript compiler commit, contract commit, and
   KCC20 template/covenant ID before drawing security conclusions.
3. When the user says latest/current or deploy/mainnet, run
   `python3 scripts/check_upstream.py` and verify official sources. SilverScript
   is experimental; never rely on a remembered HEAD.
4. Inspect applicable repository `AGENTS.md` and local build instructions.
5. Never treat AST parsing as successful compilation. Compile with realistic
   constructor arguments and record the compiler commit and binary hash.

## Route references

- Read `references/official-baseline.md` for current upstream status, source
  links, terminology, and version policy.
- Read `references/covenant-semantics.md` before designing or reviewing state
  transitions, KCC20 routing, or cross-template calls.
- Read `references/security-checklist.md` for every audit, deployment review,
  escrow, AMM, vault, or transaction-builder change.
- Read `references/ai-and-games.md` for AI agents, games, subjective results,
  automatic settlement, or wallet policy designs.
- Read `references/transaction-builder-patterns.md` before generating or
  auditing artifact-driven transaction plans or multi-covenant compositions.
- Read `references/personal-context.md` when working on the user's SDK, snooker
  demo, release materials, network switching, or bilingual site.

## Implement and verify

1. Prefer covenant declaration policies over handwritten wrapper boilerplate,
   while reviewing the compiler-generated binding semantics.
2. Bind every security-sensitive caller-supplied input/output index to the
   intended auth/covenant context or verify its covenant ID explicitly.
3. For `validateOutputStateWithTemplate`, separately bind the target output to
   the expected covenant/token ID. A matching P2SH template is not asset identity.
4. Validate both state and sompi value for continuations and payouts.
5. Keep immutable economic and identity fields unchanged on every continuation.
6. Constrain amount signs, ranges, multiplication intermediates, output
   cardinality, ownership mode, minter flags, fee accounting, and termination.
7. Audit the transaction builder together with the contract. ABI correctness
   and output ordering are part of the protocol.
8. Add positive, boundary, and adversarial transaction tests. Include index
   substitution, wrong covenant ID with the same template, output aliasing,
   multi-contract fee reuse, final fill, cancel, timeout, and overflow cases.
9. Use tn10 for unproven code. Do not recommend real mainnet funds until the
   exact artifact and builder have passed tests and an independent review.

Run the lightweight static triage when useful:

```bash
python3 scripts/audit_silverscript.py path/to/contract.sil
```

Run a reproducible full compile when constructor arguments are available:

```bash
SILVERC=/path/to/pinned/silverc \
  scripts/compile_contract.sh contract.sil constructor-args.json artifact.json
```

Treat both scripts as helpers, not proofs of correctness.

## Audit reporting

Fix the reviewed repository commit and report findings in descending severity.
For each actionable finding include the violated invariant, exact code location,
feasible transaction path, asset impact, minimal fix, and regression test. State
which parts were compiled or executed and which remain reasoned-only. Do not call
a source review a formal audit.

## Knowledge maintenance

Use only official `kaspanet/silverscript`, `kaspanet/rusty-kaspa`, KIPs, and
official examples for language/runtime claims. When upstream HEAD differs from
`references/upstream.json`, review breaking changes and relevant docs, update the
references, then update the pinned snapshot. Never update the snapshot merely to
silence the stale warning.
