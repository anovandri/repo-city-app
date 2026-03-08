package com.repocity.poller.service;

import com.repocity.poller.client.GitLabClient;
import com.repocity.identity.domain.GitLabRepository;
import com.repocity.identity.repository.RepoRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static com.repocity.poller.domain.PollEvent.EventType.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.mockito.Mockito.lenient;

/**
 * Unit tests for {@link PollerService}.
 *
 * The scheduler is not started (the {@code @EventListener} method is called
 * directly). All collaborators are mocked.
 */
@ExtendWith(MockitoExtension.class)
class PollerServiceTest {

    @Mock private RepoRepository    repoRepo;
    @Mock private GitLabClient      gitLabClient;
    @Mock private EventDispatcher   dispatcher;

    private PollerService pollerService;

    @BeforeEach
    void setUp() {
        // poll interval 3600s — scheduler won't auto-fire during tests
        pollerService = new PollerService(repoRepo, gitLabClient, dispatcher, 3600L);
    }

    @Test
    void pollAll_invokesAllThreeEndpointsForEachRepo() {
        GitLabRepository r1 = repoWithSlug("ms-customer");
        GitLabRepository r2 = repoWithSlug("api-gateway");
        when(repoRepo.findAll()).thenReturn(List.of(r1, r2));
        when(gitLabClient.fetchCommits(any(), any())).thenReturn("[]");
        when(gitLabClient.fetchMergeRequests(any(), any())).thenReturn("[]");
        when(gitLabClient.fetchPipelines(any(), any())).thenReturn("[]");

        pollerService.pollAll();

        verify(gitLabClient, times(2)).fetchCommits(any(), any());
        verify(gitLabClient, times(4)).fetchMergeRequests(any(), any()); // opened + merged × 2 repos
        verify(gitLabClient, times(2)).fetchPipelines(any(), any());
    }

    @Test
    void pollAll_callsDispatcherWithCorrectEventTypes() {
        GitLabRepository repo = repoWithSlug("ms-transaction");
        when(repoRepo.findAll()).thenReturn(List.of(repo));
        when(gitLabClient.fetchCommits(any(), any())).thenReturn("[{\"id\":\"a\",\"author_name\":\"dev\"}]");
        when(gitLabClient.fetchMergeRequests(eq("ms-transaction"), eq("opened"))).thenReturn("[]");
        when(gitLabClient.fetchMergeRequests(eq("ms-transaction"), eq("merged"))).thenReturn("[]");
        when(gitLabClient.fetchPipelines(any(), any())).thenReturn("[]");

        pollerService.pollAll();

        verify(dispatcher).dispatchCommits(eq("ms-transaction"), anyString());
        verify(dispatcher).dispatchMergeRequests(eq("ms-transaction"), anyString(), eq(MR_OPENED));
        verify(dispatcher).dispatchMergeRequests(eq("ms-transaction"), anyString(), eq(MR_MERGED));
        verify(dispatcher).dispatchPipelines(eq("ms-transaction"), anyString());
    }

    @Test
    void pollAll_emptyRepoList_skipsAllCalls() {
        when(repoRepo.findAll()).thenReturn(List.of());

        pollerService.pollAll();

        verifyNoInteractions(gitLabClient);
        verifyNoInteractions(dispatcher);
    }

    @Test
    void pollAll_gitlabClientThrows_doesNotPropagateException() {
        GitLabRepository repo = repoWithSlug("ms-integration");
        when(repoRepo.findAll()).thenReturn(List.of(repo));
        when(gitLabClient.fetchCommits(any(), any()))
                .thenThrow(new RuntimeException("simulated failure"));
        // These stubs may not be reached — fetchCommits throws first; use lenient to suppress
        lenient().when(gitLabClient.fetchMergeRequests(any(), any())).thenReturn("[]");
        lenient().when(gitLabClient.fetchPipelines(any(), any())).thenReturn("[]");

        assertThatCode(() -> pollerService.pollAll()).doesNotThrowAnyException();
    }

    // ── helpers ───────────────────────────────────────────────────

    private GitLabRepository repoWithSlug(String slug) {
        GitLabRepository r = new GitLabRepository();
        r.setSlug(slug);
        r.setGitlabUrl("https://gitlab.com/kreasipositif/" + slug + "/-/merge_requests");
        r.setIcon("🔧");
        return r;
    }
}
