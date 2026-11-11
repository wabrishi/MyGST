-- CreateTable
CREATE TABLE `backup_target` (
    `id` VARCHAR(191) NOT NULL,
    `scopeKey` VARCHAR(191) NOT NULL,
    `scope` ENUM('PLATFORM', 'COMPANY') NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `provider` VARCHAR(191) NOT NULL DEFAULT 'GOOGLE_DRIVE',
    `accountEmail` VARCHAR(191) NOT NULL,
    `refreshTokenEnc` TEXT NOT NULL,
    `folderId` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `retentionDays` INTEGER NOT NULL DEFAULT 30,
    `connectedById` VARCHAR(191) NOT NULL,
    `runningSince` DATETIME(3) NULL,
    `lastSuccessAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `backup_target_scopeKey_key`(`scopeKey`),
    INDEX `backup_target_companyId_idx`(`companyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `backup_run` (
    `id` VARCHAR(191) NOT NULL,
    `targetId` VARCHAR(191) NOT NULL,
    `trigger` VARCHAR(191) NOT NULL,
    `status` ENUM('RUNNING', 'SUCCESS', 'FAILED') NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `fileName` VARCHAR(191) NULL,
    `fileId` VARCHAR(191) NULL,
    `sizeBytes` INTEGER NULL,
    `deleted` INTEGER NOT NULL DEFAULT 0,
    `error` TEXT NULL,

    INDEX `backup_run_targetId_startedAt_idx`(`targetId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `backup_target` ADD CONSTRAINT `backup_target_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `backup_run` ADD CONSTRAINT `backup_run_targetId_fkey` FOREIGN KEY (`targetId`) REFERENCES `backup_target`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
