import { DynamoDBTypes } from "dynamodb-toolbox/dist/classes/Table";
import {
    EntityAttributeConfig,
    EntityCompositeAttributes
} from "dynamodb-toolbox/dist/classes/Entity";
import { DocumentClient } from "aws-sdk/clients/dynamodb";
import { PageImportExportTaskStorageOperations } from "@webiny/api-page-builder-import-export/types";

export type AttributeDefinition = DynamoDBTypes | EntityAttributeConfig | EntityCompositeAttributes;

export type Attributes = Record<string, AttributeDefinition>;

export interface PartitionKeyOptions {
    tenant: string;
    locale: string;
    id?: string;
}

export interface CreateStorageOperations {
    (params: {
        documentClient: DocumentClient;
        table?: string;
        attributes?: Attributes;
    }): PageImportExportTaskStorageOperations;
}
