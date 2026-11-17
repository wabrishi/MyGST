-- RBAC (company + platform roles, several roles per user), platform audit log, system state,
-- disabled users and uploaded plugins. Existing single roles are converted, then the old columns dropped.

-- CreateTable
CREATE TABLE `company_role` (
    `id` VARCHAR(64) NOT NULL,
    `companyId` VARCHAR(191) NULL,
    `key` VARCHAR(20) NULL,
    `name` VARCHAR(60) NOT NULL,
    `description` VARCHAR(200) NULL,
    `permissions` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `company_role_companyId_name_key`(`companyId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `membership_role` (
    `membershipId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(64) NOT NULL,

    INDEX `membership_role_roleId_idx`(`roleId`),
    PRIMARY KEY (`membershipId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_role` (
    `id` VARCHAR(64) NOT NULL,
    `key` VARCHAR(20) NULL,
    `name` VARCHAR(60) NOT NULL,
    `description` VARCHAR(200) NULL,
    `permissions` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `platform_role_key_key`(`key`),
    UNIQUE INDEX `platform_role_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_role_assignment` (
    `userId` VARCHAR(191) NOT NULL,
    `roleId` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `platform_role_assignment_roleId_idx`(`roleId`),
    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_audit_log` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `actorEmail` VARCHAR(191) NOT NULL,
    `action` VARCHAR(60) NOT NULL,
    `targetType` VARCHAR(30) NOT NULL,
    `targetId` VARCHAR(191) NULL,
    `data` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `platform_audit_log_createdAt_idx`(`createdAt`),
    INDEX `platform_audit_log_actorId_createdAt_idx`(`actorId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_state` (
    `key` VARCHAR(64) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Built-in roles (their permissions are defined in code).
INSERT INTO `company_role` (`id`, `companyId`, `key`, `name`, `description`) VALUES
  ('role_owner', NULL, 'OWNER', 'Owner', 'Everything, including settings, users and roles.'),
  ('role_accountant', NULL, 'ACCOUNTANT', 'Accountant', 'Billing, payments, purchases and reports.'),
  ('role_staff', NULL, 'STAFF', 'Staff', 'Create invoices, quotations and masters.');

INSERT INTO `platform_role` (`id`, `key`, `name`, `description`) VALUES
  ('prole_super_admin', 'SUPER_ADMIN', 'Super admin', 'Everything in the admin panel.'),
  ('prole_support', 'SUPPORT', 'Support', 'Look up companies and users, help with sign-in, read the audit log.'),
  ('prole_viewer', 'VIEWER', 'Viewer', 'Read-only dashboard, companies and system health.');

-- Convert existing single roles.
INSERT INTO `membership_role` (`membershipId`, `roleId`)
  SELECT `id`, CASE `role` WHEN 'OWNER' THEN 'role_owner' WHEN 'ACCOUNTANT' THEN 'role_accountant' ELSE 'role_staff' END FROM `membership`;

ALTER TABLE `invitation` ADD COLUMN `roleIds` JSON NULL;
UPDATE `invitation` SET `roleIds` = JSON_ARRAY(CASE `role` WHEN 'OWNER' THEN 'role_owner' WHEN 'ACCOUNTANT' THEN 'role_accountant' ELSE 'role_staff' END);
ALTER TABLE `invitation` MODIFY `roleIds` JSON NOT NULL;
ALTER TABLE `invitation` DROP COLUMN `role`;

-- AlterTable
ALTER TABLE `membership` DROP COLUMN `role`;

-- AlterTable
ALTER TABLE `plugin` ADD COLUMN `bundle` LONGTEXT NULL,
    ADD COLUMN `bundleSha256` VARCHAR(64) NULL,
    ADD COLUMN `uploadedBy` VARCHAR(191) NULL,
    MODIFY `kind` ENUM('CODE', 'EXTERNAL', 'UPLOADED') NOT NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `disabledAt` DATETIME(3) NULL;

-- AddForeignKey
ALTER TABLE `company_role` ADD CONSTRAINT `company_role_companyId_fkey` FOREIGN KEY (`companyId`) REFERENCES `company`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membership_role` ADD CONSTRAINT `membership_role_membershipId_fkey` FOREIGN KEY (`membershipId`) REFERENCES `membership`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membership_role` ADD CONSTRAINT `membership_role_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `company_role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_role_assignment` ADD CONSTRAINT `platform_role_assignment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `platform_role_assignment` ADD CONSTRAINT `platform_role_assignment_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `platform_role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
