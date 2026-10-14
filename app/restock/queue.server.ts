import db from "../db.server";

/**
 * Moves every PENDING subscription of the inventory item to NOTIFIED and queues one email job for
 * each. updateManyAndReturn flips the status and returns the rows in one statement, so two
 * webhook deliveries racing each other cannot both queue the same subscription.
 */
export async function enqueueRestock(shopDomain: string, inventoryItemGid: string): Promise<number> {
  return db.$transaction(async (tx) => {
    const flipped = await tx.subscription.updateManyAndReturn({
      where: { shopDomain, inventoryItemId: inventoryItemGid, status: "PENDING" },
      data: { status: "NOTIFIED", notifiedAt: new Date() },
      select: { id: true },
    });
    if (flipped.length === 0) return 0;
    await tx.notificationJob.createMany({
      data: flipped.map((s) => ({ shopDomain, subscriptionId: s.id })),
    });
    return flipped.length;
  });
}
