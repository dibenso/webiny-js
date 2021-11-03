import React, { useState } from "react";
import { useRouter } from "@webiny/react-router";
import { useQuery } from "@apollo/react-hooks";
import { usePageBuilder } from "../../../../hooks/usePageBuilder";
import { LIST_PUBLISHED_PAGES } from "./graphql";
import { plugins } from "@webiny/plugins";
import get from "lodash/get";
import trimEnd from "lodash/trimEnd";

import { PbPageElementPagesListComponentPlugin } from "../../../../types";

declare global {
    // eslint-disable-next-line
    namespace JSX {
        interface IntrinsicElements {
            // @ts-ignore
            "ps-tag": {
                key?: string;
                value?: string;
            };
        }
    }
}

const PagesListRender = props => {
    const { component, ...vars } = props.data || {};
    const components = plugins.byType<PbPageElementPagesListComponentPlugin>(
        "pb-page-element-pages-list-component"
    );
    const pageList = components.find(cmp => cmp.componentName === component);
    const { theme } = usePageBuilder();
    const [cursors, setCursors] = useState([null]);
    const [page, setPage] = useState(0);
    const { location } = useRouter();

    // Extract page id from URL.
    const query = new URLSearchParams(location.search);
    let pageId;
    if (query.get("id")) {
        [pageId] = query.get("id").split("#");
    }

    if (!pageList) {
        return <div>Selected page list component not found!</div>;
    }

    const { component: ListComponent } = pageList;

    let sort = null;
    if (vars.sortBy && vars.sortDirection) {
        sort = `${vars.sortBy}_${vars.sortDirection.toUpperCase()}`;
    }

    // Lets ensure the trailing "/" is removed.
    const path = trimEnd(location.pathname, "/");

    const variables = {
        sort,
        where: {
            category: vars.category,
            tags: {
                query: vars.tags,
                rule: vars.tagsRule
            }
        },
        limit: parseInt(vars.resultsPerPage),
        after: cursors[page],
        /**
         * When rendering page preview inside admin app there will be no page path/slug present in URL.
         * In that case we'll use the extracted page id from URL.
         */
        exclude: [pageId ? pageId : path]
    };

    const { data, loading } = useQuery(LIST_PUBLISHED_PAGES, {
        variables,
        skip: !ListComponent
    });

    if (!ListComponent) {
        return <div>You must select a component to render your list!</div>;
    }

    if (loading) {
        return <div>Loading...</div>;
    }

    const totalCount = get(data, "pageBuilder.listPublishedPages.meta.totalCount");
    if (!totalCount) {
        return <div>No pages match the criteria.</div>;
    }

    const listPublishedPages = get(data, "pageBuilder.listPublishedPages");

    let prevPage = null;
    if (page >= 1) {
        prevPage = () => {
            setPage(page => page - 1);
        };
    }

    let nextPage = null;
    if (listPublishedPages.meta.cursor) {
        nextPage = () => {
            setCursors(cursors => [...cursors, listPublishedPages.meta.cursor]);
            setPage(page => page + 1);
        };
    }

    return (
        <ListComponent
            {...listPublishedPages}
            nextPage={nextPage}
            prevPage={prevPage}
            theme={theme}
        />
    );
};

const PagesList = props => {
    const { component } = props.data || {};

    return (
        <>
            <ps-tag data-key={"pb-pages-list"} data-value={component} />
            <PagesListRender {...props} />
        </>
    );
};
export default React.memo(PagesList);
