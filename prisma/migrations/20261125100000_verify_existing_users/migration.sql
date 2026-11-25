-- Email verification is now required for new accounts: treat everyone who already has an account as verified.
UPDATE `user` SET `emailVerified` = true WHERE `emailVerified` = false;
