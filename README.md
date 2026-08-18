# Kas Will

**Kaspa 本地优先的链上遗产继承桌面应用 / A local-first Kaspa inheritance desktop app**

Kas Will 从 SilverScript Studio 的继承模块独立出来，内置本地加密钱包、固定版本 SilverScript 编译器、Kaspa 脚本引擎预检和可移植操作包。应用不依赖任何网站：只要能连接 Kaspa 节点，就可以创建钱包、编译契约、签到、构建交易、跨设备签名和广播。

Kas Will is a focused extraction of the inheritance workflow from SilverScript Studio. It bundles an encrypted local wallet, pinned SilverScript compiler, local Kaspa script-engine preflight, and portable operation packages. No website is required: with access to a Kaspa node, it can create wallets, compile covenants, check in, build transactions, collect signatures across devices, and broadcast.

> 当前版本 `0.1.0` 仅用于 **TN10 实验测试**。主网签名与广播默认关闭。它是技术工具，不替代法律遗嘱、律师意见、密钥备份或独立安全审计。
>
> Version `0.1.0` is **TN10 experimental software**. Mainnet signing and broadcast are disabled by default. It is a technical tool—not a substitute for a legal will, legal advice, key backups, or an independent audit.

## 核心功能 / Highlights

- KAS 签到金库：支持 1–5 位继承人，固定比例合计 100%；单继承人可获得 100%。
- 拥有者签到：签名延续同一 Covenant ID，并重置链上 DAA 期限。
- 拥有者取回：由拥有者签名取回。
- 到期继承：期限成熟后，任何人可触发，但收款钱包与比例由契约固定。
- KCC20 全生命周期：转入遗嘱、签到、拥有者原子取回、到期原子拆分。
- `.ssinvite` 操作包：在不同电脑上审查、签署并传给下一位参与者，不需要协调网站。
- 本地加密钱包：创建或导入助记词、复制地址、查询余额和断开连接；新助记词只显示一次。
- 中英文界面：按系统语言和时区自动选择，也可手动切换。
- 本地脚本引擎：签名或广播前在本机执行交易；Kascov 仅作为可选的辅助可视化验证。
- 节点设置：留空使用 Kaspa Resolver 自动发现，也可在界面保存并测试本地 `ws://` 或远程 `wss://` wRPC 节点。
- KCC20 名称：可按 Covenant ID 从 Kascov 读取名称和验证状态用于显示，但绝不作为资产身份或签名依据。

- KAS check-in vault for one to five inheritors with exact 100% shares, including a sole-inheritor path.
- Owner check-in continues the same Covenant ID and resets its on-chain DAA age.
- Owner recovery remains signature-gated.
- Mature distribution is permissionless to trigger, while recipients and shares remain covenant-bound.
- Full KCC20 lifecycle: fund, check in, atomically recover, and atomically split after maturity.
- Portable `.ssinvite` files support review and signing on separate computers without a coordination website.
- Encrypted local wallet with create/import, address copy, balance, and disconnect flows; a new mnemonic is shown once.
- Automatic Chinese/English selection from system locale and time zone, plus a manual switch.
- Bundled local Kaspa script execution before broadcast; Kascov remains optional visualization only.
- Node settings support automatic Resolver discovery or a saved and tested local/custom `ws://` or `wss://` wRPC endpoint.
- KCC20 names and validation status can be fetched from Kascov for display only; they never replace Covenant ID or template verification.

## 链上逻辑 / On-chain model

### KAS

1. 部署控制 Covenant UTXO，并固定拥有者、继承人、比例与未签到期限。
2. `checkIn` 要求拥有者签名，只允许一个同脚本、同 Covenant ID 的延续输出。
3. `recover` 要求拥有者签名，扣除明确手续费后取回余额。
4. `inherit` 只有在 `this.age >= inactivityPeriod` 后执行，按固定基点比例守恒分配全部余额。

