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
