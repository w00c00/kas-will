# Covenant and KCC20 semantics

## Declaration wrappers

`#[covenant(...)]` declares a policy and lets the compiler generate transaction
context wrappers.

- `binding = auth` binds a singleton input through auth-context opcodes.
- `binding = cov` gathers inputs/outputs sharing a covenant ID through `OpCov*`.
- Verification mode receives proposed new state and validates exact output
  cardinality plus each continuation state.
- Transition mode computes returned state; singleton termination requires
  `termination = allowed` and a zero-or-one state array.
- Extra policy call arguments are not automatically committed to transaction
  structure. Bind indexes, identifiers, amounts, and routes explicitly.

For `binding = cov`, generated wrappers discover the active covenant ID with
`OpInputCovenantId`, enumerate states with `OpCovInputIdx`, and validate actual
continuations at `OpCovOutputIdx`. This does not prove that a separate integer
argument supplied by the caller equals one of those indexes.

## Cross-template routing

`validateOutputStateWithTemplate(outputIndex, state, prefix, suffix, hash)`:

1. validates the supplied template against the expected template hash;
2. encodes the provided state using its static layout;
3. rebuilds the foreign redeem script;
4. checks the output P2SH `scriptPubKey`.

It does not by itself prove the output covenant ID. For a KCC20 route, also use
one of these patterns:

```silverscript
int out_idx = OpCovOutputIdx(expected_token_id, ordinal);
validateOutputStateWithTemplate(out_idx, nextToken, prefix, suffix, templateHash);
```

or:

```silverscript
require(OpOutputCovenantId(out_idx) == expected_token_id);
validateOutputStateWithTemplate(out_idx, nextToken, prefix, suffix, templateHash);
```

The template hash must come from trusted protocol state or a committed route,
not an untrusted caller.

## KCC20 ownership model in the official example

- `0x00`: pubkey ownership; spending requires the matching signature.
- `0x01`: script-hash ownership; spending requires a matching P2SH witness input.
- `0x02`: covenant-ID ownership; spending requires a witness input whose
  covenant ID equals `ownerIdentifier`.

Non-minter transitions conserve total input/output token amount and must not
create minter outputs. A protocol-owned KCC20 vault should normally preserve its
owner covenant ID, ownership type, and minter flag explicitly.

## Index and value pattern

For a singleton covenant continuation:

```silverscript
byte[32] myCovId = OpInputCovenantId(this.activeInputIndex);
int continuation = OpCovOutputIdx(myCovId, 0);
require(callerIndex == continuation);
require(tx.outputs[continuation].value == expectedValue);
```

Validate script/state identity and sompi value separately. A correct state at a
zero-value continuation, or a correct value at an unrelated output, is not a
correct transition.
