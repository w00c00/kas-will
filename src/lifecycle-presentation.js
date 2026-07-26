export function lifecycleRenewalAvailable(summary, templateId) {
  return Boolean(
    summary?.unspent
    && templateId === "inheritance-vault"
    && !summary?.schedule?.mature
  );
}

export function lifecycleInheritanceDistributionAvailable(summary, templateId) {
  return Boolean(
    summary?.unspent
    && templateId === "inheritance-vault"
    && summary?.schedule?.mature
  );
}

export function availableLifecycleOperations(operations, summary) {
  if (summary && !summary.unspent) return [];
  const mature = Boolean(summary?.schedule?.mature);
  return operations.filter((operation) => {
    if (operation.id === "checkIn") return !mature;
    if (operation.id === "inherit") return mature;
    return true;
  });
}
