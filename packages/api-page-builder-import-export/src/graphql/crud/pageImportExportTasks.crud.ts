import mdbid from "mdbid";
import { string, withFields } from "@commodo/fields";
import { object } from "commodo-fields-object";
import { validation } from "@webiny/validation";
import { ContextPlugin } from "@webiny/handler/plugins/ContextPlugin";
import defaults from "@webiny/api-page-builder/graphql/crud/utils/defaults";
import getPKPrefix from "@webiny/api-page-builder/graphql/crud/utils/getPKPrefix";
import checkBasePermissions from "@webiny/api-page-builder/graphql/crud/utils/checkBasePermissions";
import checkOwnPermissions from "@webiny/api-page-builder/graphql/crud/utils/checkOwnPermissions";
import { NotFoundError } from "@webiny/handler-graphql";
import { PageImportExportTask, PageImportExportTaskStatus } from "~/types";
import { PbPageImportExportContext } from "~/graphql/types";

const validStatus = `${PageImportExportTaskStatus.PENDING}:${PageImportExportTaskStatus.PROCESSING}:${PageImportExportTaskStatus.COMPLETED}:${PageImportExportTaskStatus.FAILED}`;

const CreateDataModel = withFields({
    status: string({
        validation: validation.create(`required,in:${validStatus}`)
    }),
    data: object(),
    input: object(),
    stats: object(),
    error: object()
})();

const UpdateDataModel = withFields({
    status: string({
        validation: validation.create(`in:${validStatus}`)
    }),
    data: object(),
    input: object(),
    stats: object(),
    error: object()
})();

const TYPE = "pb.exportPageTask";
const PERMISSION_NAME = "pb.page";
const PAGE_IMPORT_EXPORT_TASK = "PIET";
const SUB_TASK = "SUB";

export default new ContextPlugin<PbPageImportExportContext>(context => {
    const { db } = context;

    const PK = taskId => `${getPKPrefix(context)}${PAGE_IMPORT_EXPORT_TASK}#${taskId}`;
    const SK = id => `${SUB_TASK}#${id}`;

    // Modify context
    context.pageBuilder.pageImportExportTask = {
        async get(id) {
            const permission = await checkBasePermissions(context, PERMISSION_NAME, {
                rwd: "r"
            });

            const [[task]] = await db.read<PageImportExportTask>({
                ...defaults.db,
                query: { PK: PK(id), SK: "A" },
                limit: 1
            });

            if (!task) {
                return null;
            }

            const identity = context.security.getIdentity();
            checkOwnPermissions(identity, permission, task);

            return task;
        },

        async list() {
            const permission = await checkBasePermissions(context, PERMISSION_NAME, {
                rwd: "r"
            });

            const [task] = await db.read<PageImportExportTask>({
                ...defaults.db,
                query: { PK: { $beginsWith: PK("") }, SK: "A" }
            });

            // If user can only manage own records, let's check if he owns the loaded one.
            if (permission.own) {
                const identity = context.security.getIdentity();
                return task.filter(item => item.createdBy.id === identity.id);
            }

            return task;
        },

        async create(data) {
            await checkBasePermissions(context, PERMISSION_NAME, { rwd: "w" });

            const createDataModel = new CreateDataModel().populate(data);
            await createDataModel.validate();

            const id = mdbid();
            const identity = context.security.getIdentity();

            const createData = Object.assign(await createDataModel.toJSON(), {
                PK: PK(id),
                SK: "A",
                TYPE,
                tenant: context.tenancy.getCurrentTenant().id,
                locale: context.i18nContent.getLocale().code,
                id,
                createdOn: new Date().toISOString(),
                createdBy: {
                    id: identity.id,
                    type: identity.type,
                    displayName: identity.displayName
                }
            });

            await db.create({ ...defaults.db, data: createData });

            return createData;
        },

        async update(id, data) {
            const permission = await checkBasePermissions(context, PERMISSION_NAME, {
                rwd: "w"
            });
            const task = await this.get(id);
            if (!task) {
                throw new NotFoundError(`ExportPageTask "${id}" not found.`);
            }

            const identity = context.security.getIdentity();
            checkOwnPermissions(identity, permission, task);

            const updateDataModel = new UpdateDataModel().populate(data);
            await updateDataModel.validate();

            const updateData = await updateDataModel.toJSON({ onlyDirty: true });

            await db.update({
                ...defaults.db,
                query: { PK: PK(id), SK: "A" },
                data: updateData
            });

            return { ...task, ...updateData };
        },

        async delete(id) {
            const permission = await checkBasePermissions(context, PERMISSION_NAME, {
                rwd: "d"
            });

            const exportPageTask = await this.get(id);
            if (!exportPageTask) {
                throw new NotFoundError(`ExportPageTask "${id}" not found.`);
            }

            const identity = context.security.getIdentity();
            checkOwnPermissions(identity, permission, exportPageTask);

            await db.delete({
                ...defaults.db,
                query: { PK: PK(id), SK: "A" }
            });

            return exportPageTask;
        },

        async createSubTask(id, subTaskId, data) {
            await checkBasePermissions(context, PERMISSION_NAME, { rwd: "w" });

            const createDataModel = new CreateDataModel().populate(data);
            await createDataModel.validate();

            const identity = context.security.getIdentity();

            const createData = Object.assign(await createDataModel.toJSON(), {
                PK: PK(id),
                SK: SK(subTaskId),
                // Using GSI
                GSI1_PK: PK(id),
                GSI1_SK: createDataModel.status,
                TYPE,
                tenant: context.tenancy.getCurrentTenant().id,
                locale: context.i18nContent.getLocale().code,
                id: subTaskId,
                createdOn: new Date().toISOString(),
                createdBy: {
                    id: identity.id,
                    type: identity.type,
                    displayName: identity.displayName
                }
            });

            await db.create({ ...defaults.db, data: createData });

            return createData;
        },

        async updateSubTask(id, subTaskId, data) {
            const permission = await checkBasePermissions(context, PERMISSION_NAME, {
                rwd: "w"
            });
            const task = await this.getSubTask(id, subTaskId);
            if (!task) {
                throw new NotFoundError(`ExportPageTask "${id}" not found.`);
            }

            const identity = context.security.getIdentity();
            checkOwnPermissions(identity, permission, task);

            const updateDataModel = new UpdateDataModel().populate(data);
            await updateDataModel.validate();

            const updateData = await updateDataModel.toJSON({ onlyDirty: true });

            await db.update({
                ...defaults.db,
                query: { PK: PK(id), SK: SK(subTaskId) },
                data: {
                    ...updateData,
                    // Using GSI
                    GSI1_SK: updateData.status
                }
            });

            return { ...task, ...updateData };
        },

        async getSubTask(id, subTaskId) {
            const permission = await checkBasePermissions(context, PERMISSION_NAME, {
                rwd: "r"
            });

            const [[task]] = await db.read<PageImportExportTask>({
                ...defaults.db,
                query: { PK: PK(id), SK: SK(subTaskId) },
                limit: 1
            });

            if (!task) {
                return null;
            }

            const identity = context.security.getIdentity();
            checkOwnPermissions(identity, permission, task);

            return task;
        },

        async getSubTaskByStatus(id, status, limit) {
            await checkBasePermissions(context, PERMISSION_NAME, {
                rwd: "r"
            });

            const [tasks] = await db.read<PageImportExportTask>({
                ...defaults.db,
                query: { GSI1_PK: PK(id), GSI1_SK: status },
                limit: limit
            });

            if (!tasks) {
                return null;
            }

            return tasks;
        }
    };
});