package com.repocity.api;

import com.repocity.identity.domain.RepoStatus;

/**
 * Lightweight DTO returned by {@code GET /api/repos}.
 * Contains everything the city UI needs to render the Open MRs panel and
 * floating building labels.
 *
 * <ul>
 *   <li>{@code slug}           — stable key used in events and district lookups</li>
 *   <li>{@code name}           — display label for the floating building label</li>
 *   <li>{@code icon}           — emoji icon shown next to the name</li>
 *   <li>{@code openMrCount}    — live MR count badge</li>
 *   <li>{@code status}         — {@link RepoStatus}: ACTIVE / INACTIVE / MAINTENANCE</li>
 *   <li>{@code gitlabMrListUrl}— direct link to the repo's MR list on GitLab (may be null
 *                                until the first MR event has been polled)</li>
 * </ul>
 */
public record RepoSummary(
        String     slug,
        String     name,
        String     icon,
        int        openMrCount,
        RepoStatus status,
        /** Direct URL to the repo's merge-request list page on GitLab. */
        String     gitlabMrListUrl
) {}
