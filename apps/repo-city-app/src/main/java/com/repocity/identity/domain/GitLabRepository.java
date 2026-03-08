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

    /** Short repository slug (e.g. "partner-administration") */
    @Column(nullable = false, unique = true, length = 120)
    private String slug;

    /**
     * GitLab numeric project ID (e.g. 37347452).
     * More stable than group/slug paths — survives repo renames.
     * Used by {@link com.repocity.poller.client.GitLabClient} to build API URLs.
     */
    @Column(name = "gitlab_project_id", nullable = false, unique = true)
    private Long gitlabProjectId;

    /** Emoji icon displayed in the city UI */
    @Column(length = 8)
    private String icon;

    /** Cached count of open MRs from the last poll */
    @Column(name = "open_mrs")
    private int openMrs;

    public GitLabRepository(String slug, Long gitlabProjectId, String icon, int openMrs) {
        this.slug             = slug;
        this.gitlabProjectId  = gitlabProjectId;
        this.icon             = icon;
        this.openMrs          = openMrs;
    }
}
