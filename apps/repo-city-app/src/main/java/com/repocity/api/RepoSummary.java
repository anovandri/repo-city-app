package com.repocity.api;

/**
 * Lightweight DTO returned by {@code GET /api/repos}.
 * Contains everything the city UI needs to render the Open MRs panel:
 * a count badge and a link that opens the repo's MR list on GitLab.
 */
public record RepoSummary(
        String slug,
        String icon,
        int    openMrCount,
        /** Direct URL to the repo's merge-request list page on GitLab. */
        String gitlabMrListUrl
) {}
