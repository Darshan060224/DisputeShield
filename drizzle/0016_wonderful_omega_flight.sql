CREATE TABLE `merchantTeamMemberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantOpenId` varchar(64) NOT NULL,
	`memberOpenId` varchar(64) NOT NULL,
	`role` enum('viewer','reviewer','approver') NOT NULL DEFAULT 'viewer',
	`active` boolean NOT NULL DEFAULT true,
	`addedBy` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `merchantTeamMemberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `merchantTeamMemberships_merchant_member_unique` UNIQUE(`merchantOpenId`,`memberOpenId`)
);
