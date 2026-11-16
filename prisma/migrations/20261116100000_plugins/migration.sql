-- AlterTable
ALTER TABLE `api_key` ADD COLUMN `pluginId` VARCHAR(64) NULL,
    ADD COLUMN `scopes` JSON NULL;

-- AlterTable
ALTER TABLE `document` ADD COLUMN `customFields` JSON NULL;

-- AlterTable
ALTER TABLE `outbox_event` ADD COLUMN `pluginId` VARCHAR(64) NULL;

-- AlterTable
ALTER TABLE `party` ADD COLUMN `customFields` JSON NULL;

-- CreateTable
CREATE TABLE `plugin` (
    `id` VARCHAR(64) NOT NULL,
    `kind` ENUM('CODE', 'EXTERNAL') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `version` VARCHAR(40) NOT NULL,
    `manifest` JSON NOT NULL,
    `manifestUrl` VARCHAR(1000) NULL,
    `status` ENUM('NOT_INSTALLED', 'INSTALLED', 'MISSING') NOT NULL DEFAULT 'NOT_INSTALLED',
    `availability` ENUM('ALL', 'SELECTED', 'NONE') NOT NULL DEFAULT 'NONE',
    `defaultEnabled` BOOLEAN NOT NULL DEFAULT false,
    `installedAt` DATETIME(3) NULL,
    `installedBy` VARCHAR(191) NULL,
    `lastError` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_plugin` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `pluginId` VARCHAR(64) NOT NULL,
    `allowed` BOOLEAN NOT NULL DEFAULT false,
    `blocked` BOOLEAN NOT NULL DEFAULT false,
    `enabled` BOOLEAN NULL,
    `settings` JSON NULL,
    `acceptedPermissions` JSON NULL,
    `pausedReason` VARCHAR(300) NULL,
    `failureCount` INTEGER NOT NULL DEFAULT 0,
    `webhookSecretEnc` TEXT NULL,
    `apiKeyId` VARCHAR(191) NULL,
    `enabledAt` DATETIME(3) NULL,
    `enabledBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `company_plugin_pluginId_idx`(`pluginId`),
    UNIQUE INDEX `company_plugin_companyId_pluginId_key`(`companyId`, `pluginId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plugin_data` (
    `id` VARCHAR(191) NOT NULL,
    `pluginId` VARCHAR(64) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `plugin_data_companyId_idx`(`companyId`),
    UNIQUE INDEX `plugin_data_pluginId_companyId_key_key`(`pluginId`, `companyId`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `plugin_log` (
    `id` VARCHAR(191) NOT NULL,
    `pluginId` VARCHAR(64) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `level` VARCHAR(10) NOT NULL,
    `message` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `plugin_log_pluginId_createdAt_idx`(`pluginId`, `createdAt`),
    INDEX `plugin_log_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `company_plugin` ADD CONSTRAINT `company_plugin_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_plugin` ADD CONSTRAINT `company_plugin_pluginId_fkey` FOREIGN KEY (`pluginId`) REFERENCES `plugin`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plugin_data` ADD CONSTRAINT `plugin_data_pluginId_fkey` FOREIGN KEY (`pluginId`) REFERENCES `plugin`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plugin_data` ADD CONSTRAINT `plugin_data_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `plugin_log` ADD CONSTRAINT `plugin_log_pluginId_fkey` FOREIGN KEY (`pluginId`) REFERENCES `plugin`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

