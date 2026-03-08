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
        dispatch(repoSlug, json, EventType.COMMIT, "author_name");
    }

    @Transactional
    public void dispatchMergeRequests(String repoSlug, String json, EventType type) {
        dispatch(repoSlug, json, type, "author");
    }

    @Transactional
    public void dispatchPipelines(String repoSlug, String json) {
        dispatch(repoSlug, json, EventType.PIPELINE, "user");
    }

    // ── Private ────────────────────────────────────────────────────

    private void dispatch(String repoSlug, String json, EventType type, String authorField) {
        try {
            JsonNode array = mapper.readTree(json);
            if (!array.isArray()) return;

            for (JsonNode node : array) {
                String author = extractAuthor(node, authorField);
                String payload = truncate(node.toString());
                PollEvent event = new PollEvent(type, repoSlug, author, payload);
                eventRepo.save(event);
            }

            if (array.size() > 0) {
                log.debug("Dispatched {} {} event(s) for {}", array.size(), type, repoSlug);
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

    private String truncate(String s) {
        return s.length() > MAX_PAYLOAD ? s.substring(0, MAX_PAYLOAD) : s;
    }
}