1. Deploy a controller Covenant UTXO that fixes the owner, inheritors, shares, and inactivity period.
2. `checkIn` requires the owner signature and permits exactly one same-script, same-Covenant-ID continuation.
3. `recover` requires the owner signature and returns the balance minus the explicit fee.
4. `inherit` executes only when `this.age >= inactivityPeriod` and conserves the distributable balance across fixed basis-point shares.

### KCC20（TN10 实验）/ KCC20 (TN10 experimental)

KCC20 使用两个协同 Covenant：Kas Will 控制器位于输入 `0`，Token 位于输入 `1`。控制器固定 Token Covenant ID 和模板哈希，并用 `readInputStateWithTemplate` / `validateOutputStateWithInputTemplate` 验证外部 Token 状态。

- 入金：当前拥有者签署 KCC20 leader transition，把 `ownerIdentifier` 改为 Kas Will 控制器 Covenant ID。
- 取回：控制器和 Token 原子共同花费；拥有者签名，Token 状态恢复为拥有者公钥。
- 继承：成熟控制器和 Token 原子共同花费；Token 数量与 KAS value 按同一固定比例拆分。
- 永远拒绝 `isMinter = true` 的 UTXO。
- 状态布局固定为 `ownerIdentifier: byte[32]`、`identifierType: byte`、`amount: int`、`isMinter: bool`。

KCC20 uses two cooperating covenants: the Kas Will controller at input `0` and the token at input `1`. The controller commits to the token Covenant ID and template hash, then validates foreign state with `readInputStateWithTemplate` and `validateOutputStateWithInputTemplate`.

- Funding: the current owner signs a KCC20 leader transition that changes `ownerIdentifier` to the controller Covenant ID.
- Recovery: controller and token are co-spent atomically; the owner signs and the token returns to the owner's public key.
- Inheritance: the mature controller and token are co-spent atomically; token amount and KAS value are split by fixed shares.
- `isMinter = true` inputs are always rejected.
- The accepted state layout is exactly `ownerIdentifier: byte[32]`, `identifierType: byte`, `amount: int`, `isMinter: bool`.

操作界面需要当前 Token 的交易 ID、输出序号和 redeem program。程序会在本地验证 P2SH、Covenant ID、模板长度、模板哈希、状态编码、拥有者类型与数量。Token UTXO 必须携带足够 TKAS 支付大脚本的存储质量和手续费。

The operation screen requires the current token transaction ID, output index, and redeem program. Kas Will locally verifies P2SH, Covenant ID, template lengths, template hash, state encoding, ownership type, and amount. The token UTXO must carry enough TKAS for the large script's storage mass and fee.

## 多设备操作包 / Multi-device operation packages

1. 构建操作包并审查 network、Covenant ID、outpoint、全部输入输出、手续费、编译器来源和操作类型。
2. 下载 `.ssinvite`，通过可信渠道发给下一位签名者。
3. 对方在自己的 Kas Will 中导入；应用只为与本地钱包公钥匹配的空签名槽签名。
4. 每次签名后下载最新文件，不要并行签署旧副本。
5. 所有槽位完成后，本地脚本引擎执行完整交易；通过后才允许广播。

1. Review the package's network, Covenant IDs, outpoints, every input/output, fee, compiler provenance, and operation type.
2. Download the `.ssinvite` and send it through a trusted channel.
3. The next participant imports it on their own installation; only empty slots matching the local wallet public key can be signed.
4. Download the newest file after every signature. Do not sign stale copies in parallel.
5. Once every slot is complete, the bundled engine executes the full transaction before broadcast is enabled.

The package is transport, not authorization. Never trust its labels alone; Kas Will re-derives commitments from transaction data and redeem programs.

## SilverScript 编译器来源 / Compiler provenance

默认编译器固定到官方 `kaspanet/silverscript` commit：

```text
023c7eed6b85038c72233a62024c5476640445e3
```

当前 macOS 本地二进制 SHA-256：

