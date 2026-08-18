function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

export function willWalletRole(project, walletAddress) {
  const address = normalized(walletAddress);
  if (!address) return "disconnected";
  if (address === normalized(project?.templateParameters?.ownerAddress)) return "owner";
  if ((project?.templateParameters?.inheritors || []).some((item) => normalized(item.address) === address)) return "inheritor";
  return "other";
}

export function operationsForWillRole(operations, lifecycleStatus, role) {
  if (!lifecycleStatus?.unspent || role === "disconnected") return [];
  const mature = Boolean(lifecycleStatus?.schedule?.mature);
  if (role === "owner") {
    return operations.filter((operation) => {
      if (["checkIn", "fundKcc20"].includes(operation.id)) return !mature;
      if (operation.id === "inherit") return mature;
      return true;
    });
  }
  return operations.filter((operation) => operation.id === "inherit" && mature);
}
