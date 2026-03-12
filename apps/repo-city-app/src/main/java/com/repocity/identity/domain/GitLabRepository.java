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

    /**
     * Base building height expressed as a floor count.
     * The frontend uses this directly to scale the 3-D geometry; it does NOT
     * derive height from open MR count so that the visual baseline is stable
     * and only changes when a human intentionally edits the seed data.
     * <p>
     * Recommended range: 4 (small utility service) – 14 (EOC / critical platform).
     * The frontend may add a small live bonus on top (e.g. +1 floor per open MR)
     * to show current activity, but that is a pure visual layer.
     */
    @Column(name = "floors", nullable = false)
    private int floors;

    /**
     * City district this repository belongs to.
     * Drives the frontend layout engine to auto-assign building positions.
     * <ul>
     *   <li>{@code ms-partner} — NW district</li>
     *   <li>{@code ms-pip}     — NE district</li>
     *   <li>{@code standalone} — SE standalone area</li>
     *   <li>{@code special}    — hand-placed (EOC, sunset repos)</li>
     * </ul>
     */
    @Column(name = "district", nullable = false, length = 20)
    private String district;

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
                            String icon, RepoStatus status,
                            String district, int floors) {
        this.slug            = slug;
        this.name            = name;
        this.gitlabProjectId = gitlabProjectId;
        this.icon            = icon;
        this.status          = status;
        this.district        = district;
        this.floors          = floors;
    }
}
