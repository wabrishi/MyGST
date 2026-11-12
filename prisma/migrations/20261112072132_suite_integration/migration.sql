-- AlterTable
ALTER TABLE `document` ADD COLUMN `externalRef` VARCHAR(100) NULL;

-- AlterTable
ALTER TABLE `party` ADD COLUMN `externalRef` VARCHAR(100) NULL;

-- CreateTable
CREATE TABLE `api_key` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(20) NOT NULL,
    `keyHash` CHAR(64) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastUsedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,

    UNIQUE INDEX `api_key_keyHash_key`(`keyHash`),
    INDEX `api_key_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `idempotency_record` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `key` VARCHAR(200) NOT NULL,
    `route` VARCHAR(100) NOT NULL,
    `status` INTEGER NOT NULL,
    `response` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idempotency_record_createdAt_idx`(`createdAt`),
    UNIQUE INDEX `idempotency_record_companyId_key_route_key`(`companyId`, `key`, `route`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_integration` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `leadsWebhookUrl` VARCHAR(500) NOT NULL DEFAULT '',
    `webhookSecretEnc` TEXT NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `company_integration_companyId_key`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outbox_event` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(60) NOT NULL,
    `envelope` JSON NOT NULL,
    `status` ENUM('PENDING', 'SENDING', 'SENT', 'DEAD') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextAttemptAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sentAt` DATETIME(3) NULL,

    INDEX `outbox_event_status_nextAttemptAt_idx`(`status`, `nextAttemptAt`),
    INDEX `outbox_event_companyId_createdAt_idx`(`companyId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `document_companyId_externalRef_idx` ON `document`(`companyId`, `externalRef`);

-- CreateIndex
CREATE INDEX `party_companyId_externalRef_idx` ON `party`(`companyId`, `externalRef`);

-- AddForeignKey
ALTER TABLE `api_key` ADD CONSTRAINT `api_key_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `company_integration` ADD CONSTRAINT `company_integration_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `outbox_event` ADD CONSTRAINT `outbox_event_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
