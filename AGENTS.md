# Kaspa SilverScript Studio

- Use the `kaspa-silverscript` skill for contract, covenant, KCC20, builder, or deployment changes.
- Keep AI inference off chain. Never let model output authorize a transaction.
- Keep wallet seeds, private keys, signing material, and AI API keys out of source, tests, logs, and browser responses.
- Default to `testnet-10`. Mainnet must remain fail-closed unless explicitly enabled and independently reviewed.
- Pin the SilverScript compiler commit and executable SHA-256. AST parsing is not compilation.
- Review contract source together with the transaction builder and add adversarial tests.
- Keep Chinese and English UI copy in sync.
- Run `npm run verify` before release.
