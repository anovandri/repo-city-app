package com.repocity.poller.repository;

import com.repocity.poller.domain.PollEvent;
import com.repocity.poller.domain.PollEvent.EventType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface PollEventRepository extends JpaRepository<PollEvent, Long> {

    List<PollEvent> findByRepoSlugOrderByCreatedAtDesc(String repoSlug);

    List<PollEvent> findByCreatedAtAfterOrderByCreatedAtDesc(Instant since);

    /** Used to skip re-inserting the same MR / pipeline on every poll cycle. */
    boolean existsByEventTypeAndRepoSlugAndGitlabIid(EventType eventType, String repoSlug, Long gitlabIid);

    /**
     * Check if a pipeline with the same ID and status already exists.
     * Used to avoid duplicate pipeline state entries (e.g., multiple "success" entries for the same pipeline).
     * Extracts status from JSON payload: {"status":"running"} / {"status":"success"} / {"status":"failed"}
     */
    @Query("""
            SELECT CASE WHEN COUNT(p) > 0 THEN TRUE ELSE FALSE END
            FROM PollEvent p
            WHERE p.eventType = 'PIPELINE'
              AND p.repoSlug = :repoSlug
              AND p.gitlabIid = :pipelineId
              AND p.payload LIKE CONCAT('%"status":"', :status, '"%')
            """)
    boolean existsPipelineWithStatus(@Param("repoSlug") String repoSlug, 
                                     @Param("pipelineId") Long pipelineId,
                                     @Param("status") String status);

    /**
     * Count of distinct open MR iids for a repo that have NOT yet appeared as MR_MERGED.
     * Phase 3: Used by CityStateService to calculate openMrCount from poll_events (audit log).
     * No longer writes to database - memory (DistrictState) is authoritative.
     */
    @Query("""
            SELECT COUNT(DISTINCT o.gitlabIid)
            FROM PollEvent o
            WHERE o.eventType = 'MR_OPENED'
              AND o.repoSlug  = :slug
              AND o.gitlabIid IS NOT NULL
              AND o.gitlabIid NOT IN (
                  SELECT m.gitlabIid FROM PollEvent m
                  WHERE m.eventType = 'MR_MERGED'
                    AND m.repoSlug  = :slug
                    AND m.gitlabIid IS NOT NULL
              )
            """)
    long countOpenMrs(@Param("slug") String repoSlug);

    /**
     * Returns any stored web_url from an MR event for the given repo slug so the API
     * can derive the repo-level MR list URL (strip the trailing /NNN from the individual MR URL).
     */
    @Query("""
            SELECT p.webUrl FROM PollEvent p
            WHERE p.repoSlug = :slug
              AND p.webUrl IS NOT NULL
              AND p.eventType IN ('MR_OPENED', 'MR_MERGED')
            ORDER BY p.id DESC
            LIMIT 1
            """)
    String findAnyMrWebUrlByRepoSlug(@Param("slug") String repoSlug);
}
