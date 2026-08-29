export type CustomerAccessGrant = {
  id: number;
  boundBuyerOpenId: string | null;
};

export async function bindFirstCustomerAccess<TGrant extends CustomerAccessGrant>(input: {
  grant: TGrant;
  buyerOpenId: string;
  tryClaimUnboundGrant: () => Promise<boolean>;
  reloadGrant: () => Promise<TGrant | null>;
  unavailableMessage: string;
  alreadyBoundMessage: string;
}): Promise<TGrant> {
  if (input.grant.boundBuyerOpenId) {
    if (input.grant.boundBuyerOpenId !== input.buyerOpenId) {
      throw new Error(input.alreadyBoundMessage);
    }
    return input.grant;
  }

  if (await input.tryClaimUnboundGrant()) {
    return { ...input.grant, boundBuyerOpenId: input.buyerOpenId };
  }

  const reloadedGrant = await input.reloadGrant();
  if (!reloadedGrant) {
    throw new Error(input.unavailableMessage);
  }
  if (reloadedGrant.boundBuyerOpenId !== input.buyerOpenId) {
    throw new Error(input.alreadyBoundMessage);
  }
  return reloadedGrant;
}
