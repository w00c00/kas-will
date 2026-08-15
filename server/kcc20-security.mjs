function finding(code, severity, line, messageZh, messageEn) {
  return { code, severity, line, messageZh, messageEn, message: messageEn };
}

function lineAt(source, offset) {
  return source.slice(0, Math.max(0, offset)).split("\n").length;
}

function hasAll(source, patterns) {
  return patterns.every((pattern) => pattern.test(source));
}

export function analyzeKcc20Source(source) {
  const text = String(source || "");
  const stateShape = [/\bownerIdentifier\b/, /\bidentifierType\b/, /\bamount\b/, /\bisMinter\b/];
  if (!hasAll(text, stateShape)) return [];

  const findings = [];
  const borrowed = /\bBORROWED_RECEIVE\b|\bborrow(?:ed|ing)?\b/i.exec(text);
  if (borrowed) {
    const rejectsMinterLeader = /require\s*\(\s*!\s*(?:prevStates\s*\[[^\]]+\]|[A-Za-z_]\w*)\.isMinter\s*\)/.test(text);
    if (!rejectsMinterLeader) {
      findings.push(finding(
        "KCC201",
        "error",
        lineAt(text, borrowed.index),
        "检测到免签借用接收路径，但没有明确拒绝 minter leader；该组合可能让任意调用者保留铸币权并增发。",
        "A borrowed-receive path is present without an explicit minter-leader rejection; an unauthenticated leader may retain mint authority and inflate supply."
      ));
    }

    const preservesOwner = /(?:newStates\s*\[[^\]]+\]|[A-Za-z_]\w*)\.ownerIdentifier\s*==\s*(?:prevStates\s*\[[^\]]+\]|[A-Za-z_]\w*)\.ownerIdentifier/.test(text);
    const preservesType = /(?:newStates\s*\[[^\]]+\]|[A-Za-z_]\w*)\.identifierType\s*==\s*(?:prevStates\s*\[[^\]]+\]|[A-Za-z_]\w*)\.identifierType/.test(text);
    const amountIncreases = /(?:newStates\s*\[[^\]]+\]|[A-Za-z_]\w*)\.amount\s*>\s*(?:prevStates\s*\[[^\]]+\]|[A-Za-z_]\w*)\.amount/.test(text);
    if (!preservesOwner || !preservesType || !amountIncreases) {
      findings.push(finding(
        "KCC202",
        "error",
        lineAt(text, borrowed.index),
        "借用接收必须保持 ownerIdentifier 和 identifierType 不变，并要求 token amount 严格增加。",
        "Borrowed receive must preserve ownerIdentifier and identifierType and require the token amount to increase strictly."
      ));
    }

    const preservesKas = /OpCovOutputIdx\s*\([\s\S]{0,240}?\.value\s*>=\s*[\s\S]{0,160}?OpCovInputIdx/.test(text)
      || /tx\.outputs\s*\[[^\]]+\]\.value\s*>=\s*tx\.inputs\s*\[[^\]]+\]\.value/.test(text);
    if (!preservesKas) {
      findings.push(finding(
        "KCC203",
        "error",
        lineAt(text, borrowed.index),
        "借用接收没有明显保持或增加被借用 UTXO 的 KAS value；这可能把接收者的存储押金转走。",
        "Borrowed receive does not visibly preserve or increase the borrowed UTXO KAS value, which may drain the recipient's storage deposit."
      ));
    }

    findings.push(finding(
      "KCC204",
      "manual-review",
      lineAt(text, borrowed.index),
      "借用会生成新的 outpoint，令旧的预签交易失效。若需要可借用后继续授权，应使用带域分离、网络、Covenant ID、lineage、nonce、收款方和金额的 checkMsgSig 意图，并做重放测试。",
      "Borrowing creates a new outpoint and invalidates old pre-signed transactions. Borrow-surviving authorization needs a replay-tested checkMsgSig intent bound to a domain, network, covenant ID, lineage, nonce, recipient and amount."
    ));
  }

  const presenceAuthorization = /IDENTIFIER_(?:SCRIPT_HASH|COVENANT_ID)[\s\S]{0,900}?(?:OpInputCovenantId|scriptPublicKey)/.exec(text);
  if (presenceAuthorization) {
    findings.push(finding(
      "KCC205",
      "manual-review",
      lineAt(text, presenceAuthorization.index),
      "共同输入的存在只能证明控制主体参与了交易，不能自动证明它专门同意这次 token 转移；请审查共同花费脚本是否承诺完整交易或明确意图。",
      "A co-present control input proves participation, not specific consent to this token transfer; review whether its spend commits to the complete transaction or an explicit intent."
    ));
  }

  return findings;
}
