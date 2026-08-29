import { and, desc, eq, sql } from "drizzle-orm";
import { customerCaseIntegrityAnchors, customerCaseIntegrityHeads } from "../drizzle/schema";
import { createIntegrityAnchor, createIntegrityTimestamp, verifyIntegrityChain, type IntegrityAnchor, type IntegrityAnchorInput } from "./privateIntegrity";

type AppendInput = Omit<IntegrityAnchorInput, "previousChainHash" | "createdAt"> & { createdBy: string | null };
type AppendResult = { anchor: IntegrityAnchor; created: boolean };

function fromStoredAnchor(row: typeof customerCaseIntegrityAnchors.$inferSelect): IntegrityAnchor {
  return {
    merchantOpenId: row.merchantOpenId,
    customerCaseId: row.customerCaseId,
    anchorType: row.anchorType,
    sourceRecordId: row.sourceRecordId,
    payloadHash: row.payloadHash,
    previousChainHash: row.previousChainHash,
    chainHash: row.chainHash,
    anchorVersion: row.anchorVersion,
    createdAt: createIntegrityTimestamp(row.createdAt),
  };
}

/**
 * Serializes one case's append operation in the database. The head row is the
 * durable lock target; callers must create timeline events only when `created` is true.
 */
export async function appendPrivateIntegrityAnchor(db: any, input: AppendInput): Promise<AppendResult> {
  return db.transaction(async (tx: any) => {
    const existing = (await tx.select().from(customerCaseIntegrityAnchors).where(and(
      eq(customerCaseIntegrityAnchors.customerCaseId, input.customerCaseId),
      eq(customerCaseIntegrityAnchors.merchantOpenId, input.merchantOpenId),
      eq(customerCaseIntegrityAnchors.anchorType, input.anchorType),
      eq(customerCaseIntegrityAnchors.sourceRecordId, input.sourceRecordId),
    )).limit(1))[0] ?? null;
    if (existing) return { anchor: fromStoredAnchor(existing), created: false };

    await tx.insert(customerCaseIntegrityHeads).values({ customerCaseId: input.customerCaseId, merchantOpenId: input.merchantOpenId, headChainHash: null, anchorCount: 0 }).onDuplicateKeyUpdate({ set: { merchantOpenId: input.merchantOpenId } });
    const lockResult = await tx.execute(sql`SELECT ${customerCaseIntegrityHeads.customerCaseId}, ${customerCaseIntegrityHeads.merchantOpenId}, ${customerCaseIntegrityHeads.headChainHash}, ${customerCaseIntegrityHeads.anchorCount} FROM ${customerCaseIntegrityHeads} WHERE ${customerCaseIntegrityHeads.customerCaseId} = ${input.customerCaseId} FOR UPDATE`);
    const lockedRows = Array.isArray(lockResult) && Array.isArray(lockResult[0]) ? lockResult[0] : lockResult as unknown as Array<{ merchantOpenId: string; headChainHash: string | null; anchorCount: number }>;
    const head = lockedRows[0];
    if (!head || head.merchantOpenId !== input.merchantOpenId) throw new Error("Private integrity head is unavailable for this merchant case.");

    let previousChainHash = head.headChainHash;
    let previousCount = Number(head.anchorCount ?? 0);
    const storedAnchors = await tx.select().from(customerCaseIntegrityAnchors).where(and(eq(customerCaseIntegrityAnchors.customerCaseId, input.customerCaseId), eq(customerCaseIntegrityAnchors.merchantOpenId, input.merchantOpenId))).orderBy(desc(customerCaseIntegrityAnchors.id));
    const existingVerification = verifyIntegrityChain(storedAnchors.map(fromStoredAnchor));
    if (!existingVerification.valid) throw new Error(`Private integrity chain requires review before a new anchor can be appended (${existingVerification.issue ?? "verification_failed"}).`);
    if (!previousChainHash && previousCount === 0 && storedAnchors.length) {
      previousChainHash = existingVerification.rootHash ?? storedAnchors[0]!.chainHash;
      previousCount = storedAnchors.length;
    }

    const anchor = createIntegrityAnchor({ ...input, previousChainHash, createdAt: createIntegrityTimestamp() });
    await tx.insert(customerCaseIntegrityAnchors).values({ merchantOpenId: anchor.merchantOpenId, customerCaseId: anchor.customerCaseId, anchorType: anchor.anchorType, sourceRecordId: anchor.sourceRecordId, payloadHash: anchor.payloadHash, previousChainHash: anchor.previousChainHash, chainHash: anchor.chainHash, anchorVersion: anchor.anchorVersion, createdBy: input.createdBy, createdAt: new Date(anchor.createdAt) });
    await tx.update(customerCaseIntegrityHeads).set({ headChainHash: anchor.chainHash, anchorCount: previousCount + 1 }).where(and(eq(customerCaseIntegrityHeads.customerCaseId, input.customerCaseId), eq(customerCaseIntegrityHeads.merchantOpenId, input.merchantOpenId)));
    return { anchor, created: true };
  });
}
