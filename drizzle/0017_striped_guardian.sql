CREATE TABLE `customerCaseIntegrityAnchors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`merchantOpenId` varchar(64) NOT NULL,
	`customerCaseId` int NOT NULL,
	`anchorType` enum('audit_export','packet_release','document_checksum','verified_webhook') NOT NULL,
	`sourceRecordId` varchar(128) NOT NULL,
	`payloadHash` varchar(128) NOT NULL,
	`previousChainHash` varchar(128),
	`chainHash` varchar(128) NOT NULL,
	`anchorVersion` varchar(32) NOT NULL,
	`createdBy` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customerCaseIntegrityAnchors_id` PRIMARY KEY(`id`),
	CONSTRAINT `customerCaseIntegrityAnchors_chainHash_unique` UNIQUE(`chainHash`),
	CONSTRAINT `customerCaseIntegrityAnchors_case_type_source_unique` UNIQUE(`customerCaseId`,`anchorType`,`sourceRecordId`)
);
