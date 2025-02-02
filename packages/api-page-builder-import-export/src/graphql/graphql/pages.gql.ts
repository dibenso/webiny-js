import { GraphQLSchemaPlugin } from "@webiny/handler-graphql/types";
import { PageExportRevisionType } from "~/types";
import { PbPageImportExportContext } from "../types";
import resolve from "./utils/resolve";

const plugin: GraphQLSchemaPlugin<PbPageImportExportContext> = {
    type: "graphql-schema",
    schema: {
        typeDefs: /* GraphQL */ `
            type PbExportPageData {
                task: PbPageImportExportTask
            }

            type PbExportPageResponse {
                data: PbExportPageData
                error: PbError
            }

            type PbImportPageData {
                task: PbPageImportExportTask
            }

            type PbImportPageResponse {
                data: PbImportPageData
                error: PbError
            }

            enum PbExportPageRevisionType {
                published
                latest
            }

            input PbImportPageInput {
                zipFileKey: String
                zipFileUrl: String
            }

            extend type PbMutation {
                # Export pages
                exportPages(
                    ids: [ID]!
                    revisionType: PbExportPageRevisionType
                ): PbExportPageResponse

                # Import pages
                importPages(category: String!, data: PbImportPageInput!): PbImportPageResponse
            }
        `,
        resolvers: {
            PbMutation: {
                exportPages: async (
                    _,
                    args: { ids: string[]; revisionType: PageExportRevisionType },
                    context
                ) => {
                    return resolve(() =>
                        context.pageBuilder.pages.exportPages(args.ids, args.revisionType)
                    );
                },

                importPages: async (
                    _,
                    args: { category: string; data: Record<string, any> },
                    context
                ) => {
                    return resolve(() =>
                        context.pageBuilder.pages.importPages(args.category, args.data)
                    );
                }
            }
        }
    }
};

export default plugin;
