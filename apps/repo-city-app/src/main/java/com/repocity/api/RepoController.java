package com.repocity.api;

import com.repocity.identity.repository.RepoRepository;
import com.repocity.poller.repository.PollEventRepository;
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

    private final RepoRepository     repoRepository;
    private final PollEventRepository pollEventRepository;

    public RepoController(RepoRepository repoRepository, PollEventRepository pollEventRepository) {
        this.repoRepository     = repoRepository;
        this.pollEventRepository = pollEventRepository;
    }

    /**
     * Returns a summary of every tracked repository, sorted by open MR count descending.
     * Used by the city UI to render the "Open MRs" panel with live counts and GitLab links.
     *
     * <p>Example response item:
     * <pre>{@code
     * {
     *   "slug": "partner-transaction",
     *   "icon": "💸",
     *   "openMrCount": 6,
     *   "gitlabMrListUrl": "https://gitlab.com/dk-digital-bank/services/ms-partner-transaction/-/merge_requests"
     * }
     * }</pre>
     */
    @GetMapping("/repos")
    public List<RepoSummary> listRepos() {
        return repoRepository.findAll().stream()
                .map(repo -> {
                    String mrListUrl = resolveMrListUrl(repo.getSlug());
                    return new RepoSummary(
                            repo.getSlug(),
                            repo.getIcon(),
                            repo.getOpenMrs(),
                            mrListUrl
                    );
                })
                .sorted((a, b) -> Integer.compare(b.openMrCount(), a.openMrCount()))
                .toList();
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
