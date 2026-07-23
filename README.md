# Kaspa SilverScript Studio

本地优先、支持中英文的跨平台 Kaspa SilverScript 契约工作台。用户可以从编译验证过的模板开始，也可以用自然语言生成候选规范、`.sil` 源码和逐入口交易构建计划，再使用固定版本的官方 `silverc` 完整编译。每笔交易由内置的 Kascov 同源 Kaspa 脚本引擎离线预检，并可直接连接用户自己的 Kaspa wRPC 节点完成余额、UTXO 查询和广播。Kascov 仍是首选可视化层，但不是运行依赖。

A local-first bilingual cross-platform Kaspa SilverScript workbench. Start from compile-verified templates or describe a protocol in plain language. Studio produces candidate specifications, `.sil` source and per-entrypoint transaction plans, performs a full build with a pinned official `silverc`, and preflights every transaction offline with the same Kaspa script-engine path used by Kascov. Balance, UTXO lookup and broadcast can use a self-hosted Kaspa wRPC node. Kascov remains the preferred visual layer, not a runtime dependency.

> SilverScript is experimental. The official repository currently recommends bytecode artifacts on `testnet-10` until a stable v1 release. Compilation and preflight are not an audit or a security guarantee.

## 功能 / Features

- 中英文界面和本地项目存储 / Chinese-English UI and local project storage
- OpenAI、Anthropic、Gemini、OpenRouter、Ollama 和 OpenAI-compatible 接口
- 应用内 AI 配置：API Key 由主密码通过 scrypt 派生密钥，以 AES-256-GCM 加密落盘；接口只返回配置状态，不回传 Key
- In-app AI setup: API keys are encrypted at rest with AES-256-GCM and a scrypt-derived vault key; APIs expose status only, never saved keys
- AI 输出协议状态机、不变量、威胁说明、`.sil` 源码和 transaction plans
- 单签金库、超时退款、三选二多签、哈希锁退款和多继承人签到金库五个模板；所有现实参数均完整编译验证 / Five fully compiled templates, including a multi-inheritor check-in vault
- 每个 transaction plan 描述输入、输出、covenant ID、状态、sompi、授权和攻击性变体
- 固定 `kaspanet/silverscript@2a3961cadc76bb16a425042172ffe32481da89b5`
- 继承模板支持 2–5 个继承人、拥有者签到续期、拥有者取回和到期固定份额分配 / 2–5 inheritors, owner check-in, recovery, and fixed-share mature distribution
- 内置模板具有领取、退款、三选二释放、哈希锁领取、签到和继承分配交易构建器 / Lifecycle builders for claim, refund, multisig spend, hashlock claim, check-in and inheritance
- 每个模板提供中英文用例示范；TN10 时间支持分钟、小时、天、周及一分钟快速测试 / Every template includes a bilingual walkthrough; TN10 durations support minutes, hours, days, weeks and a one-minute test
- 三选二多签支持 `.ssinvite` 邀请文件、复制、系统分享、异地顺序签名和回传导入 / Two-of-three multisig supports `.ssinvite` files, copy/share, remote sequential signing and returned-package import
- 支持可携带 Covenant 交易包，让多个本地客户端依次签名，也可审查其他网站生成的完整交易包 / Portable sequential signing packages and external-site package review
- 记录编译器 SHA-256、源码哈希、构造参数哈希和程序哈希
- TN10 和 mainnet 自有 wRPC 节点直连；留空时自动发现公共节点 / Direct self-hosted wRPC endpoints with public-node discovery fallback
- Tauri 2 的 macOS、Windows、Linux 桌面壳与自带本地运行时
- 内置钱包使用 AES-256-GCM + scrypt 加密助记词，并支持 BIP39 附加密码
- 内置钱包创建、导入、解锁、签名、断开；桌面版不显示无法加载的浏览器扩展入口
- 应用内钱包偏好：默认签名器、默认本地钱包、默认网络和 AI 保险库自动锁定
- 固定 Kascov 提交构建的本地预检引擎；Kascov 在线报告与索引为首选但完全可选 / Pinned local preflight engine with optional preferred Kascov reporting
- 主网默认关闭，并有环境开关、金额上限和确认短语三重保护

## 快速开始 / Quick start

要求 Node.js 22+、Rust/Cargo 和 Git。推荐先在 TN10 使用。

Requires Node.js 22+, Rust/Cargo, and Git. Start on TN10.

```bash
cp .env.example .env.local
npm install
npm run setup:silverc
npm run setup:kascov-preflight
npm run verify
npm start
```

打开 <http://127.0.0.1:4310>。如果需要前端热更新，使用 `npm run dev`。

Open <http://127.0.0.1:4310>. Use `npm run dev` for frontend hot reload.

桌面开发与当前平台安装包：

Desktop development and a bundle for the current platform:

```bash
npm run desktop:dev
npm run desktop:build
```

