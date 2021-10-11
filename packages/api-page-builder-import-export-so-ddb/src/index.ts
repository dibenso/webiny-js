import {
    PageImportExportTask,
    PageImportExportTaskStatus,
    PageImportExportTaskStorageOperationsCreateParams,
    PageImportExportTaskStorageOperationsCreateSubTaskParams,
    PageImportExportTaskStorageOperationsDeleteParams,
    PageImportExportTaskStorageOperationsGetParams,
    PageImportExportTaskStorageOperationsGetSubTaskParams,
    PageImportExportTaskStorageOperationsListParams,
    PageImportExportTaskStorageOperationsListResponse,
    PageImportExportTaskStorageOperationsListSubTaskParams,
    PageImportExportTaskStorageOperationsListSubTaskResponse,
    PageImportExportTaskStorageOperationsUpdateParams,
    PageImportExportTaskStorageOperationsUpdateSubTaskParams
} from "@webiny/api-page-builder-import-export/types";
import { cleanupItem } from "@webiny/db-dynamodb/utils/cleanup";
import WebinyError from "@webiny/error";
import { queryAll, QueryAllParams } from "@webiny/db-dynamodb/utils/query";
import { createListResponse } from "@webiny/db-dynamodb/utils/listResponse";
import { createTable } from "~/definitions/table";
import { createPageImportExportTaskEntity } from "~/definitions/pageImportExportTaskEntity";
import { CreateStorageOperations, PartitionKeyOptions } from "./types";

