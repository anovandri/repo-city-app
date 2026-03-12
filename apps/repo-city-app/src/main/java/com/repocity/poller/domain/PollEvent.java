package com.repocity.poller.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Entity
@Table(name = "poll_events",
       indexes = {
           @Index(name = "idx_poll_events_repo",     columnList = "repo_slug"),
           @Index(name = "idx_poll_events_created",  columnList = "created_at"),
           @Index(name = "idx_poll_events_iid",      columnList = "event_type,repo_slug,gitlab_iid")
       },
       uniqueConstraints = {
           // Prevents the same MR from being re-inserted on every poll cycle.
           // PIPELINE events are intentionally excluded because pipelines transition through
           // multiple states (running → success/failed) and we want to capture each state change.
           // gitlab_iid is NULL for COMMITs so the constraint only fires when iid is present.
           @UniqueConstraint(name = "uq_poll_events_mr_iid",
                             columnNames = {"event_type", "repo_slug", "gitlab_iid"})
       })
@Data
@NoArgsConstructor
public class PollEvent {

    public enum EventType {
        COMMIT, MR_OPENED, MR_MERGED, PIPELINE
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 16)
    private EventType eventType;

    /** Repository slug this event belongs to */
    @Column(name = "repo_slug", nullable = false, length = 120)
    private String repoSlug;

    /**
     * GitLab internal numeric ID for the event item (MR iid, pipeline id).
     * NULL for COMMIT events (they are identified by SHA, not re-polled individually).
     * The unique constraint on (event_type, repo_slug, gitlab_iid) prevents duplicates.
     */
    @Column(name = "gitlab_iid")
    private Long gitlabIid;

    /**
     * Direct GitLab URL for this event item (e.g. the MR page URL).
     * Populated for MR_OPENED and MR_MERGED events; null for others.
     */
    @Column(name = "web_url", length = 512)
    private String webUrl;

    /** GitLab username of the event author (may be null for pipeline events) */
    @Column(name = "author_username", length = 120)
    private String authorUsername;

    /** Raw JSON payload from GitLab API (truncated to 4 KB) */
    @Column(columnDefinition = "TEXT")
    private String payload;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
    }

    public PollEvent(EventType eventType, String repoSlug, String authorUsername, String payload) {
        this.eventType = eventType;
        this.repoSlug = repoSlug;
        this.authorUsername = authorUsername;
        this.payload = payload;
    }
}
