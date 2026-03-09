package com.repocity.poller.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.repocity.citystate.event.PollCycleCompleted;
import com.repocity.identity.repository.GitlabUserRepository;
import com.repocity.poller.domain.PollEvent;
import com.repocity.poller.domain.PollEvent.EventType;
import com.repocity.poller.repository.PollEventRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

/**
 * Parses raw GitLab JSON arrays and persists {@link PollEvent} records.
 *
 * <p>MR and pipeline events are <em>deduplicated</em> by {@code gitlab_iid} so the same
 * item is never re-inserted across poll cycles.  COMMIT events (identified by SHA, not
 * by a stable numeric id) are always inserted as-is.
 *
 * <p>After all per-repository dispatches for a poll cycle are complete,
 * {@link PollerService} calls {@link #publishCycleCompleted(List)} to notify the
 * {@code city-state} module via a {@link PollCycleCompleted} Spring application event.
 * Only newly inserted events are included — deduplicated ones are never forwarded.
 */
@Service
public class EventDispatcher {

    private static final Logger log = LoggerFactory.getLogger(EventDispatcher.class);
    private static final int MAX_PAYLOAD = 4096;

    private final PollEventRepository    eventRepo;
    private final ObjectMapper           mapper;
    private final ApplicationEventPublisher eventPublisher;
    private final GitlabUserRepository   userRepo;

    public EventDispatcher(PollEventRepository eventRepo,
                           ObjectMapper mapper,
                           ApplicationEventPublisher eventPublisher,
                           GitlabUserRepository userRepo) {
        this.eventRepo      = eventRepo;
        this.mapper         = mapper;
        this.eventPublisher = eventPublisher;
        this.userRepo       = userRepo;
    }

    // ── Public dispatch methods — return only newly persisted events ───────────

    @Transactional
    public List<PollEvent> dispatchCommits(String repoSlug, String json) {
        // The GitLab Commits API does not expose a username — only author_name (free text)
        // and author_email. We resolve author_name → gitlab_username here so that
        // poll_events.author_username is always a canonical username matching gitlab_users,
        // consistent with what MR / Pipeline events store.
        return dispatch(repoSlug, json, EventType.COMMIT, "author_name", "id", false, true);
    }

    @Transactional
    public List<PollEvent> dispatchMergeRequests(String repoSlug, String json, EventType type) {
        // MRs carry a project-scoped iid — deduplicate so re-polls are safe.
        // author.username is already the canonical GitLab username.
        return dispatch(repoSlug, json, type, "author", "iid", true, false);
    }

    @Transactional
    public List<PollEvent> dispatchPipelines(String repoSlug, String json) {
        // Pipelines carry a numeric id — deduplicate.
        // user.username is the canonical GitLab username; may be null for scheduled pipelines.
        return dispatch(repoSlug, json, EventType.PIPELINE, "user", "id", true, false);
    }

    /**
     * Called by {@link PollerService} once all per-repo dispatches for a cycle
     * have completed.  Publishes a {@link PollCycleCompleted} application event
     * so the {@code city-state} module can apply mutation rules.
     *
     * @param newEvents all newly persisted events collected across the cycle
     */
    public void publishCycleCompleted(List<PollEvent> newEvents) {
        if (newEvents.isEmpty()) {
            log.debug("Poll cycle produced no new events — skipping PollCycleCompleted");
            return;
        }
        log.info("Publishing PollCycleCompleted with {} new event(s)", newEvents.size());
        eventPublisher.publishEvent(new PollCycleCompleted(newEvents));
    }

    // ── Private ────────────────────────────────────────────────────

    private List<PollEvent> dispatch(String repoSlug, String json, EventType type,
                                     String authorField, String iidField, boolean dedup,
                                     boolean resolveAuthorByDisplayName) {
        List<PollEvent> saved = new ArrayList<>();
        try {
            JsonNode array = mapper.readTree(json);
            if (!array.isArray()) return saved;

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

                String rawAuthor = extractAuthor(node, authorField);
                String author    = resolveAuthorByDisplayName
                        ? resolveUsernameByDisplayName(rawAuthor)
                        : rawAuthor;
                String payload  = truncate(node.toString());

                PollEvent event = new PollEvent(type, repoSlug, author, payload);
                event.setGitlabIid(iid);
                event.setWebUrl(webUrl);
                saved.add(eventRepo.save(event));
            }

            if (!saved.isEmpty()) {
                log.info("Dispatched {} new {} event(s) for {} ({} duplicate(s) skipped)",
                         saved.size(), type, repoSlug, skipped);
            } else if (skipped > 0) {
                log.debug("All {} {} event(s) for {} already stored — skipped",
                          skipped, type, repoSlug);
            }
        } catch (Exception e) {
            log.error("Failed to dispatch {} events for {}: {}", type, repoSlug, e.getMessage());
        }
        return saved;
    }

    /**
     * Resolves a free-text display name (as returned by the GitLab Commits API {@code author_name}
     * field) to the canonical {@code gitlab_username} stored in {@code gitlab_users}.
     *
     * <p>Falls back to the raw display name if no matching user is found, so the event is
     * never lost — it just won't resolve to a city worker.
     *
     * @param displayName the {@code author_name} value from the GitLab API
     * @return the matching {@code gitlab_username}, or {@code displayName} if unresolvable
     */
    private String resolveUsernameByDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) return null;
        return userRepo.findByDisplayNameIgnoreCase(displayName)
                .map(u -> u.getGitlabUsername())
                .orElse(displayName);
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
