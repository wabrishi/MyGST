-- AlterTable
ALTER TABLE `company` ADD COLUMN `entitlement` JSON NULL,
    ADD COLUMN `hubWorkspaceId` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `hubNotice` VARCHAR(300) NULL;

-- CreateTable
CREATE TABLE `inbox_event` (
    `id` VARCHAR(64) NOT NULL,
    `source` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `inbox_event_receivedAt_idx`(`receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `company_hubWorkspaceId_key` ON `company`(`hubWorkspaceId`);

