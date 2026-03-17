package com.repocity.api;

import com.repocity.citystate.CityStateService;
import com.repocity.citystate.model.CityState;
import com.repocity.citystate.model.DistrictState;
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
import java.util.ArrayList;
import java.util.Map;
import java.util.HashMap;
import java.util.Comparator;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

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
    private final CityStateService      cityStateService;
        private final com.repocity.poller.client.GitLabClient gitLabClient;
        private final ObjectMapper objectMapper = new ObjectMapper();

        public RepoController(RepoRepository repoRepository,
                                                  PollEventRepository pollEventRepository,
                                                  GitlabUserRepository gitlabUserRepository,
                                                  CityStateService cityStateService,
                                                  com.repocity.poller.client.GitLabClient gitLabClient) {
                this.repoRepository       = repoRepository;
                this.pollEventRepository  = pollEventRepository;
                this.gitlabUserRepository = gitlabUserRepository;
                this.cityStateService     = cityStateService;
                this.gitLabClient         = gitLabClient;
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
        // Phase 4: Read from memory (single source of truth) instead of DB
        CityState cityState = cityStateService.getCityState();
        
        List<RepoSummary> body = repoRepository.findAll().stream()
                .map(repo -> {
                    // Get live openMrCount from memory (authoritative source)
                    DistrictState district = cityState.getDistricts().get(repo.getSlug());
                    int openMrCount = (district != null) ? district.getOpenMrCount() : 0;
                    
                    String mrListUrl = resolveMrListUrl(repo.getSlug());
                    return new RepoSummary(
                            repo.getSlug(),
                            repo.getName(),
                            repo.getIcon(),
                            openMrCount,  // From memory, not DB
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
         * Returns the most recent merge requests across all tracked repositories.
         * Query param `limit` controls how many MR items to return (default 10).
         * Each item includes: title, description, web_url, created_at, updated_at, repoSlug.
         */
        @GetMapping("/merge-requests/recent")
        public ResponseEntity<List<Map<String, Object>>> recentMergeRequests(int limit) {
                try {
                        List<Map<String, Object>> all = new ArrayList<>();
                        List<com.repocity.identity.domain.GitLabRepository> repos = repoRepository.findAll();
                        for (com.repocity.identity.domain.GitLabRepository repo : repos) {
                                String json = gitLabClient.fetchMergeRequests(repo.getGitlabProjectId(), "opened");
                                List<Map<String, Object>> mrs = objectMapper.readValue(json, new TypeReference<List<Map<String,Object>>>(){});
                                for (Map<String, Object> mr : mrs) {
                                        Map<String, Object> item = new HashMap<>();
                                        item.put("title", mr.getOrDefault("title", "(no title)"));
                                        item.put("description", mr.getOrDefault("description", ""));
                                        item.put("web_url", mr.get("web_url"));
                                        item.put("created_at", mr.get("created_at"));
                                        item.put("updated_at", mr.get("updated_at"));
                                        item.put("repoSlug", repo.getSlug());
                                        all.add(item);
                                }
                        }
                        // Sort by updated_at (fallback to created_at) desc
                        all.sort(Comparator.comparing((Map<String,Object> m) -> (String)(m.getOrDefault("updated_at", m.get("created_at")))) .reversed());
                        if (limit <= 0) limit = 10;
                        List<Map<String,Object>> out = all.size() > limit ? all.subList(0, limit) : all;
                        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(out);
                } catch (Exception e) {
                        return ResponseEntity.status(500).body(List.of());
                }
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
                        u.getGitlabUsername(),
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
