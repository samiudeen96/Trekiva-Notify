-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "embedActivated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "setupConfirmed" BOOLEAN NOT NULL DEFAULT false;
