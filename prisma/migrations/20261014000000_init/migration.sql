-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'NOTIFIED', 'UNSUBSCRIBED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "pageType" TEXT,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "unsubToken" TEXT NOT NULL,
    "revenue" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationJob" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "resendId" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "shopDomain" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "hidePurchaseButtons" BOOLEAN NOT NULL DEFAULT true,
    "showOn" TEXT[] DEFAULT ARRAY['product']::TEXT[],
    "productRule" JSONB NOT NULL DEFAULT '{"mode":"ALL"}',
    "buttonConfig" JSONB NOT NULL DEFAULT '{}',
    "formConfig" JSONB NOT NULL DEFAULT '{}',
    "emailConfig" JSONB NOT NULL DEFAULT '{}',
    "senderEmail" TEXT,
    "replyTo" TEXT,
    "enabledLocationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minStockThreshold" INTEGER NOT NULL DEFAULT 1,
    "reportFrequency" TEXT,
    "reportEmail" TEXT,
    "reportCc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("shopDomain")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_unsubToken_key" ON "Subscription"("unsubToken");

-- CreateIndex
CREATE INDEX "Subscription_shopDomain_variantId_status_idx" ON "Subscription"("shopDomain", "variantId", "status");

-- CreateIndex
CREATE INDEX "Subscription_shopDomain_inventoryItemId_status_idx" ON "Subscription"("shopDomain", "inventoryItemId", "status");

-- CreateIndex
CREATE INDEX "Subscription_shopDomain_status_createdAt_idx" ON "Subscription"("shopDomain", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_shopDomain_variantId_emailNormalized_key" ON "Subscription"("shopDomain", "variantId", "emailNormalized");

-- CreateIndex
CREATE INDEX "NotificationJob_status_runAfter_idx" ON "NotificationJob"("status", "runAfter");

-- CreateIndex
CREATE INDEX "NotificationJob_shopDomain_idx" ON "NotificationJob"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_resendId_key" ON "NotificationLog"("resendId");

-- CreateIndex
CREATE INDEX "NotificationLog_subscriptionId_idx" ON "NotificationLog"("subscriptionId");

-- AddForeignKey
ALTER TABLE "NotificationJob" ADD CONSTRAINT "NotificationJob_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

