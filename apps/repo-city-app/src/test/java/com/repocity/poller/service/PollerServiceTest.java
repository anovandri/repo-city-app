package com.repocity.poller.service;

import com.repocity.poller.client.GitLabClient;
import com.repocity.identity.domain.GitLabRepository;
import com.repocity.identity.repository.RepoRepository;
import com.repocity.poller.repository.PollEventRepository;
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

    @Mock private RepoRepository      repoRepo;
    @Mock private GitLabClient        gitLabClient;
    @Mock private EventDispatcher     dispatcher;
    @Mock private PollEventRepository pollEventRepo;

    private PollerService pollerService;

    @BeforeEach
    void setUp() {
        // poll interval 3600s — scheduler won't auto-fire during tests
        pollerService = new PollerService(repoRepo, gitLabClient, dispatcher, pollEventRepo, 3600L);
    }

    @Test
    void pollAll_invokesAllThreeEndpointsForEachRepo() {
        GitLabRepository r1 = repoWithSlug("ms-customer", 11111L);
        GitLabRepository r2 = repoWithSlug("api-gateway",  22222L);
        when(repoRepo.findAll()).thenReturn(List.of(r1, r2));
        when(gitLabClient.fetchCommits(anyLong(), any())).thenReturn("[]");
        when(gitLabClient.fetchMergeRequests(anyLong(), any())).thenReturn("[]");
        when(gitLabClient.fetchPipelines(anyLong(), any())).thenReturn("[]");
        // Phase 1.2: removed countOpenMrs stubbing - no longer called in PollerService

        pollerService.pollAll();

        verify(gitLabClient, times(2)).fetchCommits(anyLong(), any());
        verify(gitLabClient, times(4)).fetchMergeRequests(anyLong(), any()); // opened + merged × 2 repos
        verify(gitLabClient, times(2)).fetchPipelines(anyLong(), any());
    }

    @Test
    void pollAll_callsDispatcherWithCorrectEventTypes() {
        GitLabRepository repo = repoWithSlug("ms-transaction", 99001L);
        when(repoRepo.findAll()).thenReturn(List.of(repo));
        when(gitLabClient.fetchCommits(anyLong(), any())).thenReturn("[{\"id\":\"a\",\"author_name\":\"dev\"}]");
        when(gitLabClient.fetchMergeRequests(anyLong(), eq("opened"))).thenReturn("[]");
        when(gitLabClient.fetchMergeRequests(anyLong(), eq("merged"))).thenReturn("[]");
        when(gitLabClient.fetchPipelines(anyLong(), any())).thenReturn("[]");
        // Phase 1.2: removed countOpenMrs stubbing - no longer called in PollerService

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
        GitLabRepository repo = repoWithSlug("ms-integration", 33333L);
        when(repoRepo.findAll()).thenReturn(List.of(repo));
        when(gitLabClient.fetchCommits(anyLong(), any()))
                .thenThrow(new RuntimeException("simulated failure"));
        // These stubs may not be reached — fetchCommits throws first; use lenient to suppress
        lenient().when(gitLabClient.fetchMergeRequests(anyLong(), any())).thenReturn("[]");
        lenient().when(gitLabClient.fetchPipelines(anyLong(), any())).thenReturn("[]");

        assertThatCode(() -> pollerService.pollAll()).doesNotThrowAnyException();
    }

    // ── helpers ───────────────────────────────────────────────────

    private GitLabRepository repoWithSlug(String slug, long projectId) {
        GitLabRepository r = new GitLabRepository();
        r.setSlug(slug);
        r.setGitlabProjectId(projectId);
        r.setIcon("🔧");
        return r;
    }
}
