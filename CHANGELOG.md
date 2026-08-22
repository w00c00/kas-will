# Changelog / 更新日志

## 1.0.0 — 2026-08-22
- Owner recovery now runs as the same single guided flow as check-in (build → confirm with fee → wallet password → broadcast); previously it kept the three-step manual flow, which made a half-finished recovery look like "nothing happened". The mature distribution keeps its deliberate multi-step review.

- Fixed the lifecycle card flashing endlessly after a will matured (a mature schedule resolved to zero remaining seconds, re-arming a full refresh on every tick).
- The Chinese UI now says 资产继承计划 (asset inheritance plan) instead of 遗嘱 everywhere except the legal disclaimer, which still refers to a real legal will; the English UI keeps the neutral "will" and the Kas Will brand is unchanged.

## 1.0.0 — 2026-08-22（中文）
- 拥有者取回改为与签到相同的一键引导流程（构建 → 含手续费的确认 → 钱包密码 → 广播）；此前仍是三步手动流程，只点第一步会被误以为"没有生效"。到期继承分配保留分步审查。

- 修复继承计划到期后生命周期卡片持续闪烁的问题（到期状态的剩余秒数为 0，导致每次计时都重新触发整卡刷新）。
- 中文界面全面改称“资产继承计划”，不再使用“遗嘱”（法律声明中指真实遗嘱处保留原词）；英文界面保留中性的 "will"，Kas Will 品牌名不变。

## 0.3.0 — 2026-08-22

