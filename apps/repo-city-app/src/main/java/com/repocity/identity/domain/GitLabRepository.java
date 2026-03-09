package com.repocity.identity.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "gitlab_repositories")
@Data
@NoArgsConstructor
public class GitLabRepository {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Short repository slug (e.g. "ms-partner-administration"). */
    @Column(nullable = false, unique = true, length = 120)
    private String slug;

    /**
     * Human-readable display name shown as the floating building label in the city UI
     * (e.g. "ms-partner-administration").
     * Intentionally kept identical to the slug for now; can be overridden to a friendlier
     * short name (e.g. "Partner Admin") if desired.
     */
    @Column(nullable = false, length = 120)
    private String name;

    /**
     * GitLab numeric project ID (e.g. 37347452).
     * More stable than group/slug paths — survives repo renames.
     * Used by {@link com.repocity.poller.client.GitLabClient} to build API URLs.
     */
    @Column(name = "gitlab_project_id", nullable = false, unique = true)
    private Long gitlabProjectId;

    /** Emoji icon displayed in the city UI. */
    @Column(length = 8)
    private String icon;

    /** Cached count of open MRs from the last poll. */
    @Column(name = "open_mrs")
    private int openMrs;

    /**
     * Lifecycle status of this repository.
     * Controls the visual variant of the floating building label:
     * <ul>
     *   <li>{@link RepoStatus#ACTIVE}      — normal development (default)</li>
     *   <li>{@link RepoStatus#INACTIVE}    — no recent activity; building dimmed</li>
     *   <li>{@link RepoStatus#MAINTENANCE} — sunset/maintenance mode; renders ⚠️ badge</li>
     * </ul>
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RepoStatus status;

    public GitLabRepository(String slug, String name, Long gitlabProjectId,
                            String icon, int openMrs, RepoStatus status) {
        this.slug            = slug;
        this.name            = name;
        this.gitlabProjectId = gitlabProjectId;
        this.icon            = icon;
        this.openMrs         = openMrs;
        this.status          = status;
    }
}
