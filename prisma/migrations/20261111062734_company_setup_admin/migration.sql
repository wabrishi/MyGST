-- AlterTable
ALTER TABLE `company` ADD COLUMN `createdVia` VARCHAR(191) NOT NULL DEFAULT 'SIGNUP',
    ADD COLUMN `setupCompletedAt` DATETIME(3) NULL,
    ADD COLUMN `suspendedAt` DATETIME(3) NULL;
