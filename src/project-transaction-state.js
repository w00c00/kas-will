export function clearProjectScopedTransactionState(state) {
  state.externalPackage = null;
  state.externalReview = null;
  state.lifecycleOperations = [];
  state.lifecycleInviteProjectId = "";
  return state;
}
