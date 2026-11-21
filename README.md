# Kas Will

**Kaspa 本地优先的链上遗产继承桌面应用 / A local-first Kaspa inheritance desktop app**

Kas Will 从 SilverScript Studio 的继承模块独立出来，内置本地加密钱包、固定版本 SilverScript 编译器、Kaspa 脚本引擎预检和可移植继承计划操作包。应用不依赖任何网站：只要能连接 Kaspa 节点，就可以创建钱包、编译契约、签到、跨设备导入继承计划、构建交易和广播。

Kas Will is a focused extraction of the inheritance workflow from SilverScript Studio. It bundles an encrypted local wallet, pinned SilverScript compiler, local Kaspa script-engine preflight, and portable will packages. No website is required: with access to a Kaspa node, it can create wallets, compile covenants, import a will on another device, check in, build transactions, and broadcast.

> 当前版本 `1.1.0` 开放 **主网实验功能与 TN10 切换**，新安装默认主网。**未经独立审计，不代表主网安全就绪**；请先验证备份、恢复与小额完整流程。它不替代法律遗嘱或律师意见。
>
> Version `1.1.0` enables **experimental mainnet and a TN10 switch**, defaulting to mainnet on new installations. **Not independently audited or certified mainnet-ready.** Verify backups, recovery and a complete small-value lifecycle first. Not a substitute for a legal will or legal advice.

## 核心功能 / Highlights

### 2026-11-21 协议适配 / Protocol compatibility update

新建 KAS 和 Final KCC20 计划使用官方 SilverScript **v1.0.0**；采用结构化 ABI、四字节入口标签、`this.ageDaa` 和 KCC-1 BLAKE3 模板哈希。旧四字段 TN10 资产与历史 KAS 计划保留原编译器和源码，不升级或改写已部署契约。**已按项目所有者明确要求开放主网实验功能，不应视为独立审计。**

New KAS and Final KCC20 wills use official SilverScript **v1.0.0**, structured ABI, four-byte dispatch tags, `this.ageDaa`, and KCC-1 BLAKE3 template hashes. Legacy four-field TN10 tokens and historical KAS wills retain their original source and compiler. Deployed contracts are never silently rewritten. **Experimental mainnet was enabled at the project owner’s explicit request; this is not an independent security audit.**

Final 状态固定为 `amount, owner, owner_scheme, borrow_scheme, borrow_guard, extension_commitment`。当前仅接受固定参考实现的六字段状态视图（参考源码 `27f8403fee55863125b044c73b2c9449d997a6ca`），不承诺支持所有发行方或 minter；继承托管禁止借贷，扩展承诺保持不变，支持 1–3 位继承人。描述符必须显式设置 `protocol: "kcc20-final"`，视图 `prefixLength: 34`、`suffixLength` 以当前完整程序计算，模板哈希为 `734850b0af0aeef49f009167bf9ddd238fd8c5cdbe214234f97181ac6f5cc498`。不得直接套用旧描述符。

Final state is `amount, owner, owner_scheme, borrow_scheme, borrow_guard, extension_commitment`. Only the pinned reference implementation's six-field state view is supported (source `27f8403fee55863125b044c73b2c9449d997a6ca`), not arbitrary issuers or minters. Inheritance custody disables borrowing, preserves the extension commitment and supports 1–3 heirs. Set `protocol: "kcc20-final"`, `prefixLength: 34`, derive `suffixLength` from the complete program, and use the state-view template hash above. Never reuse a legacy descriptor as Final.

支持节点原生 `getUtxosByCovenantIds` 分页查询（节点与 SDK 均须支持，节点启用 `--utxoindex --covenant-index`），不可用时回退到原有节点查询。不会要求网站在线。本地预检升级为固定的 Rusty Kaspa **2.1.0** 发布包，详细依赖由 Cargo.lock 校验。

Native paginated `getUtxosByCovenantIds` is capability-detected (requires both node and SDK support and node flags `--utxoindex --covenant-index`); existing direct-node queries remain fallbacks. Websites are not required. Local preflight uses pinned Rusty Kaspa **2.1.0** published crates, with dependency checksums in Cargo.lock.

