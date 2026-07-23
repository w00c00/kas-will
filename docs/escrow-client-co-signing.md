# 本地客户端托管通信与共同签名 / Local-client escrow messaging and co-signing

## 结论 / Summary

两个桌面客户端不能只靠 Kaspa 链自动发现对方。链负责资金和确定性状态，客户端之间仍需要一个消息通道来交换房间事件、交易草案和部分签名。推荐的第一版是“不受信任的 WebSocket 中继 + 钱包签名消息 + 链上超时退款”。中继可以离线或丢消息，但不能伪造用户签名、修改交易或转走资金。

Two desktop clients cannot discover each other through the Kaspa chain alone. The chain handles funds and deterministic state, while clients still need a messaging channel for room events, transaction drafts and partial signatures. The recommended first version is an untrusted WebSocket relay plus wallet-authenticated messages and an on-chain timeout refund. The relay may go offline or drop messages, but it cannot forge wallet signatures, alter a committed transaction or move funds.

## 三层边界 / Three-layer boundary

| 层 | 负责 | 不负责 |
|---|---|---|
| 消息中继 | 房间发现、在线状态、加密消息转发、断线重发 | 保存私钥、签名、判断胜负或成交、控制资金 |
| 本地客户端 | 构造并验证交易、展示完整意图、签自己的输入、监控链上确认 | 信任中继提供的金额、地址或交易结果 |
| SilverScript / Kaspa | 锁定资金、验证身份/金额/超时/终止路径、执行结算 | 主动发送下一笔交易、判断链外商品是否真实交付 |

## 房间消息协议 / Room messaging protocol

每条消息使用规范化 JSON，并包含：

```json
{
  "protocol": "silverstudio-escrow/1",
  "roomId": "32-byte random id",
  "sender": "kaspa public key",
  "sequence": 7,
  "previousMessageHash": "...",
  "type": "settlement-signature",
  "expiresAt": 1780000000,
  "payloadHash": "...",
  "signature": "wallet signature over all fields above"
}
```

- `roomId + sender + sequence` 防止跨房间重放和重复执行。
- `previousMessageHash` 形成双方可审计的消息链。
- `expiresAt` 拒绝过期报价和签名请求。
- 大消息只在 `payloadHash` 中承诺，客户端必须重新计算哈希。
- 可使用临时 X25519 会话密钥加密正文，再用 Kaspa 钱包签名认证临时密钥，避免中继读取谈判内容。

The relay stores only bounded, expiring envelopes. Clients verify the wallet signature, room binding, sequence, expiry and payload hash before applying a message.

## 锁定资金 / Funding

推荐让买卖双方分别发送自己的锁定交易，而不是要求两个人先共同签一笔巨大的 funding transaction。每个锁定 UTXO 都绑定：

- 同一个 `roomId`；
- 买卖双方固定身份；
- 资产/金额和网络；
- 成交路径；
- 取消条件；
- 绝对超时退款路径；
- 协议版本和精确 covenant ID。

房间只有在两个锁定交易都达到约定确认数后才进入 `FUNDED`。任何一方未按时锁定，已锁定的一方可在超时后退款。中继显示的“已锁定”不算证据，客户端必须通过 Kaspa 节点/Kascov 验证 UTXO。

## 共同签名不是同时签名 / Co-signing is asynchronous

1. 协调方根据已确认的 UTXO 构造唯一的 unsigned settlement transaction。
2. 对交易做规范化序列化并计算 `transactionCommitment`。
3. 双方分别验证网络、输入 outpoint/covenant ID、所有输出、金额、手续费、找零、超时和终止状态。
4. A 只签自己负责的输入或 covenant witness，发送 `{commitment, inputIndex, signature}`。
5. B 验证 commitment 未改变，再签自己的部分。
6. 任意客户端把两份签名填入原交易；填充签名不能改变 commitment。
7. 合并后的交易通过本地策略和 Kascov 脚本引擎预检，任意一方均可广播。

The signatures can arrive seconds, hours, or days apart. “Simultaneous” signing is unnecessary because both signatures are bound to the same immutable transaction. A partial signature for one commitment must never be reused with another transaction.

对于普通 P2PK funding inputs，每个用户只签自己拥有的 input。对于真正的 2-of-2 covenant entrypoint，builder 必须按 ABI 把两份签名放入准确的 witness 位置；不能假定两个签名自动属于同一个输入。输入/输出索引、covenant ID 和 sompi value 都必须由合约与 builder 双重绑定。

## 买卖托管的客观性限制 / Escrow truth limitation

如果交易标的是链上资产，可以把交付证明、资产 covenant ID、金额和接收者写入确定性结算条件，实现无需 arbiter 的自动成交。

如果交易标的是快递、服务或其他链外事实，SilverScript 无法自行知道“货物是否收到”。无 arbiter 的安全选择只有：

- 双方共同签名放款；
- 买家在截止时间前确认，否则进入预先约定的退款/放款规则；
- 使用双方事先接受的 oracle/arbiter，并公开其权限；
- 使用保证金和 optimistic challenge，但仍需定义最终可验证证据。

For off-chain goods, claiming fully automatic, trustless settlement would be misleading. The exact dispute authority and timeout consequences must be explicit before either side locks funds.

## 断线与恢复 / Disconnect and recovery

- 中继消息应有 TTL、幂等 ID 和按 sequence 补拉。
- 房间状态从链上 UTXO 重建，中继数据库不是真相来源。
- 交易草案可导出为文件/二维码，作为中继不可用时的手动交换后备。
- 所有不可逆操作都需在链上只执行一次；重复广播应返回已有 txid。
- 必须为未匹配、只锁一方、双方锁定、等待签名和争议状态分别设计超时出口。

## 建议实现顺序 / Recommended implementation order

1. TN10 单中继、签名消息、两笔独立 funding、共同签名 settlement、超时退款。
2. 断线重连、链上状态重建、重复/重放/乱序攻击测试。
3. 端到端加密、手动 PSKT/交易包交换后备。
4. 多中继或 WebRTC 数据通道；WebRTC 仍需要 signaling，复杂网络通常还需要 TURN。
5. 固定部署候选、完整编译、恶意交易测试和独立审查后，再讨论主网。

This document is a protocol design, not a compiled or audited escrow contract.
