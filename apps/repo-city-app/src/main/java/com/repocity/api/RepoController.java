package com.repocity.api;

import com.repocity.identity.repository.GitlabUserRepository;
import com.repocity.identity.repository.RepoRepository;
import com.repocity.poller.repository.PollEventRepository;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.regex.Pattern;

/**
 * REST API endpoints consumed by the city UI frontend.
 */
@RestController
@RequestMapping("/api")
public class RepoController {

    /** Matches the GitLab MR item path including the leading separator, e.g. "/-/merge_requests/899" */
    private static final Pattern MR_ITEM_SUFFIX = Pattern.compile("/-/merge_requests/\\d+$");

    private final RepoRepository        repoRepository;
    private final PollEventRepository   pollEventRepository;
    private final GitlabUserRepository  gitlabUserRepository;

    public RepoController(RepoRepository repoRepository,
                          PollEventRepository pollEventRepository,
                          GitlabUserRepository gitlabUserRepository) {
        this.repoRepository       = repoRepository;
        this.pollEventRepository  = pollEventRepository;
        this.gitlabUserRepository = gitlabUserRepository;
    }

    /**
     * Returns a summary of every tracked repository, sorted by open MR count descending.
     * Used by the city UI to render the "Open MRs" panel with live counts and GitLab links,
     * and to populate the floating building labels (name, icon, status).
     *
     * <p>Example response item:
     * <pre>{@code
     * {
     *   "slug":           "ms-partner-transaction",
     *   "name":           "ms-partner-transaction",
     *   "icon":           "�",
     *   "openMrCount":    6,
     *   "status":         "ACTIVE",
     *   "gitlabMrListUrl":"https://gitlab.com/kreasipositif/ms-partner-transaction/-/merge_requests"
     * }
     * }</pre>
     */
    @GetMapping("/repos")
    public ResponseEntity<List<RepoSummary>> listRepos() {
        List<RepoSummary> body = repoRepository.findAll().stream()
                .map(repo -> {
                    String mrListUrl = resolveMrListUrl(repo.getSlug());
                    return new RepoSummary(
                            repo.getSlug(),
                            repo.getName(),
                            repo.getIcon(),
                            repo.getOpenMrs(),
                            repo.getStatus(),
                            repo.getDistrict(),
                            repo.getFloors(),
                            mrListUrl
                    );
                })
                .sorted((a, b) -> Integer.compare(b.openMrCount(), a.openMrCount()))
                .toList();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(body);
    }

    /**
     * Returns every registered developer (GitLab user) sorted by display name.
     * Used by the city UI on startup to populate and render the developer avatars.
     *
     * <p>Example response item:
     * <pre>{@code
     * {
     *   "displayName": "Aditya Novandri",
     *   "role":        "ENGINEER",
     *   "gender":      "MALE"
     * }
     * }</pre>
     */
    @GetMapping("/workers")
    public ResponseEntity<List<WorkerSummary>> listWorkers() {
        List<WorkerSummary> body = gitlabUserRepository.findAll().stream()
                .map(u -> new WorkerSummary(
                        u.getDisplayName(),
                        u.getRole().name(),
                        u.getGender().name()
                ))
                .sorted(java.util.Comparator.comparing(WorkerSummary::displayName))
                .toList();
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(body);
    }

    /**
     * Derives the repo-level MR list URL from any stored individual MR web_url.
     * e.g. ".../merge_requests/899" → ".../merge_requests"
     * Falls back to null if no events have been stored yet for this repo.
     */
    private String resolveMrListUrl(String slug) {
        String anyWebUrl = pollEventRepository.findAnyMrWebUrlByRepoSlug(slug);
        if (anyWebUrl == null) return null;
        return MR_ITEM_SUFFIX.matcher(anyWebUrl).replaceFirst("/-/merge_requests");
    }
}
