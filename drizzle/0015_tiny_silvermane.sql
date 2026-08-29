CREATE TABLE `customerCaseAuditExports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerCaseId` int NOT NULL,
	`merchantOpenId` varchar(64) NOT NULL,
	`approvedBy` varchar(64) NOT NULL,
	`approvalPhrase` varchar(128) NOT NULL,
	`exportVersion` varchar(32) NOT NULL,
	`exportHash` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customerCaseAuditExports_id` PRIMARY KEY(`id`)
);
