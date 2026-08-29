CREATE TABLE `customerCaseEscalations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerCaseId` int NOT NULL,
	`merchantOpenId` varchar(64) NOT NULL,
	`ownerLabel` varchar(120) NOT NULL DEFAULT 'Merchant review',
	`level` enum('watch','review','elevated','resolved') NOT NULL DEFAULT 'watch',
	`escalationNote` text NOT NULL,
	`assignedBy` varchar(64) NOT NULL,
	`acknowledgedAt` timestamp,
	`resolvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customerCaseEscalations_id` PRIMARY KEY(`id`),
	CONSTRAINT `customerCaseEscalations_customerCaseId_unique` UNIQUE(`customerCaseId`)
);
