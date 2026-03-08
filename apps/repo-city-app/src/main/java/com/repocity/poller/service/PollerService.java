package com.repocity.poller.service;

import com.repocity.poller.client.GitLabClient;
import com.repocity.identity.domain.GitLabRepository;
import com.repocity.poller.domain.PollEvent.EventType;
import com.repocity.identity.repository.RepoRepository;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.time.Instant;
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
    private final long              pollIntervalSeconds;

    /** Virtual-thread-per-task executor used for the per-repo HTTP calls. */
    private final ExecutorService vtExecutor =
            Executors.newVirtualThreadPerTaskExecutor();

    /** Single-threaded scheduler that fires the poll cycle. */
    private final ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor(
                    Thread.ofVirtual().name("poller-scheduler").factory());

    private volatile Instant lastPoll = null;

    public PollerService(
            RepoRepository  repoRepo,
            GitLabClient    gitLabClient,
            EventDispatcher dispatcher,
            @Value("${gitlab.poll-interval-seconds:60}") long pollIntervalSeconds) {

        this.repoRepo            = repoRepo;
        this.gitLabClient        = gitLabClient;
        this.dispatcher          = dispatcher;
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

        List<Future<?>> futures = repos.stream()
                .<Future<?>>map(repo -> vtExecutor.submit(() -> pollRepo(repo, since)))
                .toList();

        // Wait for all virtual threads to finish before the next cycle
        for (Future<?> f : futures) {
            try {
                f.get(25, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                log.warn("Poll task timed out");
                f.cancel(true);
            } catch (Exception e) {
                log.error("Poll task failed: {}", e.getMessage());
            }
        }
    }

    private void pollRepo(GitLabRepository repo, Instant since) {
        String slug = repo.getSlug();
        try {
            // Commits
            String commits = gitLabClient.fetchCommits(slug, since);
            dispatcher.dispatchCommits(slug, commits);

            // Open MRs
            String openMrs = gitLabClient.fetchMergeRequests(slug, "opened");
            dispatcher.dispatchMergeRequests(slug, openMrs, EventType.MR_OPENED);

            // Merged MRs (only recent ones via since filter)
            String mergedMrs = gitLabClient.fetchMergeRequests(slug, "merged");
            dispatcher.dispatchMergeRequests(slug, mergedMrs, EventType.MR_MERGED);

            // Pipelines
            String pipelines = gitLabClient.fetchPipelines(slug, since);
            dispatcher.dispatchPipelines(slug, pipelines);

        } catch (Exception e) {
            log.error("Error polling repo {}: {}", slug, e.getMessage());
        }
    }
}
