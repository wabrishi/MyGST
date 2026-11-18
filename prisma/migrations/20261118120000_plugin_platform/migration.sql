-- AlterTable
ALTER TABLE `product` ADD COLUMN `customFields` JSON NULL;

-- CreateTable
CREATE TABLE `plugin_record` (
    `id` VARCHAR(191) NOT NULL,
    `pluginId` VARCHAR(64) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `collection` VARCHAR(64) NOT NULL,
    `data` JSON NOT NULL,
    `i1` VARCHAR(191) NULL,
    `i2` VARCHAR(191) NULL,
    `i3` VARCHAR(191) NULL,
    `i4` VARCHAR(191) NULL,
    `n1` DECIMAL(18, 4) NULL,
    `n2` DECIMAL(18, 4) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `plugin_record_pluginId_companyId_collection_createdAt_idx`(`pluginId`, `companyId`, `collection`, `createdAt`),
    INDEX `plugin_record_pluginId_companyId_collection_i1_idx`(`pluginId`, `companyId`, `collection`, `i1`),
    INDEX `plugin_record_pluginId_companyId_collection_i2_idx`(`pluginId`, `companyId`, `collection`, `i2`),
    INDEX `plugin_record_pluginId_companyId_collection_i3_idx`(`pluginId`, `companyId`, `collection`, `i3`),
    INDEX `plugin_record_pluginId_companyId_collection_i4_idx`(`pluginId`, `companyId`, `collection`, `i4`),
    INDEX `plugin_record_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plugin_job_run` (
    `id` VARCHAR(191) NOT NULL,
    `pluginId` VARCHAR(64) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `job` VARCHAR(64) NOT NULL,
    `lastRunAt` DATETIME(3) NOT NULL,
    `lastError` VARCHAR(500) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `plugin_job_run_companyId_idx`(`companyId`),
    UNIQUE INDEX `plugin_job_run_pluginId_companyId_job_key`(`pluginId`, `companyId`, `job`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `plugin_record` ADD CONSTRAINT `plugin_record_pluginId_fkey` FOREIGN KEY (`pluginId`) REFERENCES `plugin`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plugin_record` ADD CONSTRAINT `plugin_record_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plugin_job_run` ADD CONSTRAINT `plugin_job_run_pluginId_fkey` FOREIGN KEY (`pluginId`) REFERENCES `plugin`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plugin_job_run` ADD CONSTRAINT `plugin_job_run_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

