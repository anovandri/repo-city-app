package com.repocity.poller.client;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.Executors;

/**
 * Thin HTTP client for the GitLab REST API v4.
 * All blocking calls are intended to be submitted to a virtual-thread executor
 * by {@link com.repocity.poller.service.PollerService}.
 */
@Component
public class GitLabClient {

    private static final Logger log = LoggerFactory.getLogger(GitLabClient.class);

    private final HttpClient http;
    private final String baseUrl;
    private final String token;
    private final String group;

    public GitLabClient(
            @Value("${gitlab.base-url}") String baseUrl,
            @Value("${gitlab.token}")    String token,
            @Value("${gitlab.group}")    String group) {

        this.baseUrl = baseUrl;
        this.token   = token;
        this.group   = group;
        this.http    = HttpClient.newBuilder()
                .executor(Executors.newVirtualThreadPerTaskExecutor())
                .connectTimeout(Duration.ofSeconds(10))
                .build();
    }

    // ── Public API ────────────────────────────────────────────────

    /**
     * Fetch commits for a repository since a given instant.
     *
     * @param repoSlug repository slug within the configured group
     * @param since    only return commits after this instant (nullable → all)
     * @return raw JSON string from GitLab
     */
    public String fetchCommits(String repoSlug, Instant since) {
        String sinceParam = since != null ? "&since=" + since.toString() : "";
        String path = "/api/v4/projects/%s%%2F%s/repository/commits?per_page=20%s"
                .formatted(group, repoSlug, sinceParam);
        return get(path);
    }

    /**
     * Fetch merge requests for a repository.
     *
     * @param repoSlug repository slug
     * @param state    "opened", "merged", "closed", or "all"
     * @return raw JSON string from GitLab
     */
    public String fetchMergeRequests(String repoSlug, String state) {
        String path = "/api/v4/projects/%s%%2F%s/merge_requests?state=%s&per_page=20"
                .formatted(group, repoSlug, state);
        return get(path);
    }

    /**
     * Fetch recent pipelines for a repository.
     *
     * @param repoSlug repository slug
     * @param since    only return pipelines updated after this instant (nullable → all)
     * @return raw JSON string from GitLab
     */
    public String fetchPipelines(String repoSlug, Instant since) {
        String sinceParam = since != null ? "&updated_after=" + since.toString() : "";
        String path = "/api/v4/projects/%s%%2F%s/pipelines?per_page=20%s"
                .formatted(group, repoSlug, sinceParam);
        return get(path);
    }

    // ── Private helpers ───────────────────────────────────────────

    private String get(String path) {
        URI uri = URI.create(baseUrl + path);
        HttpRequest request = HttpRequest.newBuilder(uri)
                .header("PRIVATE-TOKEN", token)
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(30))
                .GET()
                .build();

        try {
            HttpResponse<String> response =
                    http.send(request, HttpResponse.BodyHandlers.ofString());

            if (response.statusCode() >= 400) {
                log.warn("GitLab API {} returned HTTP {}", uri, response.statusCode());
                return "[]";
            }
            return response.body();

        } catch (Exception e) {
            log.error("GitLab API request failed for {}: {}", uri, e.getMessage());
            return "[]";
        }
    }
}
