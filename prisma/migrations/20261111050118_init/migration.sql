-- CreateTable
CREATE TABLE `user` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `emailVerified` BOOLEAN NOT NULL DEFAULT false,
    `image` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `session` (
    `id` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` TEXT NULL,
    `userId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `session_token_key`(`token`),
    INDEX `session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account` (
    `id` VARCHAR(191) NOT NULL,
    `accountId` VARCHAR(191) NOT NULL,
    `providerId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `accessToken` TEXT NULL,
    `refreshToken` TEXT NULL,
    `idToken` TEXT NULL,
    `accessTokenExpiresAt` DATETIME(3) NULL,
    `refreshTokenExpiresAt` DATETIME(3) NULL,
    `scope` TEXT NULL,
    `password` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `account_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification` (
    `id` VARCHAR(191) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `verification_identifier_idx`(`identifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company` (
    `id` VARCHAR(191) NOT NULL,
    `legalName` VARCHAR(191) NOT NULL,
    `tradeName` VARCHAR(191) NOT NULL DEFAULT '',
    `gstin` VARCHAR(191) NOT NULL DEFAULT '',
    `address` VARCHAR(500) NOT NULL DEFAULT '',
    `city` VARCHAR(191) NOT NULL DEFAULT '',
    `pincode` VARCHAR(191) NOT NULL DEFAULT '',
    `stateCode` CHAR(2) NOT NULL,
    `phone` VARCHAR(191) NOT NULL DEFAULT '',
    `email` VARCHAR(191) NOT NULL DEFAULT '',
    `logo` MEDIUMBLOB NULL,
    `logoMime` VARCHAR(191) NULL,
    `bankName` VARCHAR(191) NOT NULL DEFAULT '',
    `bankAccount` VARCHAR(191) NOT NULL DEFAULT '',
    `bankIfsc` VARCHAR(191) NOT NULL DEFAULT '',
    `bankBranch` VARCHAR(191) NOT NULL DEFAULT '',
    `upiId` VARCHAR(191) NOT NULL DEFAULT '',
    `terms` TEXT NULL,
    `pricesIncludeTax` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `membership` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ACCOUNTANT', 'STAFF') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `membership_companyId_idx`(`companyId`),
    UNIQUE INDEX `membership_userId_companyId_key`(`userId`, `companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invitation` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ACCOUNTANT', 'STAFF') NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `invitedBy` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `invitation_tokenHash_key`(`tokenHash`),
    INDEX `invitation_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_log` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `data` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_log_companyId_createdAt_idx`(`companyId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `party` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `type` ENUM('CUSTOMER', 'SUPPLIER', 'BOTH') NOT NULL DEFAULT 'CUSTOMER',
    `name` VARCHAR(191) NOT NULL,
    `gstin` VARCHAR(191) NOT NULL DEFAULT '',
    `phone` VARCHAR(191) NOT NULL DEFAULT '',
    `email` VARCHAR(191) NOT NULL DEFAULT '',
    `billingAddress` VARCHAR(500) NOT NULL DEFAULT '',
    `shippingAddress` VARCHAR(500) NOT NULL DEFAULT '',
    `stateCode` CHAR(2) NOT NULL,
    `shippingState` CHAR(2) NULL,
    `openingBalance` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `creditDays` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `party_companyId_name_idx`(`companyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `hsnSac` VARCHAR(191) NOT NULL DEFAULT '',
    `isService` BOOLEAN NOT NULL DEFAULT false,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'NOS',
    `salePrice` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `purchasePrice` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `gstRate` DECIMAL(5, 2) NOT NULL DEFAULT 18,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `product_companyId_name_idx`(`companyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `number_series` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `docType` ENUM('INVOICE', 'QUOTATION', 'CREDIT_NOTE', 'DEBIT_NOTE') NOT NULL,
    `fy` VARCHAR(5) NOT NULL,
    `prefix` VARCHAR(6) NOT NULL,
    `nextSeq` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `number_series_companyId_docType_fy_key`(`companyId`, `docType`, `fy`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `type` ENUM('INVOICE', 'QUOTATION', 'CREDIT_NOTE', 'DEBIT_NOTE') NOT NULL,
    `number` VARCHAR(16) NOT NULL,
    `fy` VARCHAR(5) NOT NULL,
    `seq` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `dueDate` DATE NULL,
    `status` ENUM('ISSUED', 'CANCELLED', 'OPEN', 'ACCEPTED', 'CONVERTED', 'EXPIRED') NOT NULL,
    `partyId` VARCHAR(191) NOT NULL,
    `partyName` VARCHAR(191) NOT NULL,
    `partyGstin` VARCHAR(191) NOT NULL DEFAULT '',
    `partyAddress` VARCHAR(500) NOT NULL DEFAULT '',
    `partyState` CHAR(2) NOT NULL,
    `shippingAddress` VARCHAR(500) NOT NULL DEFAULT '',
    `seller` JSON NOT NULL,
    `placeOfSupply` CHAR(2) NOT NULL,
    `isInterstate` BOOLEAN NOT NULL,
    `reverseCharge` BOOLEAN NOT NULL DEFAULT false,
    `pricesIncludeTax` BOOLEAN NOT NULL DEFAULT false,
    `taxableTotal` DECIMAL(14, 2) NOT NULL,
    `cgst` DECIMAL(14, 2) NOT NULL,
    `sgst` DECIMAL(14, 2) NOT NULL,
    `igst` DECIMAL(14, 2) NOT NULL,
    `roundOff` DECIMAL(6, 2) NOT NULL,
    `grandTotal` DECIMAL(14, 2) NOT NULL,
    `originalDocId` VARCHAR(191) NULL,
    `convertedToId` VARCHAR(191) NULL,
    `noteReason` VARCHAR(191) NOT NULL DEFAULT '',
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `document_companyId_type_date_idx`(`companyId`, `type`, `date`),
    INDEX `document_partyId_idx`(`partyId`),
    UNIQUE INDEX `document_companyId_type_fy_seq_key`(`companyId`, `type`, `fy`, `seq`),
    UNIQUE INDEX `document_companyId_type_number_key`(`companyId`, `type`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_item` (
    `id` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `productId` VARCHAR(191) NULL,
    `description` VARCHAR(191) NOT NULL,
    `hsnSac` VARCHAR(191) NOT NULL DEFAULT '',
    `unit` VARCHAR(191) NOT NULL DEFAULT 'NOS',
    `qty` DECIMAL(14, 3) NOT NULL,
    `rate` DECIMAL(14, 4) NOT NULL,
    `discountPct` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `gstRate` DECIMAL(5, 2) NOT NULL,
    `taxable` DECIMAL(14, 2) NOT NULL,
    `cgst` DECIMAL(14, 2) NOT NULL,
    `sgst` DECIMAL(14, 2) NOT NULL,
    `igst` DECIMAL(14, 2) NOT NULL,
    `total` DECIMAL(14, 2) NOT NULL,

    INDEX `document_item_documentId_idx`(`documentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_bill` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `billNumber` VARCHAR(191) NOT NULL,
    `billDate` DATE NOT NULL,
    `dueDate` DATE NULL,
    `partyId` VARCHAR(191) NOT NULL,
    `partyName` VARCHAR(191) NOT NULL,
    `partyGstin` VARCHAR(191) NOT NULL DEFAULT '',
    `partyState` CHAR(2) NOT NULL,
    `placeOfSupply` CHAR(2) NOT NULL,
    `isInterstate` BOOLEAN NOT NULL,
    `reverseCharge` BOOLEAN NOT NULL DEFAULT false,
    `itcType` ENUM('ELIGIBLE', 'INELIGIBLE', 'CAPITAL_GOODS') NOT NULL DEFAULT 'ELIGIBLE',
    `taxableTotal` DECIMAL(14, 2) NOT NULL,
    `cgst` DECIMAL(14, 2) NOT NULL,
    `sgst` DECIMAL(14, 2) NOT NULL,
    `igst` DECIMAL(14, 2) NOT NULL,
    `roundOff` DECIMAL(6, 2) NOT NULL,
    `grandTotal` DECIMAL(14, 2) NOT NULL,
    `notes` TEXT NULL,
    `cancelled` BOOLEAN NOT NULL DEFAULT false,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `purchase_bill_companyId_billDate_idx`(`companyId`, `billDate`),
    UNIQUE INDEX `purchase_bill_companyId_partyId_billNumber_key`(`companyId`, `partyId`, `billNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_item` (
    `id` VARCHAR(191) NOT NULL,
    `billId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `productId` VARCHAR(191) NULL,
    `description` VARCHAR(191) NOT NULL,
    `hsnSac` VARCHAR(191) NOT NULL DEFAULT '',
    `unit` VARCHAR(191) NOT NULL DEFAULT 'NOS',
    `qty` DECIMAL(14, 3) NOT NULL,
    `rate` DECIMAL(14, 4) NOT NULL,
    `discountPct` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `gstRate` DECIMAL(5, 2) NOT NULL,
    `taxable` DECIMAL(14, 2) NOT NULL,
    `cgst` DECIMAL(14, 2) NOT NULL,
    `sgst` DECIMAL(14, 2) NOT NULL,
    `igst` DECIMAL(14, 2) NOT NULL,
    `total` DECIMAL(14, 2) NOT NULL,

    INDEX `purchase_item_billId_idx`(`billId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `partyId` VARCHAR(191) NOT NULL,
    `direction` ENUM('RECEIVED', 'PAID') NOT NULL,
    `date` DATE NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `mode` ENUM('CASH', 'UPI', 'BANK', 'CHEQUE', 'CARD', 'OTHER') NOT NULL DEFAULT 'BANK',
    `reference` VARCHAR(191) NOT NULL DEFAULT '',
    `notes` TEXT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `payment_companyId_date_idx`(`companyId`, `date`),
    INDEX `payment_partyId_idx`(`partyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_allocation` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `documentId` VARCHAR(191) NULL,
    `purchaseBillId` VARCHAR(191) NULL,
    `amount` DECIMAL(14, 2) NOT NULL,

    INDEX `payment_allocation_paymentId_idx`(`paymentId`),
    INDEX `payment_allocation_documentId_idx`(`documentId`),
    INDEX `payment_allocation_purchaseBillId_idx`(`purchaseBillId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `session` ADD CONSTRAINT `session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account` ADD CONSTRAINT `account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membership` ADD CONSTRAINT `membership_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membership` ADD CONSTRAINT `membership_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitation` ADD CONSTRAINT `invitation_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `party` ADD CONSTRAINT `party_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product` ADD CONSTRAINT `product_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `number_series` ADD CONSTRAINT `number_series_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document` ADD CONSTRAINT `document_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document` ADD CONSTRAINT `document_partyId_fkey` FOREIGN KEY (`partyId`) REFERENCES `party`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document` ADD CONSTRAINT `document_originalDocId_fkey` FOREIGN KEY (`originalDocId`) REFERENCES `document`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_item` ADD CONSTRAINT `document_item_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `document`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_bill` ADD CONSTRAINT `purchase_bill_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_bill` ADD CONSTRAINT `purchase_bill_partyId_fkey` FOREIGN KEY (`partyId`) REFERENCES `party`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_item` ADD CONSTRAINT `purchase_item_billId_fkey` FOREIGN KEY (`billId`) REFERENCES `purchase_bill`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment` ADD CONSTRAINT `payment_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment` ADD CONSTRAINT `payment_partyId_fkey` FOREIGN KEY (`partyId`) REFERENCES `party`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_allocation` ADD CONSTRAINT `payment_allocation_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_allocation` ADD CONSTRAINT `payment_allocation_documentId_fkey` FOREIGN KEY (`documentId`) REFERENCES `document`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_allocation` ADD CONSTRAINT `payment_allocation_purchaseBillId_fkey` FOREIGN KEY (`purchaseBillId`) REFERENCES `purchase_bill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