- KAS 签到金库：支持 1–5 位继承人，固定比例合计 100%；单继承人可获得 100%。
- 拥有者签到：签名延续同一 Covenant ID，并重置链上 DAA 期限。
- 拥有者取回：由拥有者签名取回。
- 到期继承：期限成熟后，任何人可触发，但收款钱包与比例由契约固定。
- KCC20 全生命周期：转入继承计划、签到、拥有者原子取回、到期原子拆分。
- 每份继承计划单独导出的 `.ssinvite`：其它电脑导入时重新核对固定模板、编译器、程序哈希与部署身份，并按当前钱包自动识别建立人、继承人或其它触发者。历史模板版本（如单继承人支持之前部署的继承计划）按仓库内固定 SHA-256 的退役契约源码显式兼容，未知来源依旧拒绝导入。
- 计划名称：创建时可命名，仅用于本机列表和操作包显示，不改变链上规则。
- 简化的签到与提取页：建立人可签到或取回；其它钱包只能在到期后触发提取，资金仍严格发送到契约固定的继承地址。
- 部署结果弹窗会自动刷新 Kascov 收录状态并提供交易与 Covenant 链接；Kascov 不可用时不影响本地节点操作。
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
- Each will has its own `.ssinvite` export. Another installation reproduces the pinned template, compiler, program hash, and deployment identity before classifying the connected wallet as creator, inheritor, or another trigger. Historical template revisions (such as wills deployed before single-heir support) are accepted explicitly against retired contract sources pinned by SHA-256 in this repository; unknown sources are still rejected.
- Will names: optional at creation, used only for the local list and package display; they never change on-chain rules.
- The simplified Check in & claim page lets the creator check in or recover; every other wallet can only trigger mature distribution to the covenant-fixed inheritor addresses.
- Deployment dialogs automatically refresh Kascov indexing evidence and link to the transaction and Covenant; Kascov availability never gates local node operation.
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
4. `inherit` 只有在 `this.ageDaa >= inactivityPeriod` 后执行，按固定基点比例守恒分配全部余额。

1. Deploy a controller Covenant UTXO that fixes the owner, inheritors, shares, and inactivity period.
2. `checkIn` requires the owner signature and permits exactly one same-script, same-Covenant-ID continuation.
3. `recover` requires the owner signature and returns the balance minus the explicit fee.
4. `inherit` executes only when `this.ageDaa >= inactivityPeriod` and conserves the distributable balance across fixed basis-point shares.

注意：到期不会主动打币，也不会自动撤销拥有者权限。成熟后继承分配、拥有者取回（以及手工构造的拥有者签到）可能竞争同一 UTXO，以先被链接受者为准；界面隐藏到期续期按钮不是链上的永久禁令。

Maturity does not send funds automatically or revoke owner authority. Mature distribution, owner recovery and a manually constructed owner check-in can compete for the same UTXO; the first chain-accepted spend wins. Hiding renewal in the UI is not an on-chain expiry prohibition.

### 旧四字段 KCC20（TN10 实验）/ Legacy four-field KCC20 (TN10 experimental)

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

## 跨设备继承计划操作包 / Cross-device will packages

1. 在首页的每份继承计划卡片或“签到与提取”页导出该继承计划自己的 `.ssinvite`。
2. 通过可信渠道把文件交给需要签到、取回或到期触发提取的电脑。
3. 导入时 Kas Will 验证包承诺，并用固定 SilverScript 编译器重新编译确定性模板；源码、参数、程序哈希或部署身份不一致都会拒绝。
4. 导入后直接停留在“签到与提取”页。建立人钱包看到签到和取回；继承人或其它钱包只在成熟后看到提取。
5. 每次操作仍会展示 network、Covenant ID、outpoint、全部输入输出、手续费和签名状态，并经本地脚本引擎预检后才允许广播。

1. Export the will-specific `.ssinvite` from its overview card or the Check in & claim page.
2. Transfer it through a trusted channel to the computer that will check in, recover, or trigger mature distribution.
3. On import, Kas Will verifies the package commitment and recompiles the deterministic template with the pinned compiler. Any source, parameter, program-hash, or deployment-identity mismatch is rejected.
4. Import stays on the Check in & claim page. The creator wallet sees check-in and recovery; inheritors and other wallets see only mature distribution.
5. Each operation still exposes the network, Covenant ID, outpoint, all inputs and outputs, fee, and signature state, and must pass the bundled script engine before broadcast.

The file is transport, not proof of who sent it. Wallet identity and transaction authority are derived locally from the deterministic contract parameters and the connected wallet.

## SilverScript 编译器来源 / Compiler provenance

新建 KAS / Final KCC20 模板编译器固定到官方 `kaspanet/silverscript` v1.0.0 commit：

```text
3ed973335b59269293564805cc2c58a14595ec03
```

当前 macOS 本地二进制 SHA-256：

```text
0114a03d11bc6e0c1cc8b8731e3e7558fb0046cfab67616e6b4dcb1ecde3c2ec
```