export const createStorageOperations: CreateStorageOperations = params => {
    const { table: tableName, documentClient, attributes = {} } = params;

    const table = createTable({ table: tableName, documentClient });

    const entity = createPageImportExportTaskEntity({
        entityName: "PageImportExportTask",
        table,
        attributes
    });

    const PARENT_TASK_GSI1_PK = "PB#IE_TASKS";

    return {
        getTable() {
            return table;
        },
        getEntity() {
            return entity;
        },
        createPartitionKey({ tenant, locale, id }: PartitionKeyOptions): string {
            return `T#${tenant}#L#${locale}#PB#IE_TASK#${id}`;
        },

        createSortKey(input: string): string {
            return `SUB#${input}`;
        },

        createGsiPartitionKey({ tenant, locale, id }: PartitionKeyOptions): string {
            return `T#${tenant}#L#${locale}#PB#IE_TASK#${id}`;
        },

        createGsiSortKey(status: PageImportExportTaskStatus, id: string): string {
            return `S#${status}#${id}`;
        },

        createType(): string {
            return "pb.pageImportExportTask";
        },
        async get(
            params: PageImportExportTaskStorageOperationsGetParams
        ): Promise<PageImportExportTask | null> {
            const { where } = params;

            const keys = {
                PK: this.createPartitionKey(where),
                SK: "A"
            };

            try {
                const result = await entity.get(keys);
                if (!result || !result.Item) {
                    return null;
                }
                return cleanupItem(entity, result.Item);
            } catch (ex) {
                throw new WebinyError(
                    ex.message || "Could not load page element by given parameters.",
                    ex.code || "PAGE_IMPORT_EXPORT_TASK_GET_ERROR",
                    {
                        where
                    }
                );
            }
        },

        async list(
            params: PageImportExportTaskStorageOperationsListParams
        ): Promise<PageImportExportTaskStorageOperationsListResponse> {
            const { limit } = params;

            const queryAllParams: QueryAllParams = {
                entity: entity,
                partitionKey: PARENT_TASK_GSI1_PK,
                options: {
                    beginsWith: "",
                    index: "GSI1",
                    limit: limit || undefined
                }
            };

            let results: PageImportExportTask[] = [];

            try {
                results = await queryAll<PageImportExportTask>(queryAllParams);
            } catch (ex) {
                throw new WebinyError(
                    ex.message || "Could not list page import export tasks by given parameters.",
                    ex.code || "PAGE_IMPORT_EXPORT_TASKS_LIST_ERROR",
                    {
                        partitionKey: queryAllParams.partitionKey,
                        options: queryAllParams.options
                    }
                );
            }

            const items = results.map(item => cleanupItem<PageImportExportTask>(entity, item));

            // TODO: Implement sort and filter

            return createListResponse({
                items: items,
                limit,
                totalCount: items.length,
                after: null
            });
        },

        async create(
            params: PageImportExportTaskStorageOperationsCreateParams
        ): Promise<PageImportExportTask> {
            const { pageImportExportTask } = params;

            const keys = {
                PK: this.createPartitionKey({
                    tenant: pageImportExportTask.tenant,
                    locale: pageImportExportTask.locale,
                    id: pageImportExportTask.id
                }),
                SK: "A",
                GSI1_PK: PARENT_TASK_GSI1_PK,
                GSI1_SK: pageImportExportTask.createdOn
            };

            try {
                await entity.put({
                    ...pageImportExportTask,
                    TYPE: this.createType(),
                    ...keys
                });
                return pageImportExportTask;
            } catch (ex) {
                throw new WebinyError(
                    ex.message || "Could not create pageImportExportTask.",
                    ex.code || "PAGE_IMPORT_EXPORT_TASK_CREATE_ERROR",
                    {
                        keys,
                        pageImportExportTask: pageImportExportTask
                    }
                );
            }
        },

        async update(
            params: PageImportExportTaskStorageOperationsUpdateParams
        ): Promise<PageImportExportTask> {
            const { pageImportExportTask, original } = params;
            const keys = {
                PK: this.createPartitionKey({
                    tenant: pageImportExportTask.tenant,
                    locale: pageImportExportTask.locale,
                    id: pageImportExportTask.id
                }),
                SK: "A",
                GSI1_PK: PARENT_TASK_GSI1_PK,
                GSI1_SK: pageImportExportTask.createdOn
            };

            try {
                await entity.put({
                    ...pageImportExportTask,
                    TYPE: this.createType(),
                    ...keys
                });
                return pageImportExportTask;
            } catch (ex) {
                throw new WebinyError(
                    ex.message || "Could not update pageImportExportTask.",
                    ex.code || "PAGE_IMPORT_EXPORT_TASK_UPDATE_ERROR",
                    {
                        keys,
                        original,
                        pageImportExportTask
                    }
                );
            }
        },

        async delete(
            params: PageImportExportTaskStorageOperationsDeleteParams
        ): Promise<PageImportExportTask> {
            const { pageImportExportTask } = params;
            const keys = {
                PK: this.createPartitionKey({
                    tenant: pageImportExportTask.tenant,
                    locale: pageImportExportTask.locale,
                    id: pageImportExportTask.id
                }),
                SK: "A"
            };

            try {
                await entity.delete(keys);
                return pageImportExportTask;
            } catch (ex) {
                throw new WebinyError(
                    ex.message || "Could not delete pageImportExportTask.",
                    ex.code || "PAGE_IMPORT_EXPORT_TASK_DELETE_ERROR",
                    {
                        keys,
                        pageImportExportTask
                    }
                );
            }
        },

        async createSubTask(
            params: PageImportExportTaskStorageOperationsCreateSubTaskParams
        ): Promise<PageImportExportTask> {
            const { pageImportExportSubTask } = params;
            const pkParams = {
                tenant: pageImportExportSubTask.tenant,
                locale: pageImportExportSubTask.locale,
                id: pageImportExportSubTask.parent
            };
            const keys = {
                PK: this.createPartitionKey(pkParams),
                SK: this.createSortKey(pageImportExportSubTask.id),
                GSI1_PK: this.createGsiPartitionKey(pkParams),
                GSI1_SK: this.createGsiSortKey(
                    pageImportExportSubTask.status,
                    pageImportExportSubTask.id
                )
            };

            try {
                await entity.put({
                    ...pageImportExportSubTask,
                    TYPE: this.createType(),
                    ...keys
                });
                return pageImportExportSubTask;
            } catch (ex) {
                throw new WebinyError(
                    ex.message || "Could not create pageImportExportSubTask.",
                    ex.code || "CREATE_PAGE_IMPORT_EXPORT_SUB_TASK_ERROR",
                    {
                        keys,
                        pageImportExportSubTask
                    }
                );
            }
        },

        async updateSubTask(
            params: PageImportExportTaskStorageOperationsUpdateSubTaskParams
        ): Promise<PageImportExportTask> {
            const { pageImportExportSubTask, original } = params;
            const pkParams = {
                tenant: pageImportExportSubTask.tenant,
                locale: pageImportExportSubTask.locale,
                id: pageImportExportSubTask.parent
            };
            const keys = {
                PK: this.createPartitionKey(pkParams),
                SK: this.createSortKey(pageImportExportSubTask.id),
                GSI1_PK: this.createGsiPartitionKey(pkParams),
                GSI1_SK: this.createGsiSortKey(
                    pageImportExportSubTask.status,
                    pageImportExportSubTask.id
                )
            };

            try {
                await entity.put({
                    ...pageImportExportSubTask,
                    TYPE: this.createType(),
                    ...keys
                });
                return pageImportExportSubTask;
            } catch (ex) {
                throw new WebinyError(
                    ex.message || "Could not update pageImportExportSubTask.",
                    ex.code || "UPDATE_PAGE_IMPORT_EXPORT_SUB_TASK_ERROR",
                    {
                        keys,
                        original,
                        pageImportExportSubTask
                    }
                );
            }
        },

        async getSubTask(
            params: PageImportExportTaskStorageOperationsGetSubTaskParams
        ): Promise<PageImportExportTask | null> {
            const { where } = params;

            const keys = {
                PK: this.createPartitionKey({
                    tenant: where.tenant,
                    locale: where.locale,
                    id: where.parent
                }),
                SK: this.createSortKey(where.id)
            };
            try {
                const result = await entity.get(keys);
                if (!result || !result.Item) {
                    return null;
                }
                return cleanupItem(entity, result.Item);
            } catch (ex) {
                throw new WebinyError(
                    ex.message || "Could not load page import export subTask by given parameters.",
                    ex.code || "PAGE_IMPORT_EXPORT_TASK_GET_ERROR",
                    {
                        where
                    }
                );
            }
        },

        async listSubTasks(
            params: PageImportExportTaskStorageOperationsListSubTaskParams
        ): Promise<PageImportExportTaskStorageOperationsListSubTaskResponse> {
            const { where, limit } = params;

            const { tenant, locale, parent, status } = where;
            const queryAllParams: QueryAllParams = {
                entity: entity,
                partitionKey: this.createGsiPartitionKey({
                    tenant,
                    locale,
                    id: parent
                }),
                options: {
                    beginsWith: `S#${status}`,
                    limit: limit || undefined,
                    index: "GSI1"
                }
            };

            let results: PageImportExportTask[] = [];

            try {
                results = await queryAll<PageImportExportTask>(queryAllParams);
            } catch (ex) {
                throw new WebinyError(
                    ex.message || "Could not list page import export tasks by given parameters.",
                    ex.code || "LIST_PAGE_IMPORT_EXPORT_SUB_TASKS_ERROR",
                    {
                        partitionKey: queryAllParams.partitionKey,
                        options: queryAllParams.options
                    }
                );
            }

            const items = results.map(item => cleanupItem<PageImportExportTask>(entity, item));

            return createListResponse({
                items: items,
                limit,
                totalCount: items.length,
                after: null
            });
        }
    };
};