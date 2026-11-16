-- DropIndex
DROP INDEX `company_hubWorkspaceId_key` ON `company`;

-- AlterTable
ALTER TABLE `company` DROP COLUMN `entitlement`,
    DROP COLUMN `hubWorkspaceId`;

-- AlterTable
ALTER TABLE `user` DROP COLUMN `hubNotice`;

-- DropTable
DROP TABLE `inbox_event`;

