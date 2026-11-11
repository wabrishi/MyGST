-- A user belongs to exactly one company (any role). Replaces the owner-only rule.
-- If this fails with a duplicate-key error, some user already has several memberships:
-- remove the extra memberships first (SELECT userId, COUNT(*) FROM membership GROUP BY userId HAVING COUNT(*) > 1).

-- DropIndex
DROP INDEX `membership_ownerKey_key` ON `membership`;

-- AlterTable
ALTER TABLE `membership` DROP COLUMN `ownerKey`;

-- CreateIndex
CREATE UNIQUE INDEX `membership_userId_key` ON `membership`(`userId`);
