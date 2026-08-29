export const DEMO_SEED_ACKNOWLEDGEMENT = "SEED_SYNTHETIC_DEMO_DATA";

export function demoSeedAllowed(input: { isProduction: boolean; isOwner: boolean; isAdmin: boolean; acknowledgement: string }) {
  if (input.isProduction) return { allowed: false as const, reason: "Synthetic demo seeding is disabled in production." };
  if (!input.isOwner || !input.isAdmin) return { allowed: false as const, reason: "Synthetic demo seeding is restricted to the project owner." };
  if (input.acknowledgement !== DEMO_SEED_ACKNOWLEDGEMENT) return { allowed: false as const, reason: "Synthetic demo acknowledgement is required." };
  return { allowed: true as const };
}
