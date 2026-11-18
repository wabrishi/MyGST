-- AlterTable
ALTER TABLE `document` MODIFY `type` ENUM('INVOICE', 'QUOTATION', 'CREDIT_NOTE', 'DEBIT_NOTE', 'PURCHASE_ORDER') NOT NULL;

-- AlterTable
ALTER TABLE `number_series` MODIFY `docType` ENUM('INVOICE', 'QUOTATION', 'CREDIT_NOTE', 'DEBIT_NOTE', 'PURCHASE_ORDER') NOT NULL;

-- AlterTable
ALTER TABLE `purchase_bill` ADD COLUMN `purchaseOrderId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `purchase_item` ADD COLUMN `poItemId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `purchase_order` (
    `id` VARCHAR(191) NOT NULL,
    `companyId` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `fy` VARCHAR(5) NOT NULL,
    `seq` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `expectedDate` DATE NULL,
    `partyId` VARCHAR(191) NOT NULL,
    `partyName` VARCHAR(191) NOT NULL,
    `partyGstin` VARCHAR(191) NOT NULL DEFAULT '',
    `partyAddress` VARCHAR(1000) NOT NULL DEFAULT '',
    `partyState` CHAR(2) NOT NULL,
    `placeOfSupply` CHAR(2) NOT NULL,
    `isInterstate` BOOLEAN NOT NULL,
    `pricesIncludeTax` BOOLEAN NOT NULL DEFAULT false,
    `deliveryAddress` VARCHAR(1000) NOT NULL DEFAULT '',
    `paymentTerms` VARCHAR(200) NOT NULL DEFAULT '',
    `notes` TEXT NULL,
    `status` ENUM('OPEN', 'PARTIAL', 'BILLED', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
    `taxableTotal` DECIMAL(14, 2) NOT NULL,
    `cgst` DECIMAL(14, 2) NOT NULL,
    `sgst` DECIMAL(14, 2) NOT NULL,
    `igst` DECIMAL(14, 2) NOT NULL,
    `roundOff` DECIMAL(6, 2) NOT NULL,
    `grandTotal` DECIMAL(14, 2) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `cancelledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `purchase_order_companyId_date_idx`(`companyId`, `date`),
    INDEX `purchase_order_companyId_status_idx`(`companyId`, `status`),
    UNIQUE INDEX `purchase_order_companyId_number_key`(`companyId`, `number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_order_item` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL,
    `productId` VARCHAR(191) NULL,
    `description` VARCHAR(300) NOT NULL,
    `hsnSac` VARCHAR(191) NOT NULL DEFAULT '',
    `unit` VARCHAR(191) NOT NULL DEFAULT 'NOS',
    `qty` DECIMAL(14, 3) NOT NULL,
    `billedQty` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `rate` DECIMAL(14, 4) NOT NULL,
    `discountPct` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `gstRate` DECIMAL(5, 2) NOT NULL,
    `taxable` DECIMAL(14, 2) NOT NULL,
    `cgst` DECIMAL(14, 2) NOT NULL,
    `sgst` DECIMAL(14, 2) NOT NULL,
    `igst` DECIMAL(14, 2) NOT NULL,
    `total` DECIMAL(14, 2) NOT NULL,

    INDEX `purchase_order_item_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `purchase_item_poItemId_idx` ON `purchase_item`(`poItemId`);

-- AddForeignKey
ALTER TABLE `purchase_bill` ADD CONSTRAINT `purchase_bill_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `purchase_order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_item` ADD CONSTRAINT `purchase_item_poItemId_fkey` FOREIGN KEY (`poItemId`) REFERENCES `purchase_order_item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_partyId_fkey` FOREIGN KEY (`partyId`) REFERENCES `party`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_order_item` ADD CONSTRAINT `purchase_order_item_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `purchase_order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

