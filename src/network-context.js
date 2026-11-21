export function networkLabel(network) { return network === "mainnet" ? "MAINNET" : "TN10"; }
export function networkSymbol(network) { return network === "mainnet" ? "KAS" : "TKAS"; }
export function assertNetworkContext(selected, actual) {
  if (!["mainnet", "tn10"].includes(selected) || actual !== selected) throw new Error("Network mismatch / 网络不一致：请切换到对应网络并重新连接钱包");
}
export function clearNetworkContext(state) {
  state.networkEpoch = Number(state.networkEpoch || 0) + 1;
  state.wallet = null;
  state.activeProject = null;
  state.package = null;
  state.review = null;
  state.operationId = "";
  state.transferDraft = null;
  state.kcc20Package = null;
  state.kcc20Review = null;
  state.kcc20Tokens = [];
  state.tokenMetadata = null;
  state.countdownTargetMs = null;
  state.lifecycleRequestId += 1;
  state.lifecycleController?.abort();
  state.lifecycleController = null;
}