兼容性档案保留 `023c7ee`、`14dce9a`、`6f9e078`、`cb34aa5` 和 legacy `2a3961c`，用于重现旧项目。旧四字段 Token 继续使用 `023c7ee`，新建 KAS / Final Token 使用 `stable-1.0.0`。破坏性变更检测覆盖 ageDaa、ABI/入口标签/哈希协议及旧语法；检测不能替代完整编译和对抗性交易测试。

Compatibility profiles retain `023c7ee`, `14dce9a`, `6f9e078`, `cb34aa5`, and legacy `2a3961c`. Legacy tokens keep `023c7ee`; new KAS / Final tokens use `stable-1.0.0`. Breaking-change checks cover ageDaa, ABI/dispatch/hash changes and legacy syntax. Detection never replaces full compilation and adversarial transaction testing.

## 本地运行 / Run locally

Requirements:

- Node.js 22 or newer
- Rust 1.95.0 and Cargo (tested compiler/engine toolchain; use the committed lockfiles)
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
ALLOW_MAINNET=true
MAINNET_MAX_DEPLOY_KAS=1
KAS_WILL_DATA_DIR=/custom/local/data/path
```

- Node discovery falls back to the configured Kaspa resolver when no custom TN10 RPC URL is set.
- `ENABLE_KASCOV_VERIFY` is off by default. Local preflight remains authoritative for app gating.
- `ALLOW_MAINNET=false` is the kill switch: it blocks mainnet signing and all broadcast entrypoints. Mainnet is enabled by default; explicit real-KAS confirmations remain mandatory.
- Wallet files and project records are local data. Back them up securely; never commit the data directory.

## 安全边界 / Security boundaries

- No mnemonic, private key, wallet password, payment secret, or API token is stored in a project, package, test fixture, skill, or documentation.
- Wallet mnemonics are encrypted at rest; passwords go only to the loopback service for the requested operation.
- New mnemonics are shown once. Record them offline.
- Mainnet is experimental and unaudited. Default deployment and ordinary transfer cap: 1 KAS (configurable with `MAINNET_MAX_DEPLOY_KAS`); this is not a limit on an imported vault’s balance or token holdings.
- KCC20 Final accepts only the pinned reference state-view implementation; legacy four-field non-minter TN10 tokens remain a separate path.
- A Covenant does not wake itself up. After maturity, someone must construct and submit the inheritance transaction.
- Deleting a local project does not revoke or spend its on-chain UTXO.
- Legal validity, tax, succession law, device loss, coercion, compromised heirs, and long-term node availability remain outside the covenant's guarantees.

## 验证 / Verification

```bash
npm run verify
```

The suite covers deterministic template compilation, compiler provenance, KAS renewal/recovery/mature distribution, KCC20 template binding, KCC20 funding through `sig[]`, atomic KCC20 mature distribution, real local script-engine execution, package signing, fee/mass checks, wallet encryption, wrong-network rejection, and stale-workspace cleanup.

2026-11-21 本地验证：70 项应用测试、60 项 Rust 引擎测试通过；Final 参考 Token 的入金、签名取回、1/3 继承人分配、数量守恒、篡改拒绝和过小 KAS 载体质量超限均已执行。Apple Silicon Mac 应用已编译；内置 Node 服务在隔离数据目录通过启动及模板 API 冒烟检查。未做 Windows/Linux 本次构建、真实链上广播或独立审计，未覆盖现有安装或迁移资产。主网地址的 KAS / Final KCC20 流程仅在本地 VM 执行，不是链上实测。

Local verification on 2026-11-21: 70 application tests and 60 Rust engine tests pass. Final reference-token funding, signed recovery, one/three-heir distribution, conservation, tampering rejection and insufficient KAS carrier mass are exercised. The Apple Silicon Mac app builds; its bundled Node service passes isolated startup/template API smoke checks. No Windows/Linux build, live-chain broadcast, independent audit, installed-app replacement or asset migration was performed in this update. Mainnet-address KAS and Final KCC20 transitions are exercised only in the local VM, not on the live chain.

协议来源 / Protocol sources: [SilverScript v1.0.0](https://github.com/kaspanet/silverscript/releases/tag/v1.0.0), [KCC standards snapshot](https://github.com/kaspanet/kccs/tree/1ed87aef59faff8354061aee30f734a3b8b2c3d2), [KCC20 reference snapshot](https://github.com/argent-lang/kcc20-reference/tree/27f8403fee55863125b044c73b2c9449d997a6ca). Exact integration pins are recorded in `config/protocol-baseline.json`.

## License

MIT
