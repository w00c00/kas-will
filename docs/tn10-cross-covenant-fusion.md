# TN10 cross-covenant read/write observation / TN10 跨 Covenant 读写观察

## Status / 状态

On 2026-08-14 a community transaction was accepted on TN10 that co-spent two
different covenant lineages, continued one input, and used the other input to
authorize a fresh covenant lineage output. This is useful evidence for atomic
read/write composition, but the forum post does not publish a reproducible
source repository or compiler artifact. Studio therefore records it as an
observation and builder regression pattern, not as a deployable template or a
standard.

2026-08-14，社区展示了一笔已被 TN10 接受的交易：共同花费两个不同 Covenant
lineage，延续其中一个输入，并由另一个 Covenant 输入授权新的 lineage 输出。这为原子
读写组合提供了有价值的链上证据，但论坛没有给出可复现源码仓库与编译产物。因此 Studio
只把它记录为观察样本与 builder 回归模式，不把它包装成可部署模板或正式标准。

## Recorded evidence / 已记录证据

- Transaction: `975dbb2ad064ef5b4339f98e464d5f64df6af84a43995465cb3c9927b24dcf35`
- Input A covenant ID: `8614b79030c6024e61f1757a44ac803ba8c9fe314f5779c68709a672c10acdb7`
- Input B covenant ID: `2a8a728d3629da290aa08762830ef09e45692ff775dc4bb2b3b5cb435c39bdd3`
- Fresh output covenant ID reported by the transaction author:
  `0fc9ff63bc367db7b8adfe463502904e0eb79b20c771156bae8f977b1d8d1f0e`
- Explorer: <https://tn10.kaspa.stream/transactions/975dbb2ad064ef5b4339f98e464d5f64df6af84a43995465cb3c9927b24dcf35>
- Discussion: <https://kas-smiths.org/t/this-is-magic-sharing-a-moment-that-brings-me-great-joy/129>

## Studio builder rule / Studio builder 规则

`buildAtomicCovenantPackage` now accepts a covenant output with
`genesisAuthorizerCovenantId`. The builder derives the authorizing input index
from the verified input covenant ID, calls the consensus SDK's
`populateGenesisCovenants`, and records the resulting covenant ID in the
portable package. A caller-supplied input index or caller-supplied fresh
covenant ID is rejected.

`buildAtomicCovenantPackage` 现在允许 Covenant 输出声明
`genesisAuthorizerCovenantId`。Builder 会从已核验的输入 Covenant ID 推导授权输入位置，
调用共识 SDK 的 `populateGenesisCovenants`，并把生成的 Covenant ID 写入操作包。调用方
不能直接指定授权 input index，也不能预先伪造新 Covenant ID。

This only constructs and binds the transaction. Each participating redeem
program must still independently validate the intended cross-covenant state,
script, value, cardinality and output covenant identity.

这只完成交易构建和绑定。参与交易的每个 redeem program 仍必须独立核验预期的跨
Covenant 状态、脚本、金额、数量以及输出 Covenant identity。