`desktop:build` 会将固定编译器、本地预检引擎、Node sidecar、Kaspa WASM、模板和知识库一起打包。Windows、macOS 和 Linux 应分别在对应系统执行构建，以得到该平台的原生二进制。发行包仍需按平台完成代码签名和公证。

`desktop:build` bundles the pinned compiler, local preflight engine, Node sidecar, Kaspa WASM, templates and knowledge base. Build on Windows, macOS and Linux respectively so each package contains native binaries. Public distribution still requires platform signing and notarization.

Portable external covenant signing is documented in [docs/portable-covenant-package.md](docs/portable-covenant-package.md). A covenant ID/hash alone is not a signing request; the exact transaction, UTXOs, redeem program, ABI, entrypoint, arguments, outputs and signature-slot keys are required.

For multisig, send the same latest `.ssinvite` package sequentially. Signer A imports, reviews and signs it, then sends the updated partial package to signer B. Never sign two independent copies: every participant should compare the displayed transaction commitment over a trusted secondary channel before signing.

`setup:silverc` 会检出固定官方提交并构建 `silverc`。`setup:kascov-preflight` 会检出 `Knitser/kascov@b64d6b4114df324f899783080371f26b619b19d0`，复用其纯计算 preflight 模块和固定的 `rusty-kaspa@98a4ccd8d200853787f227bd4536ac540cf34957`，生成当前平台原生预检程序及忽略提交的 `config/kascov-preflight.local.json`。二进制 SHA-256 在启动交易操作前强制核对。

`setup:silverc` builds the pinned official compiler. `setup:kascov-preflight` checks out `Knitser/kascov@b64d6b4114df324f899783080371f26b619b19d0`, reuses its pure preflight module and pinned `rusty-kaspa@98a4ccd8d200853787f227bd4536ac540cf34957`, and produces a native local engine plus the gitignored platform manifest `config/kascov-preflight.local.json`. Its SHA-256 is mandatory before transaction operations.

## AI 配置 / AI configuration

点击顶部齿轮，在“AI 配置”中选择提供商、模型和接口地址，输入 API Key，并设置至少 10 位的保险库主密码。首次保存会创建本机加密保险库；以后每次启动只需解锁一次，默认 15 分钟无使用后自动锁定。留空 API Key 会保留已保存值，界面和 API 永远不会读取回明文。

Open the gear menu, choose an AI provider, model and endpoint, enter the API key, and set a vault password of at least 10 characters. The first save creates the encrypted local vault. On later launches, unlock it once; it auto-locks after 15 idle minutes by default. A blank API-key field preserves the saved value, which is never returned to the UI or public API.

环境变量仍可用于无人值守开发或迁移，并作为保险库锁定时的后备配置：

Environment variables remain available for unattended development or migration and act as a fallback while the vault is locked:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-sol

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=

GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash

OPENROUTER_API_KEY=
OPENROUTER_MODEL=~openai/gpt-latest

OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3-coder
```

AI 结果始终是候选方案。Studio 不允许 AI 签名、选择钱包私钥或代替用户授权资金。

AI output is always a candidate. The model cannot sign, select wallet keys, or authorize funds.

钱包的创建、导入和连接也都在界面中完成。“钱包与网络”设置只保存钱包 ID、签名器和网络偏好；钱包密码、助记词和 BIP39 附加密码从不作为偏好保存。本地钱包每笔签名都要求重新输入密码。

Wallet creation, import and connection are also available in the UI. Wallet preferences store only a wallet ID, signer choice and network choice—never a wallet password, mnemonic or BIP39 passphrase. The local wallet requires password re-entry for every signature.

连接后的钱包中心显示完整地址和节点 RPC 余额，并提供复制地址、接收、两阶段发送预览、逐笔签名、本地签名后预检和可选 Kascov 交易链接。新钱包助记词通过独立的强制确认弹窗只显示一次。

After connection, Wallet Center shows the full address and node-RPC balance, with address copy, receive, two-stage transfer review, per-transaction authorization, signed local preflight and optional Kascov links. A new mnemonic appears once in a dedicated acknowledgement dialog.

本地客户端之间的托管房间、消息认证、异步共同签名和超时恢复方案见 [docs/escrow-client-co-signing.md](docs/escrow-client-co-signing.md)。

See [docs/escrow-client-co-signing.md](docs/escrow-client-co-signing.md) for authenticated room messaging, asynchronous co-signing and timeout recovery between local clients.

## 使用流程 / Workflow

1. 输入需求并选择 AI 接口 / Enter requirements and select a provider.
2. 审查状态机、不变量、信任假设和 transaction plans。
3. 采纳候选源码后人工检查 `.sil` 和构造参数。
4. 运行静态检查和固定编译器完整编译。
5. 创建或导入与目标网络一致的内置加密钱包。
6. 检查金额和完整交易；内置引擎的草案预检通过后在钱包确认。
7. Studio 校验钱包返回的交易没有改变，在本机执行每个签名输入，再直接向 Kaspa 节点广播。
8. Kascov 可用时追加其报告、transaction 与 covenant 页面；不可用时保留 txid，核心流程不受影响。

## 网络与主网 / Networks and mainnet

| Studio | Kaspa network ID | Address prefix | Kascov |
|---|---|---|---|
| `tn10` | `testnet-10` | `kaspatest:` | `testnet-10` |
| `mainnet` | `mainnet` | `kaspa:` | `mainnet` |

在“钱包与网络”中可分别填写 TN10 与 mainnet 的 `ws://`/`wss://` wRPC 地址。地址留空时才使用公共节点发现。余额、UTXO、链上 Covenant 定位和交易广播均走所选 Kaspa 节点，不依赖 REST explorer。

