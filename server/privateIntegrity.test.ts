import { describe, expect, it } from "vitest";
import { buildMerkleRoot, createIntegrityAnchor, createIntegrityTimestamp, verifyIntegrityChain } from "./privateIntegrity";

describe("private evidence integrity", () => {
  it("creates deterministic hash-chain anchors and detects a changed payload", () => {
    const first = createIntegrityAnchor({ merchantOpenId: "merchant-1", customerCaseId: 7, anchorType: "audit_export", sourceRecordId: "export-1", payloadHash: "a".repeat(64), createdAt: "2026-08-27T00:00:00.000Z" });
    const second = createIntegrityAnchor({ merchantOpenId: "merchant-1", customerCaseId: 7, anchorType: "document_checksum", sourceRecordId: "document-3", payloadHash: "b".repeat(64), previousChainHash: first.chainHash, createdAt: "2026-08-27T00:01:00.000Z" });
    expect(verifyIntegrityChain([first, second])).toMatchObject({ valid: true, checked: 2 });
    expect(verifyIntegrityChain([first, { ...second, payloadHash: "c".repeat(64) }]).valid).toBe(false);
  });
  it("builds a deterministic order-independent Merkle root", () => {
    expect(buildMerkleRoot(["c", "a", "b"])).toBe(buildMerkleRoot(["b", "c", "a"]));
  });
  it("normalizes a timestamp to the precision persisted by the anchor table", () => {
    const createdAt = createIntegrityTimestamp(new Date("2026-08-27T00:00:00.987Z"));
    const anchor = createIntegrityAnchor({ merchantOpenId: "merchant-1", customerCaseId: 7, anchorType: "audit_export", sourceRecordId: "export-time", payloadHash: "d".repeat(64), createdAt });
    expect(createdAt).toBe("2026-08-27T00:00:00.000Z");
    expect(verifyIntegrityChain([{ ...anchor, createdAt: new Date(createdAt).toISOString() }])).toMatchObject({ valid: true, checked: 1 });
  });
  it("verifies a valid chain independent of query order and rejects a concurrent fork", () => {
    const root = createIntegrityAnchor({ merchantOpenId: "merchant-1", customerCaseId: 7, anchorType: "audit_export", sourceRecordId: "export-root", payloadHash: "e".repeat(64), createdAt: "2026-08-27T00:00:00.000Z" });
    const child = createIntegrityAnchor({ merchantOpenId: "merchant-1", customerCaseId: 7, anchorType: "document_checksum", sourceRecordId: "document-child", payloadHash: "f".repeat(64), previousChainHash: root.chainHash, createdAt: "2026-08-27T00:00:01.000Z" });
    const fork = createIntegrityAnchor({ merchantOpenId: "merchant-1", customerCaseId: 7, anchorType: "verified_webhook", sourceRecordId: "event-fork", payloadHash: "0".repeat(64), previousChainHash: root.chainHash, createdAt: "2026-08-27T00:00:02.000Z" });
    expect(verifyIntegrityChain([child, root])).toMatchObject({ valid: true, checked: 2, rootHash: child.chainHash });
    expect(verifyIntegrityChain([root, child, fork])).toMatchObject({ valid: false, issue: "chain_fork_detected" });
  });
  it("rejects an anchor generated under an unsupported contract version", () => {
    const anchor = createIntegrityAnchor({ merchantOpenId: "merchant-1", customerCaseId: 7, anchorType: "audit_export", sourceRecordId: "export-version", payloadHash: "1".repeat(64), createdAt: "2026-08-27T00:00:00.000Z" });
    expect(verifyIntegrityChain([{ ...anchor, anchorVersion: "ds-private-integrity-v0" }])).toMatchObject({ valid: false, issue: "unsupported_anchor_version" });
  });
});