```text
a3f384648424b067ecfbe76336e159410b5bf46ce7f8d4050ba3aa2577bb2fb1
```

兼容性档案保留 `14dce9a`、`6f9e078`、`cb34aa5` 和 legacy `2a3961c`，用于重现旧项目。新建遗嘱使用 `023c7ee`。破坏性变更检测覆盖动态 `.split()` 结果、固定长度强制转换、旧入口语法、旧消息签名名、outpoint 字段、名称遮蔽和循环边界。检测不能替代完整编译和对抗性交易测试。

Compatibility profiles retain `14dce9a`, `6f9e078`, `cb34aa5`, and legacy `2a3961c` for reproducibility; new wills use `023c7ee`. Breaking-change checks cover dynamic `.split()` results, fixed-length casts, legacy entry syntax, message-signature names, outpoint fields, declaration shadowing, loop bounds, and related changes. Detection never replaces full compilation and adversarial transaction testing.

## 本地运行 / Run locally

Requirements:

- Node.js 22 or newer
- Rust stable and Cargo (desktop builds and pinned compiler rebuilds)
- macOS: Xcode Command Line Tools
- Windows: Microsoft C++ Build Tools and WebView2 Runtime
- Linux: Tauri 2 system packages for your distribution (`webkit2gtk`, `libappindicator`, SSL, build tools)

```bash
npm install
npm run setup:silverc
npm run setup:kascov-preflight
npm run verify
npm run dev
```

Web UI: `http://127.0.0.1:4321`
Local API: `http://127.0.0.1:4320`

The API binds to loopback only. State-changing requests require a random local session token.

## 桌面端编译 / Desktop builds

```bash
npm install
npm run setup:silverc
npm run setup:kascov-preflight
npm run desktop:prepare
npm run desktop:build
```

Artifacts are written under `src-tauri/target/release/bundle/`.

SilverScript and the preflight engine are native executables. Build release artifacts on each target OS/architecture; do not copy a macOS binary into Windows or Linux packages.

## 配置 / Configuration

节点可直接在应用的“节点设置”页面配置并保存在本机。服务器部署也可复制 `.env.example` 使用环境变量。

Node endpoints can be configured and tested directly from the in-app Node settings page and are stored locally. Server deployments may also copy `.env.example` and use environment variables.

```text
KASPA_TN10_RPC_URL=ws://your-tn10-node:port
ENABLE_KASCOV_VERIFY=false
ALLOW_MAINNET=false
KAS_WILL_DATA_DIR=/custom/local/data/path
```

- Node discovery falls back to the configured Kaspa resolver when no custom TN10 RPC URL is set.
- `ENABLE_KASCOV_VERIFY` is off by default. Local preflight remains authoritative for app gating.
- `ALLOW_MAINNET` must remain false for this experimental release.
- Wallet files and project records are local data. Back them up securely; never commit the data directory.

## 安全边界 / Security boundaries

- No mnemonic, private key, wallet password, payment secret, or API token is stored in a project, package, test fixture, skill, or documentation.
- Wallet mnemonics are encrypted at rest; passwords go only to the loopback service for the requested operation.
- New mnemonics are shown once. Record them offline.
- Mainnet is fail-closed in this release.
- KCC20 accepts only descriptor-pinned, four-field, non-minter TN10 tokens.
- A Covenant does not wake itself up. After maturity, someone must construct and submit the inheritance transaction.
- Deleting a local project does not revoke or spend its on-chain UTXO.
- Legal validity, tax, succession law, device loss, coercion, compromised heirs, and long-term node availability remain outside the covenant's guarantees.

## 验证 / Verification

```bash
npm run verify
```

The suite covers deterministic template compilation, compiler provenance, KAS renewal/recovery/mature distribution, KCC20 template binding, KCC20 funding through `sig[]`, atomic KCC20 mature distribution, real local script-engine execution, package signing, fee/mass checks, wallet encryption, wrong-network rejection, and stale-workspace cleanup.

## License

MIT
