export function lifecycleRenewalAvailable(summary, templateId) {
  return Boolean(
    summary?.unspent
    && ["inheritance-vault", "kcc20-inheritance-vault"].includes(templateId)
    && !summary?.schedule?.mature
  );
}

export function lifecycleInheritanceDistributionAvailable(summary, templateId) {
  return Boolean(
    summary?.unspent
    && ["inheritance-vault", "kcc20-inheritance-vault"].includes(templateId)
    && summary?.schedule?.mature
  );
}

export function availableLifecycleOperations(operations, summary) {
  if (summary && !summary.unspent) return [];
  const mature = Boolean(summary?.schedule?.mature);
  return operations.filter((operation) => {
    if (["checkIn", "fundKcc20"].includes(operation.id)) return !mature;
    if (operation.id === "inherit") return mature;
    return true;
  });
}
