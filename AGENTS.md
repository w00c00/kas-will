# Kas Will contributor guidance

- The owner explicitly approved enabling experimental mainnet on 2026-11-21. Preserve the TN10 switch, strict network isolation, real-KAS confirmations and ALLOW_MAINNET=false kill switch. This approval is not an independent audit: never describe this release as audited or mainnet-ready.
- Pin every SilverScript build to an exact official `kaspanet/silverscript` commit and binary SHA-256.
- Fully compile every contract with realistic arguments and run the bundled Kaspa script engine before describing a transition as valid.
- Review active input position, Covenant ID counts, continuation bindings, value conservation, fee bounds, replay, reordered inputs/outputs, state substitution, and immutable-field mutation.
- KCC20 paths must verify the exact Covenant ID, P2SH program, template hash, state layout, non-minter status, owner identifier type, token conservation, and KAS value conservation.
- Never store wallet seeds, private keys, passwords, signing material, or access tokens in source, tests, fixtures, documentation, skills, or memories.
- The app must continue with websites unavailable. Kascov may be optional evidence or visualization, never a required signing or settlement dependency.
- Preserve bilingual Chinese/English UI and documentation for user-facing changes.
