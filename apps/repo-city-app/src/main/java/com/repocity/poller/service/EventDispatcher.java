package com.repocity.poller.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.repocity.poller.domain.PollEvent;
import com.repocity.poller.domain.PollEvent.EventType;
import com.repocity.poller.repository.PollEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Parses raw GitLab JSON arrays and persists {@link PollEvent} records.
 *
 * <p>MR and pipeline events are <em>deduplicated</em> by {@code gitlab_iid} so the same
 * item is never re-inserted across poll cycles.  COMMIT events (identified by SHA, not
 * by a stable numeric id) are always inserted as-is.
 */
@Service
public class EventDispatcher {

    private static final Logger log = LoggerFactory.getLogger(EventDispatcher.class);
    private static final int MAX_PAYLOAD = 4096;

    private final PollEventRepository eventRepo;
    private final ObjectMapper mapper;

    public EventDispatcher(PollEventRepository eventRepo, ObjectMapper mapper) {
        this.eventRepo = eventRepo;
        this.mapper    = mapper;
    }

    @Transactional
    public void dispatchCommits(String repoSlug, String json) {
        // Commits have no stable numeric id we can dedup on — always insert.
        dispatch(repoSlug, json, EventType.COMMIT, "author_name", "id", false);
    }

    @Transactional
    public void dispatchMergeRequests(String repoSlug, String json, EventType type) {
        // MRs carry a project-scoped iid — deduplicate so re-polls are safe.
        dispatch(repoSlug, json, type, "author", "iid", true);
    }

    @Transactional
    public void dispatchPipelines(String repoSlug, String json) {
        // Pipelines carry a numeric id — deduplicate.
        dispatch(repoSlug, json, EventType.PIPELINE, "user", "id", true);
    }

    // ── Private ────────────────────────────────────────────────────

    private void dispatch(String repoSlug, String json, EventType type,
                          String authorField, String iidField, boolean dedup) {
        try {
            JsonNode array = mapper.readTree(json);
            if (!array.isArray()) return;

            int saved = 0;
            int skipped = 0;

            for (JsonNode node : array) {
                Long   iid    = extractLong(node, iidField);
                String webUrl = extractText(node, "web_url");

                // Skip if we've already persisted this exact event item.
                if (dedup && iid != null
                        && eventRepo.existsByEventTypeAndRepoSlugAndGitlabIid(type, repoSlug, iid)) {
                    skipped++;
                    continue;
                }

                String author  = extractAuthor(node, authorField);
                String payload = truncate(node.toString());

                PollEvent event = new PollEvent(type, repoSlug, author, payload);
                event.setGitlabIid(iid);
                event.setWebUrl(webUrl);
                eventRepo.save(event);
                saved++;
            }

            if (saved > 0) {
                log.info("Dispatched {} new {} event(s) for {} ({} duplicate(s) skipped)",
                         saved, type, repoSlug, skipped);
            } else if (skipped > 0) {
                log.debug("All {} {} event(s) for {} already stored — skipped",
                          skipped, type, repoSlug);
            }
        } catch (Exception e) {
            log.error("Failed to dispatch {} events for {}: {}", type, repoSlug, e.getMessage());
        }
    }

    private String extractAuthor(JsonNode node, String field) {
        JsonNode f = node.get(field);
        if (f == null) return null;
        // Commits: author_name is a plain string
        if (f.isTextual()) return f.asText();
        // MRs / pipelines: nested object with "username"
        JsonNode username = f.get("username");
        return username != null ? username.asText() : null;
    }

    private Long extractLong(JsonNode node, String field) {
        JsonNode f = node.get(field);
        if (f == null || !f.isNumber()) return null;
        return f.asLong();
    }

    private String extractText(JsonNode node, String field) {
        JsonNode f = node.get(field);
        if (f == null || !f.isTextual()) return null;
        return f.asText();
    }

    private String truncate(String s) {
        return s.length() > MAX_PAYLOAD ? s.substring(0, MAX_PAYLOAD) : s;
    }
}
