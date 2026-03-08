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

    /** Short repository slug (e.g. "ms-partner-administration") */
    @Column(nullable = false, unique = true, length = 120)
    private String slug;

    /** Full GitLab URL to the project's merge-request list */
    @Column(name = "gitlab_url", nullable = false, length = 512)
    private String gitlabUrl;

    /** Emoji icon displayed in the city UI */
    @Column(length = 8)
    private String icon;

    /** Cached count of open MRs from the last poll */
    @Column(name = "open_mrs")
    private int openMrs;

    public GitLabRepository(String slug, String gitlabUrl, String icon, int openMrs) {
        this.slug = slug;
        this.gitlabUrl = gitlabUrl;
        this.icon = icon;
        this.openMrs = openMrs;
    }
}
