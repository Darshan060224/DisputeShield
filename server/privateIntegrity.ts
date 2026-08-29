import crypto from "node:crypto";

export const PRIVATE_INTEGRITY_VERSION = "ds-private-integrity-v1";
export type IntegrityAnchorType = "audit_export" | "packet_release" | "document_checksum" | "verified_webhook";
export type IntegrityAnchorInput = { merchantOpenId: string; customerCaseId: number; anchorType: IntegrityAnchorType; sourceRecordId: string; payloadHash: string; previousChainHash?: string | null; createdAt: string; };
export type IntegrityAnchor = IntegrityAnchorInput & { chainHash: string; anchorVersion: string };

export function sha256(value: string) { return crypto.createHash("sha256").update(value).digest("hex"); }
export function createIntegrityTimestamp(date = new Date()) { return new Date(Math.floor(date.getTime() / 1_000) * 1_000).toISOString(); }
export function canonicalize(value: Record<string, unknown>) { return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))); }
export function createIntegrityAnchor(input: IntegrityAnchorInput): IntegrityAnchor {
  const createdAt = createIntegrityTimestamp(new Date(input.createdAt));
  const payload = { anchorType: input.anchorType, anchorVersion: PRIVATE_INTEGRITY_VERSION, createdAt, customerCaseId: input.customerCaseId, merchantOpenId: input.merchantOpenId, payloadHash: input.payloadHash, previousChainHash: input.previousChainHash ?? null, sourceRecordId: input.sourceRecordId };
  return { ...input, createdAt, previousChainHash: input.previousChainHash ?? null, anchorVersion: PRIVATE_INTEGRITY_VERSION, chainHash: sha256(canonicalize(payload)) };
}
export function verifyIntegrityChain(anchors: IntegrityAnchor[]) {
  if (!anchors.length) return { valid: true, checked: 0, rootHash: null };
  if (anchors.some(anchor => anchor.anchorVersion !== PRIVATE_INTEGRITY_VERSION)) return { valid: false, checked: anchors.length, issue: "unsupported_anchor_version" as const };
  const roots = anchors.filter(anchor => anchor.previousChainHash === null);
  if (roots.length !== 1) return { valid: false, checked: anchors.length, issue: roots.length > 1 ? "chain_fork_detected" as const : "chain_root_missing" as const };
  const successors = new Map<string, IntegrityAnchor[]>();
  for (const anchor of anchors) {
    if (!anchor.previousChainHash) continue;
    successors.set(anchor.previousChainHash, [...(successors.get(anchor.previousChainHash) ?? []), anchor]);
  }
  let current = roots[0]!;
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.chainHash)) return { valid: false, checked: anchors.length, issue: "chain_cycle_detected" as const, failedAnchorHash: current.chainHash };
    const predecessor = current.previousChainHash;
    const expected = createIntegrityAnchor({ merchantOpenId: current.merchantOpenId, customerCaseId: current.customerCaseId, anchorType: current.anchorType, sourceRecordId: current.sourceRecordId, payloadHash: current.payloadHash, previousChainHash: predecessor, createdAt: current.createdAt }).chainHash;
    if (current.chainHash !== expected) return { valid: false, checked: anchors.length, issue: "anchor_hash_mismatch" as const, failedAnchorHash: current.chainHash };
    visited.add(current.chainHash);
    const next = successors.get(current.chainHash) ?? [];
    if (next.length > 1) return { valid: false, checked: anchors.length, issue: "chain_fork_detected" as const, failedAnchorHash: current.chainHash };
    current = next[0]!;
  }
  if (visited.size !== anchors.length) return { valid: false, checked: anchors.length, issue: "orphan_anchor_detected" as const };
  return { valid: true, checked: anchors.length, rootHash: Array.from(visited).at(-1) ?? null };
}
export function buildMerkleRoot(hashes: string[]): string | null {
  if (!hashes.length) return null;
  let level = [...hashes].sort();
  while (level.length > 1) { const next: string[] = []; for (let index = 0; index < level.length; index += 2) next.push(sha256(`${level[index]}:${level[index + 1] ?? level[index]}`)); level = next; }
  return level[0];
}