- Node operations are dramatically faster: the local service now keeps one warm wRPC connection per network (previously every request re-ran resolver discovery, which could take up to ~40 s) and pre-warms TN10 at startup. Connections idle out after three minutes and reconnect automatically after failures or node setting changes.
- Every long-running action (generate, deploy, operation build, sign, broadcast, transfers) now shows a live progress card with the current step, and mutating operations run one at a time — duplicate clicks while an operation is in flight are rejected instead of silently double-spending.
- Check-in (renewal) now polls the node after broadcasting and only reports success once the new cell is indexed and the schedule actually restarts, so the countdown reliably resets to the fresh period instead of showing a stale or missing value.
- The wallet page gains basic KAS send: build a transfer, review recipient/amount/fee and the local preflight verdict, then sign with the wallet password and broadcast; receive is the wallet's own address with one-click copy.
- Experimental KCC20 wallet support: register a token once by pasting the issuer descriptor plus the current redeem program (the template is then stored locally and every send verifies the current cell against the node's P2SH script hash), see per-wallet advisory balances from Kascov, and send KCC20 to any P2PK address with fees paid through a plain wallet UTXO. Partial sends leave a change cell owned by the sender.
- Operated (deployed) wills can now be deleted from the local list. Deletion goes through a strict two-step dialog: a fresh operation-package backup must be saved first, then the phrase `DELETE LOCAL WILL RECORD` must be typed. The local service independently rejects the delete request unless both the phrase and a backup commitment matching the current portable package are present. Deleting still removes only the local record; on-chain covenants and funds are never touched.
- Every operation-package export (will package and transaction package) now opens a native save dialog each time, so the save location is always chosen by hand and previous folders are never reused. In the browser build the export falls back to a normal download.
- The check-in & claim page countdown now shows days plus `HH:MM:SS` and ticks every second from the DAA-based maturity estimate; when the estimate reaches zero the lifecycle refreshes automatically.
- New Kaspa-style app icon (dark navy rounded square with a shard-gradient K) applied to every platform icon size and the web favicon; the render script is committed as `scripts/build-app-icon.py`.
- Fixed the progress card staying visible permanently (a CSS rule overrode the hidden state).
- Check-in renewals: after broadcasting, the app now waits up to five minutes for the node to index the new cell (with a visible "awaiting check-in confirmation" state and elapsed counter) and only then resets the countdown; a full server-side integration test covers the renewal chain, including stale imported records that keep tracking the live covenant cell.
- Renewal rejections are now explained bilingually: an expired will returns "已到期，不能再签到续期；到期后只能触发继承分配" instead of an English-only error, and common server errors (not-mature, already-spent, delete-backup, KCC20 cell/token) are localized in the Chinese UI.
- Portable packages now follow the covenant automatically: a record imported on another device accepts renewals and distribution spends of the currently live cell even when its stored outpoint lags behind, so a package is imported once and never needs a re-export after the owner renews. The operate page states this explicitly.
- The KCC20 will-creation form can now fill its descriptor fields from a token registered in the wallet page instead of pasting the issuer JSON every time.
- Check-in is now one guided click: the 签到续期 button builds, shows the fee, takes the wallet password, signs and broadcasts in a single flow, then waits for the node to confirm before resetting the countdown. Previously renewal required three separate manual steps (build, sign, broadcast), which made a half-finished renewal look like a stale countdown.

## 0.3.0 — 2026-08-22（中文）

- 节点操作大幅提速：本地服务现在按网络保持一条常驻 wRPC 连接（此前每个请求都重新走 Resolver 发现，最差可达约 40 秒），并在启动时预热 TN10。连接空闲 3 分钟自动关闭，故障或节点设置变更后自动重连。
- 所有耗时操作（生成、部署、构建操作、签名、广播、转账）都会显示带当前步骤的实时进度卡片，且同一时间只允许一个变更类操作——操作进行中的重复点击会被拒绝，不会再悄悄双花。
- 签到续权广播后会持续轮询节点，只有当新单元被索引、期限真正重置后才报告成功，倒计时会可靠地刷新为新期限，不再出现不更新或消失的情况。
- 钱包页新增 KAS 发送：先构建转账，核对收款人/金额/手续费与本地预检结论，再用钱包密码签名广播；收款即钱包地址，一键复制。
- 实验性 KCC20 钱包支持：粘贴发行方 descriptor 和一次当前 redeem program 即可登记代币（模板保存在本机，之后每次发送都会用节点 P2SH 脚本哈希验证当前单元），显示来自 Kascov 的按钱包参考余额，并可向任意 P2PK 地址发送 KCC20，手续费通过普通钱包 UTXO 支付；部分发送会留下一个属于发送者的找零单元。
- 操作过（已部署）的遗嘱现在可以从本机列表删除。删除必须通过严格的两步确认：先另存一份新的操作包备份，再输入短语 `DELETE LOCAL WILL RECORD`。本地服务会独立校验请求：短语和与当前便携操作包一致的备份 commitment 缺一不可。删除仍然只移除本机记录，链上 Covenant 与资产不受任何影响。
- 每次导出操作包（遗嘱操作包与交易包）都会弹出原生保存窗口，保存位置必须手动选择，绝不复用上次的目录；浏览器版本退回为普通下载。
- 签到与提取页的倒计时改为“X 天 HH:MM:SS”格式并按秒刷新，依据 DAA 到期估算；估算归零时自动刷新生命周期状态。
- 全新 Kaspa 风格应用图标（深蓝黑圆角方形 + 分面渐变 K 字），已应用到全部平台尺寸与网页 favicon；渲染脚本提交于 `scripts/build-app-icon.py`。
- 修复右上角进度卡片一直显示的问题（CSS 规则覆盖了 hidden 状态）。
- 签到续期：广播后最长等待 5 分钟直到节点索引新单元（显示"等待续签确认"状态和已等待秒数），确认后才重置倒计时；并新增覆盖续签全链路的服务端集成测试，包括陈旧导入记录自动跟单的场景。
- 续期被拒时会用中文说明原因：已到期的遗嘱会返回"已到期，不能再签到续期；到期后只能触发继承分配"，常见服务端错误（未到期、已支出、删除需备份、KCC20 单元/代币）在中文界面下全部本地化。
- 便携操作包现在自动跟随 Covenant：在其它设备导入的记录，即使本地记录的输出点落后，也接受花费当前活跃单元的续期与分配——操作包只需导入一次，建立人续期后无需重新导出。操作页面已明确说明。
- 创建 KCC20 遗嘱时可以直接从钱包页已登记的代币填充描述符参数，不必每次粘贴发行方 JSON。
- 签到续期改为一键引导流程：点击"签到续期"后自动完成构建、显示手续费、输入钱包密码、签名并广播，等待节点确认后才重置倒计时。此前续期需要手动完成三步（构建、签署、广播），只做完第一步会被误以为"续签了但倒计时不更新"。

## 0.2.0 — 2026-08-21

- Operation packages exported from wills created before the single-heir template change now import again: retired contract sources ship under `templates/*/history` pinned by SHA-256, inspection accepts exactly those revisions, and every other check (commitment, compiler profile, artifact hashes, pinned-compiler reproduction, on-chain Covenant UTXO) stays strict.
- Exports label their template revision and warn when a package needs a compatible client; imports show the matched revision.
- Wills can be named at creation for the local list and package display; names never change on-chain rules.

## 0.2.0 — 2026-08-21（中文）

- 单继承人模板变更之前创建的遗嘱，其操作包现在可以重新导入：退役契约源码随仓库 `templates/*/history` 发布并固定 SHA-256，导入端只接受这些显式修订；承诺校验、编译器档案、产物哈希、固定编译器复现与链上 Covenant UTXO 核验全部保持严格。
- 导出时标注模板版本，并在需要兼容客户端时给出双语提示；导入成功后显示匹配到的版本。
- 创建遗嘱时可命名，仅用于本机列表和操作包显示，不改变链上规则。

## 0.1.0 — 2026-08-18

- First standalone Kas Will desktop release for macOS, Windows, and Linux.
- Bilingual local-first inheritance workflow with an encrypted wallet, one to five fixed inheritors, owner check-in/recovery, and mature distribution.
- TN10 experimental KCC20 inheritance bound to a strict descriptor, Covenant ID, template hash, current token UTXO, and complete transaction layout.
- Optional Kascov token-name and validation-status lookup for display only; covenant identity never relies on a name.
- Automatic Kaspa Resolver discovery plus tested local/custom `ws://` and `wss://` wRPC node settings.
- Portable multi-device operation packages for offline review, signing, handoff, local script-engine preflight, and broadcast without a coordination website.
- Pinned official SilverScript compiler provenance at `023c7eed6b85038c72233a62024c5476640445e3`; experimental and TN10-only.

## 0.1.0 — 2026-08-18（中文）

- 首个独立 Kas Will 桌面版，提供 macOS、Windows 与 Linux 安装包。
- 中英双语、本地优先：内置加密钱包，支持 1–5 位固定继承人、拥有者签到/取回与到期分配。
- TN10 实验性 KCC20 继承严格绑定描述符、Covenant ID、模板哈希、当前 Token UTXO 与完整交易结构。
- 可选从 Kascov 查询代币名称和验证状态，仅用于显示；契约身份绝不依赖名称。
- 支持 Kaspa Resolver 自动发现，也可在界面测试并保存本地/自定义 `ws://`、`wss://` wRPC 节点。
- 可移植多人操作包支持跨设备审查、签名、传递、本地脚本引擎预检与广播，无需协调网站。
- 官方 SilverScript 编译器固定到 `023c7eed6b85038c72233a62024c5476640445e3`；当前仍为实验性质并仅限 TN10。
