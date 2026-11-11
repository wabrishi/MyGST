-- One user can OWN at most one company (they may still be Accountant/Staff elsewhere).

-- AlterTable
ALTER TABLE `membership` ADD COLUMN `ownerKey` VARCHAR(191) NULL;

-- Backfill: existing owners get ownerKey = userId.
-- If a user already owns several companies, only their earliest ownership keeps the key;
-- the others are downgraded to ACCOUNTANT so the unique index can be created.
UPDATE `membership` m
JOIN (
  SELECT userId, MIN(createdAt) AS firstAt FROM `membership` WHERE role = 'OWNER' GROUP BY userId
) f ON f.userId = m.userId
SET m.role = IF(m.createdAt = f.firstAt, 'OWNER', 'ACCOUNTANT')
WHERE m.role = 'OWNER';

UPDATE `membership` SET `ownerKey` = `userId` WHERE role = 'OWNER';

-- CreateIndex
CREATE UNIQUE INDEX `membership_ownerKey_key` ON `membership`(`ownerKey`);
