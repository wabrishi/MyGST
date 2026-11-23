-- AlterTable
ALTER TABLE `company` ADD COLUMN `inviteParties` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `email_template` (
    `key` VARCHAR(64) NOT NULL,
    `subject` VARCHAR(300) NOT NULL,
    `body` TEXT NOT NULL,
    `updatedBy` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `party_invite` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `invitedByCompanyId` VARCHAR(191) NOT NULL,
    `partyId` VARCHAR(191) NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `joinedAt` DATETIME(3) NULL,

    UNIQUE INDEX `party_invite_email_key`(`email`),
    INDEX `party_invite_invitedByCompanyId_idx`(`invitedByCompanyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shared_document` (
    `id` VARCHAR(191) NOT NULL,
    `fromCompanyId` VARCHAR(191) NOT NULL,
    `toCompanyId` VARCHAR(191) NOT NULL,
    `kind` ENUM('INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'QUOTATION', 'PURCHASE_ORDER') NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(30) NOT NULL,
    `date` DATE NOT NULL,
    `total` DECIMAL(14, 2) NOT NULL,
    `snapshot` JSON NOT NULL,
    `status` ENUM('NEW', 'ACCEPTED', 'REJECTED', 'WITHDRAWN') NOT NULL DEFAULT 'NEW',
    `updatedBySender` BOOLEAN NOT NULL DEFAULT false,
    `readAt` DATETIME(3) NULL,
    `acceptedRefId` VARCHAR(191) NULL,
    `rejectReason` VARCHAR(300) NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actedAt` DATETIME(3) NULL,
    `actedBy` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `shared_document_toCompanyId_status_receivedAt_idx`(`toCompanyId`, `status`, `receivedAt`),
    UNIQUE INDEX `shared_document_fromCompanyId_kind_sourceId_key`(`fromCompanyId`, `kind`, `sourceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `company_gstin_idx` ON `company`(`gstin`);

-- AddForeignKey
ALTER TABLE `party_invite` ADD CONSTRAINT `party_invite_invitedByCompanyId_fkey` FOREIGN KEY (`invitedByCompanyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shared_document` ADD CONSTRAINT `shared_document_fromCompanyId_fkey` FOREIGN KEY (`fromCompanyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shared_document` ADD CONSTRAINT `shared_document_toCompanyId_fkey` FOREIGN KEY (`toCompanyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

