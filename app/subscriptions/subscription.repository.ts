import { Prisma } from "@prisma/client";
import db from "../db.server";
import { normalizeEmail } from "./email";
import type { SubscriptionInput, SubscriptionRepository } from "./subscribe.service";

export const subscriptionRepository: SubscriptionRepository = {
  async save(input: SubscriptionInput) {
    const emailNormalized = normalizeEmail(input.email);
    const where = {
      shopDomain_variantId_emailNormalized: {
        shopDomain: input.shopDomain,
        variantId: input.variantId,
        emailNormalized,
      },
    };

    const existing = await db.subscription.findUnique({ where });
    if (existing?.status === "PENDING") return "already";

    if (existing) {
      // Subscribing again after a restock (NOTIFIED) or an unsubscribe is a fresh request.
      await db.subscription.update({
        where,
        data: {
          status: "PENDING",
          notifiedAt: null,
          inventoryItemId: input.inventoryItemId,
          pageType: input.pageType,
          marketingOptIn: input.marketingOptIn || existing.marketingOptIn,
        },
      });
      return "reactivated";
    }

    try {
      await db.subscription.create({
        data: {
          shopDomain: input.shopDomain,
          productId: input.productId,
          variantId: input.variantId,
          inventoryItemId: input.inventoryItemId,
          email: input.email,
          emailNormalized,
          pageType: input.pageType,
          marketingOptIn: input.marketingOptIn,
        },
      });
      return "created";
    } catch (err) {
      // Two simultaneous submits for the same address: the second one lost the race.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return "already";
      throw err;
    }
  },
};
