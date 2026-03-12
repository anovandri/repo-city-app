package com.repocity.poller.service;

import com.repocity.citystate.event.ImmediatePollRequested;
import com.repocity.poller.client.GitLabClient;
import com.repocity.identity.domain.GitLabRepository;
import com.repocity.poller.domain.PollEvent;
import com.repocity.poller.domain.PollEvent.EventType;
import com.repocity.identity.repository.RepoRepository;
import com.repocity.poller.repository.PollEventRepository;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.*;

/**
 * Polls all 18 GitLab repositories on a fixed schedule.
 * One virtual thread is submitted per repository per cycle, so all repos
 * are polled concurrently without blocking carrier threads.
 */
@Service
public class PollerService {

    private static final Logger log = LoggerFactory.getLogger(PollerService.class);

    private final RepoRepository    repoRepo;
    private final GitLabClient      gitLabClient;
    private final EventDispatcher   dispatcher;
    private final PollEventRepository pollEventRepo;
    private final long              pollIntervalSeconds;

    /** Virtual-thread-per-task executor used for the per-repo HTTP calls. */
    private final ExecutorService vtExecutor =
            Executors.newVirtualThreadPerTaskExecutor();

    /** Single-threaded scheduler that fires the poll cycle. */
    private final ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor(
                    Thread.ofVirtual().name("poller-scheduler").factory());

    /**
     * Thread-safe accumulator for newly saved events across all repos in a single
     * poll cycle.  Cleared at the start of each cycle; drained into
     * {@link EventDispatcher#publishCycleCompleted} at the end.
     */
    private final List<PollEvent> cycleEvents =
            Collections.synchronizedList(new ArrayList<>());

    private volatile Instant lastPoll = null;

    public PollerService(
            RepoRepository    repoRepo,
            GitLabClient      gitLabClient,
            EventDispatcher   dispatcher,
            PollEventRepository pollEventRepo,
            @Value("${gitlab.poll-interval-seconds:60}") long pollIntervalSeconds) {

        this.repoRepo            = repoRepo;
        this.gitLabClient        = gitLabClient;
        this.dispatcher          = dispatcher;
        this.pollEventRepo       = pollEventRepo;
        this.pollIntervalSeconds = pollIntervalSeconds;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        log.info("PollerService starting — interval {}s", pollIntervalSeconds);
        scheduler.scheduleAtFixedRate(
                this::pollAll,
                0,
                pollIntervalSeconds,
                TimeUnit.SECONDS);
    }

    @PreDestroy
    public void stop() {
        log.info("PollerService shutting down");
        scheduler.shutdownNow();
        vtExecutor.shutdownNow();
    }

    // ── Poll cycle ────────────────────────────────────────────────

    /**
     * Executes one complete poll cycle across all repos.
     * Public visibility allows integration tests to trigger it synchronously.
     */
    public void pollAll() {
        List<GitLabRepository> repos = repoRepo.findAll();
        if (repos.isEmpty()) {
            log.warn("No repositories in database — skipping poll");
            return;
        }

        Instant since = lastPoll;
        lastPoll = Instant.now();
        log.info("Polling {} repos (since={})", repos.size(), since);

        cycleEvents.clear();

        List<Future<?>> futures = repos.stream()
                .<Future<?>>map(repo -> vtExecutor.submit(() -> pollRepo(repo, since)))
                .toList();

        // Wait for all virtual threads to finish before the next cycle
        for (Future<?> f : futures) {
            try {
                f.get(60, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                log.warn("Poll task timed out after 60 seconds");
                f.cancel(true);
            } catch (Exception e) {
                log.error("Poll task failed: {}", e.getMessage());
            }
        }

        // Notify city-state module of all newly persisted events this cycle
        dispatcher.publishCycleCompleted(new ArrayList<>(cycleEvents));
    }

    /**
     * Phase 5: Event listener for immediate poll requests from CityStateService.
     * This event-based approach eliminates the circular dependency that existed
     * when CityStateService directly called this method via @Lazy injection.
     *
     * @param event The immediate poll request with reason
     */
    @EventListener
    public void onImmediatePollRequested(ImmediatePollRequested event) {
        log.info("Immediate poll requested: {}", event.getReason());
        performImmediatePoll();
    }

    /**
     * Performs an immediate poll of all repositories.
     * Used during bootstrap when no snapshot exists or snapshot is stale.
     * Blocks until all polls complete.
     *
     * <p>Phase 5: Now invoked via event listener instead of direct call from CityStateService.
     */
    public void performImmediatePoll() {
        log.info("Performing immediate poll for bootstrap");

        List<GitLabRepository> repos = repoRepo.findAll();
        if (repos.isEmpty()) {
            log.warn("No repositories to poll");
            return;
        }

        cycleEvents.clear();

        // Poll all repos concurrently using virtual threads
        List<Future<?>> futures = repos.stream()
                .<Future<?>>map(repo -> vtExecutor.submit(() -> pollRepo(repo, null)))
                .toList();

        // Wait for all to complete
        for (Future<?> f : futures) {
            try {
                f.get(60, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                log.warn("Immediate poll task timed out after 60 seconds");
                f.cancel(true);
            } catch (Exception e) {
                log.error("Immediate poll task failed: {}", e.getMessage());
            }
        }

        // Update lastPoll timestamp
        lastPoll = Instant.now();

        // Dispatch events to CityStateService
        dispatcher.publishCycleCompleted(new ArrayList<>(cycleEvents));

        log.info("Immediate poll completed: {} events", cycleEvents.size());
    }

    private void pollRepo(GitLabRepository repo, Instant since) {
        String slug      = repo.getSlug();
        long   projectId = repo.getGitlabProjectId();
        log.debug("Starting poll for repo: {}", slug);
        try {
            // Commits
            String commits = gitLabClient.fetchCommits(projectId, since);
            cycleEvents.addAll(dispatcher.dispatchCommits(slug, commits));

            // Open MRs
            String openMrs = gitLabClient.fetchMergeRequests(projectId, "opened");
            cycleEvents.addAll(dispatcher.dispatchMergeRequests(slug, openMrs, EventType.MR_OPENED));

            // Merged MRs (only recent ones via since filter)
            String mergedMrs = gitLabClient.fetchMergeRequests(projectId, "merged");
            cycleEvents.addAll(dispatcher.dispatchMergeRequests(slug, mergedMrs, EventType.MR_MERGED));

            // Note: open MR count is computed on-demand by CityStateService from poll_events table.
            // We no longer update the DB column as part of Phase 1.2 refactoring.

            // Pipelines
            String pipelines = gitLabClient.fetchPipelines(projectId, since);
            cycleEvents.addAll(dispatcher.dispatchPipelines(slug, pipelines));

            log.debug("Completed poll for repo: {}", slug);
        } catch (Exception e) {
            log.error("Error polling repo {}: {}", slug, e.getMessage());
        }
    }
}