Configure TN10 and mainnet `ws://`/`wss://` wRPC URLs under Wallet & Network. Public-node discovery is used only when the field is blank. Balance, UTXO lookup, covenant lookup and broadcast all use the selected Kaspa node without a REST explorer.

主网默认 fail-closed。即使设置 `ALLOW_MAINNET=true`，还需要遵守 `MAINNET_MAX_DEPLOY_KAS`，并在 UI 输入 `DEPLOY REAL KAS`。未经完整编译、对抗性交易测试和独立审查，不应使用真实资金。

Mainnet is fail-closed. Even with `ALLOW_MAINNET=true`, the local amount cap applies and the UI requires `DEPLOY REAL KAS`. Do not use real funds before full compilation, adversarial transaction tests, and independent review.

## Argent 示例带来的改进 / Argent-derived design improvements

Studio 不编译 Argent `.ag`。`basic_counter` 和 `dex_asset` 只作为交易构建模式参考：源码 → artifact → builder → transaction context → final transaction。AI 因此必须为每个迁移单独给出 transaction plan，并把状态、covenant identity、UTXO value 和授权分开描述。

Studio does not compile Argent `.ag`. The `basic_counter` and `dex_asset` examples are used only as transaction-builder design references: source → artifact → builder → transaction context → final transaction. AI must therefore describe state, covenant identity, UTXO value, and authorization separately for every transition.

`dex_asset` 是组合式演示，不是生产 DEX：它没有手续费、部分成交、change lots、滑点或规范 KAS 充值/提现，且 registry 只有四个线性槽位。

`dex_asset` is a composition demo, not a production DEX: it omits fees, partial fills, change lots, slippage, and canonical KAS deposit/withdrawal, and its registry has only four linear slots.

## 安全边界 / Security boundaries

- 服务只监听 `127.0.0.1`；不要直接暴露到公网。
- 项目数据保存在权限为 `0700/0600` 的本地目录。
- AI API Key 位于独立加密保险库；保险库主密码不落盘，自动锁定后从运行时状态移除。
- AI 配置请求只允许本机来源和当前启动会话令牌；自定义接口必须使用 HTTPS，只有 loopback 地址可使用 HTTP，并拒绝 HTTP 重定向。
- 钱包密码、BIP39 附加密码和助记词不写入项目、日志或 AI 请求；新助记词只在创建时返回一次。
- 模板中的公钥、哈希和超时都是示例值，未逐项替换时后端拒绝构建上链草案。
- 修改源码会立即使旧 artifact 失效；后端也会再次核对源码哈希。
- 钱包签名后，交易承诺必须与已批准草案完全一致。
- 广播前，所有输入都必须有签名，并通过内置的固定版本真实 Kaspa 脚本引擎执行；本地引擎缺失或哈希不符时 fail closed。
- Kascov 只提供首选的第二份报告和可视化索引；超时、下线或网站消失都不会改变签名内容或阻断节点广播。
- 启发式静态检查、AI review、成功编译、本地 preflight 和 Kascov preflight 都不是正式审计。

## 验证 / Verification

```bash
npm run check
npm test
npm run build
```

当前测试覆盖 AI 包格式、AI 保险库加密与锁定、公开接口不泄露密钥、偏好设置白名单、transaction plan 本地保存、五个模板的固定编译器完整编译、静态检查结构、加密钱包落盘与签名、节点 RPC 网络隔离，以及 Kascov 完全离线时的真实签名脚本执行。实时 AI 调用需要用户自己的 API key；钱包签名和广播需要用户明确确认。

Tests cover AI package shape, encrypted and lockable AI settings, secret-free public APIs, allowlisted preferences, transaction-plan persistence, full pinned-compiler builds for all five templates, structured static analysis, encrypted wallet storage and signing, RPC network isolation, and real signed-input execution with Kascov completely offline. Live AI calls require the user's API key; wallet signing and broadcast require explicit user approval.

## License

Studio 使用 MIT License。本地预检二进制复用了 Kascov（MIT）与 rusty-kaspa（ISC）；发行包内包含对应的 `third_party` 许可文本。

Studio is MIT-licensed. The local preflight binary reuses Kascov (MIT) and rusty-kaspa (ISC); their license texts ship in the `third_party` directory.
