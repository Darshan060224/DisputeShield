export function getQrEvidenceAction(caseId: string | null | undefined) {
  if (!caseId) {
    return {
      allowed: false,
      message: "QR evidence is available after a signed live dispute arrives.",
      description: "There is no active product-not-received case to attach to yet.",
    } as const;
  }

  return { allowed: true, caseId } as const;
}

type QrEvidenceDispatchOptions = {
  caseId: string | null | undefined;
  isAuthenticated: boolean;
  onUnavailable: (action: Extract<ReturnType<typeof getQrEvidenceAction>, { allowed: false }>) => void;
  onAuthenticationRequired: () => void;
  dispatchMutation: (caseId: string) => void;
};

/**
 * The sole dispatch boundary for dashboard QR evidence creation. An unavailable
 * live case must never reach the tRPC mutation, even if a stale click handler runs.
 */
export function dispatchQrEvidenceAction({
  caseId,
  isAuthenticated,
  onUnavailable,
  onAuthenticationRequired,
  dispatchMutation,
}: QrEvidenceDispatchOptions) {
  const action = getQrEvidenceAction(caseId);
  if (!action.allowed) {
    onUnavailable(action);
    return { dispatched: false, reason: "no_live_case" } as const;
  }

  if (!isAuthenticated) {
    onAuthenticationRequired();
    return { dispatched: false, reason: "authentication_required" } as const;
  }

  dispatchMutation(action.caseId);
  return { dispatched: true, caseId: action.caseId } as const;
}
