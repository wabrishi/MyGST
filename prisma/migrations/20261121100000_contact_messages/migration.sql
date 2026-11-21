-- CreateTable
CREATE TABLE `contact_message` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(160) NOT NULL,
    `phone` VARCHAR(30) NOT NULL DEFAULT '',
    `company` VARCHAR(160) NOT NULL DEFAULT '',
    `topic` VARCHAR(20) NOT NULL,
    `message` TEXT NOT NULL,
    `ip` VARCHAR(64) NOT NULL DEFAULT '',
    `userAgent` VARCHAR(300) NOT NULL DEFAULT '',
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contact_message_createdAt_idx`(`createdAt`),
    INDEX `contact_message_ip_createdAt_idx`(`ip`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

