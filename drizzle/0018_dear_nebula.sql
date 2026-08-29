CREATE TABLE `customerCaseIntegrityHeads` (
	`customerCaseId` int NOT NULL,
	`merchantOpenId` varchar(64) NOT NULL,
	`headChainHash` varchar(128),
	`anchorCount` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customerCaseIntegrityHeads_customerCaseId` PRIMARY KEY(`customerCaseId`),
	CONSTRAINT `customerCaseIntegrityHeads_merchant_case_unique` UNIQUE(`merchantOpenId`,`customerCaseId`)
);
