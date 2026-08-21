# Changelog / 更新日志

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
