export function lifecycleRenewalAvailable(summary, templateId) {
  return Boolean(
    summary?.unspent
    && templateId === "inheritance-vault"
    && !summary?.schedule?.mature
  );
}

export function availableLifecycleOperations(operations, summary) {
  if (!summary?.schedule?.mature) return operations;
  return operations.filter((operation) => operation.id !== "checkIn");
}
