package com.repocity.identity.domain;

/**
 * Lifecycle status of a GitLab repository as rendered in the city UI.
 *
 * <ul>
 *   <li>{@link #ACTIVE}      — normal, ongoing development</li>
 *   <li>{@link #INACTIVE}    — no recent commits; building still visible but dimmed</li>
 *   <li>{@link #MAINTENANCE} — sunset / maintenance-only mode (e.g. ms-ginpay);
 *                               rendered with a ⚠️ "SUNSET SOON" badge in the city</li>
 * </ul>
 *
 * <p>The frontend maps these values to CSS class variants:
 * <ul>
 *   <li>{@code ACTIVE}      → no extra modifier</li>
 *   <li>{@code INACTIVE}    → {@code .repo-label--inactive}</li>
 *   <li>{@code MAINTENANCE} → {@code .repo-label--sunset}</li>
 * </ul>
 */
public enum RepoStatus {
    ACTIVE,
    INACTIVE,
    MAINTENANCE
}
