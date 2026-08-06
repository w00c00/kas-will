const OPERATIONS = {
  "inheritance-vault:checkIn": {
    kind: "renewal",
    titleZh: "签到续期",
    titleEn: "Check in & renew",
    descriptionZh: "由资产拥有者签名，把资金转入同一 Covenant，并从新的 UTXO DAA 分数重新计算等待期。",
    descriptionEn: "The owner signs a continuation into the same covenant, restarting the waiting period from the new UTXO DAA score."
  },
  "inheritance-vault:recover": {
    kind: "owner-recovery",
    titleZh: "拥有者取回资产",
    titleEn: "Owner asset recovery",
    descriptionZh: "由资产拥有者签名，将 Covenant 中的资金释放回拥有者钱包。",
    descriptionEn: "The owner signs to release the covenant funds back to the owner wallet."
  },
  "inheritance-vault:inherit": {
    kind: "inheritance-payment",
    titleZh: "确认继承分配",
    titleEn: "Confirm inheritance distribution",
    descriptionZh: "等待期成熟后，按合约中固定的继承比例分配资产。",
    descriptionEn: "After maturity, distribute funds using the inheritance shares fixed in the contract."
  },
  "two-of-three:spend": {
    kind: "multisig",
    titleZh: "三选二多签付款",
    titleEn: "Two-of-three multisig payment",
    descriptionZh: "需要所选两位签名人依次导入同一个最新操作包并完成各自签名槽位。",
    descriptionEn: "The selected two signers must sequentially sign the same latest operation package."
  },
  "timelock-transfer:claim": {
    kind: "payment",
    titleZh: "确认收款",
    titleEn: "Confirm recipient payment",
    descriptionZh: "由指定收款钱包签名领取锁定资产。",
    descriptionEn: "The designated recipient signs to claim the locked funds."
  },
  "timelock-transfer:refund": {
    kind: "refund",
    titleZh: "确认超时退款",
    titleEn: "Confirm timeout refund",
    descriptionZh: "绝对时间锁成熟后，由发送方签名取回资金。",
    descriptionEn: "After the absolute timelock matures, the sender signs to reclaim the funds."
  },
  "hashlock-refund:claim": {
    kind: "secret-claim",
    titleZh: "凭秘密确认收款",
    titleEn: "Confirm secret claim",
    descriptionZh: "提供匹配的秘密原文，并由指定收款钱包签名领取资产。",
    descriptionEn: "Provide the matching secret preimage and the designated recipient signature."
  },
  "hashlock-refund:refund": {
    kind: "refund",
    titleZh: "确认哈希锁退款",
    titleEn: "Confirm hashlock refund",
    descriptionZh: "超时后由发送方签名取回资金。",
    descriptionEn: "After timeout, the sender signs to reclaim the funds."
  },
  "owner-vault:spend": {
    kind: "payment",
    titleZh: "确认拥有者付款",
    titleEn: "Confirm owner payment",
    descriptionZh: "由拥有者签名，将锁定资产支付到指定地址。",
    descriptionEn: "The owner signs to pay the locked funds to the selected destination."
  },
  "merkle-one-time-claim:claim": {
    kind: "merkle-claim",
    titleZh: "Merkle 一次性领取",
    titleEn: "Merkle one-time claim",
    descriptionZh: "领取钱包提交匹配叶子、索引、盐值的 Merkle 证明并签名，一次性终结该 Covenant。",
    descriptionEn: "The claimant submits the Merkle proof bound to its leaf, index and salt, signs, and terminates this covenant once."
  },
  "merkle-one-time-claim:refund": {
    kind: "refund",
    titleZh: "Merkle 领取超时退款",
    titleEn: "Merkle claim timeout refund",
    descriptionZh: "领取窗口超时后，由固定退款钱包签名收回。",
    descriptionEn: "After the claim window expires, the configured refund wallet signs to recover the funds."
  },
  "commit-reveal:reveal": {
    kind: "commit-reveal",
    titleZh: "公开承诺并领取",
    titleEn: "Reveal commitment and claim",
    descriptionZh: "收款钱包公开匹配域隔离承诺的 payload 与 salt 并签名领取。",
    descriptionEn: "The recipient reveals the payload and salt matching the domain-separated commitment and signs to claim."
  },
  "commit-reveal:refund": {
    kind: "refund",
    titleZh: "Commit / Reveal 超时退款",
    titleEn: "Commit / reveal timeout refund",
    descriptionZh: "未 Reveal 且超时后，由发送方签名退款。",
    descriptionEn: "If no reveal occurs before timeout, the sender signs to recover the escrow."
  },
  "kcc721-experimental:__covenant_entrypoint_auth_transfer": {
    kind: "p2pk-cospend",
    titleZh: "KCC721 实验 NFT 转移",
    titleEn: "Experimental KCC721 NFT transfer",
    descriptionZh: "由当前拥有者的独立 P2PK 输入授权 Covenant NFT 所有权转移。",
    descriptionEn: "A separate P2PK input owned by the current holder authorizes the covenant NFT transfer."
  }
};

export function operationPresentation({ templateId = "", entrypoint = "", signatureSlots = [], outputs = [], covenantId = "" } = {}) {
  const known = OPERATIONS[`${templateId}:${entrypoint}`];
  const continuation = outputs.some((output) => String(output.covenantId || "").toLowerCase() === String(covenantId || "").toLowerCase());
  return {
    ...(known || {
      kind: "external",
      titleZh: `外部操作：${entrypoint || "未知入口"}`,
      titleEn: `External operation: ${entrypoint || "unknown entrypoint"}`,
      descriptionZh: "无法从受支持模板识别业务语义；请依据可信源码、程序哈希、输入输出和交易承诺独立审查。",
      descriptionEn: "Business semantics are not recognized from a supported template. Independently verify trusted source, program hash, inputs, outputs and commitment."
    }),
    templateId: String(templateId || ""),
    entrypoint: String(entrypoint || ""),
    continuation,
    signaturesRequired: signatureSlots.length,
    signaturesSigned: signatureSlots.filter((slot) => slot.signed).length
  };
}
