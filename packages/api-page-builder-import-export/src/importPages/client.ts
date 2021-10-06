import { PbPageImportExportContext } from "~/graphql/types";

export interface InvokeHandlerClientParams<TParams> {
    context: PbPageImportExportContext;
    name: string;
    payload: TParams;
}

export async function invokeHandlerClient<TParams>({
    context,
    name,
    payload
}: InvokeHandlerClientParams<TParams>) {
    /*
     * Prepare "invocationArgs", we're hacking our wat here.
     * They are necessary to setup the "context.pageBuilder" object among other things in IMPORT_PAGE_FUNCTION
     */
    const { request } = context.http;
    const invocationArgs = {
        httpMethod: request.method,
        body: request.body,
        headers: request.headers,
        cookies: request.cookies
    };
    // Invoke handler
    await context.handlerClient.invoke<TParams & any>({
        name: name,
        payload: {
            ...payload,
            ...invocationArgs
        },
        await: false
    });
}
