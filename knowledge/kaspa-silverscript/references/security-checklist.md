# Security checklist

Use this checklist for contracts and the transaction builders that invoke them.

## Build and provenance

- Fix the target contract commit and network.
- Pin the exact SilverScript compiler commit and hash the compiler binary.
- Run full compilation with realistic constructor arguments; AST-only success is
  insufficient.
- Record template hashes, covenant IDs, constructor values, and compiled artifact
  hashes.
- Review compiler warnings and breaking changes.

## Transaction identity

- Bind active input assumptions to `this.activeInputIndex`.
- Bind continuation indexes to `OpAuthOutputIdx` or `OpCovOutputIdx` as intended.
- Bind foreign outputs to `OpOutputCovenantId` or derive them with
  `OpCovOutputIdx(expectedId, ordinal)`.
- Treat caller-provided indexes as hostile.
- Reject output aliasing: two logical obligations must not reuse one physical
  output unless the contract verifies an explicit aggregate.
- Check exact or bounded input/output cardinality.

## Assets and ownership

- Verify token covenant ID, not merely the P2SH template and encoded state.
- Verify owner identifier, ownership type, amount, and minter status.
- Check conservation in the actual token covenant context.
- Prevent same-template counterfeit tokens from satisfying an order.
- For covenant-owned assets, verify the authorizing witness covenant ID.

## Value and economics

- Check both continuation state and sompi value.
- Constrain amounts to positive ranges before arithmetic.
- Bound every multiplication and remainder-times-amount intermediate.
- Check rounding direction and demonstrate that implemented formulas match the
  documented economic model.
- Prevent one fee output from satisfying multiple independent fees; aggregate
  explicitly or make each obligation uniquely identifiable.
- Define donation/overpayment policy deliberately (`==` versus `>=`).

## State machine

- Preserve immutable identities, recipients, prices, template hashes, and policy
  parameters on every continuation.
- Make cancellation terminate, or fully validate any allowed replacement state.
- Define final-fill behavior without leaving unusable zero-balance state.
- Define timeouts, refunds, resignation, disconnect, replay, and duplicate-call
  behavior.
- Ensure irreversible transitions are documented and reachable only once.
- Provide a safe liquidity/asset exit path when users expect withdrawal.

## Adversarial transaction tests

- Substitute an arbitrary ordinary output for the continuation index.
- Substitute a different covenant ID with the same template/state layout.
- Reuse one buyer, seller, payout, or fee output across multiple contracts.
- Reorder inputs and outputs and combine the operation with an AMM or another
  escrow.
- Supply zero, negative, maximum, and overflow-adjacent amounts.
- Exercise partial fill, exact final fill, cancel before/after fill, and timeout.
- Try changing every supposedly immutable field.
- Test malicious ownership types and minter flags.
- Verify the SDK rejects malformed ABI and state arrays before signing.

## Reporting threshold

Do not label a contract mainnet-ready solely because it compiles or passes happy
paths. Require reproducible artifacts, adversarial transaction tests, builder
review, and independent review of the exact deployment candidate.
