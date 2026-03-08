package com.repocity.poller.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.repocity.poller.domain.PollEvent;
import com.repocity.poller.domain.PollEvent.EventType;
import com.repocity.poller.repository.PollEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link EventDispatcher}.
 * The repository is mocked; no Spring context or DB is required.
 */
@ExtendWith(MockitoExtension.class)
class EventDispatcherTest {

    @Mock
    private PollEventRepository eventRepo;

    @Captor
    private ArgumentCaptor<PollEvent> eventCaptor;

    private EventDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        dispatcher = new EventDispatcher(eventRepo, new ObjectMapper());
    }

    // ── dispatchCommits ───────────────────────────────────────────

    @Test
    void dispatchCommits_savesOneEventPerCommit() {
        String json = """
                [
                  {"id":"a1","author_name":"Aditya","message":"feat: init"},
                  {"id":"b2","author_name":"Wira","message":"fix: bug"}
                ]
                """;

        dispatcher.dispatchCommits("ms-test", json);

        verify(eventRepo, times(2)).save(eventCaptor.capture());
        List<PollEvent> saved = eventCaptor.getAllValues();

        assertThat(saved).allMatch(e -> e.getEventType() == EventType.COMMIT);
        assertThat(saved).allMatch(e -> "ms-test".equals(e.getRepoSlug()));
        assertThat(saved.get(0).getAuthorUsername()).isEqualTo("Aditya");
        assertThat(saved.get(1).getAuthorUsername()).isEqualTo("Wira");
    }

    @Test
    void dispatchCommits_emptyArray_savesNothing() {
        dispatcher.dispatchCommits("ms-test", "[]");
        verifyNoInteractions(eventRepo);
    }

    @Test
    void dispatchCommits_invalidJson_doesNotThrow() {
        assertThatCode(() -> dispatcher.dispatchCommits("ms-test", "not-json"))
                .doesNotThrowAnyException();
        verifyNoInteractions(eventRepo);
    }

    @Test
    void dispatchCommits_nonArrayJson_savesNothing() {
        dispatcher.dispatchCommits("ms-test", "{\"id\":\"abc\"}");
        verifyNoInteractions(eventRepo);
    }

    @Test
    void dispatchCommits_payloadTruncatedAt4096Chars() {
        // Build a commit entry with a very long message (>4096 chars)
        String longMessage = "x".repeat(5000);
        String json = "[{\"id\":\"abc\",\"author_name\":\"dev\",\"message\":\"" + longMessage + "\"}]";

        dispatcher.dispatchCommits("ms-test", json);

        verify(eventRepo).save(eventCaptor.capture());
        assertThat(eventCaptor.getValue().getPayload().length()).isLessThanOrEqualTo(4096);
    }

    // ── dispatchMergeRequests ─────────────────────────────────────

    @Test
    void dispatchMergeRequests_savesEventWithNestedAuthor() {
        String json = """
                [
                  {"iid":1,"state":"opened","web_url":"https://gitlab.com/group/repo/-/merge_requests/1","author":{"id":10,"username":"wira"}},
                  {"iid":2,"state":"opened","web_url":"https://gitlab.com/group/repo/-/merge_requests/2","author":{"id":11,"username":"andes"}}
                ]
                """;
        when(eventRepo.existsByEventTypeAndRepoSlugAndGitlabIid(any(), any(), anyLong())).thenReturn(false);

        dispatcher.dispatchMergeRequests("ms-customer", json, EventType.MR_OPENED);

        verify(eventRepo, times(2)).save(eventCaptor.capture());
        List<PollEvent> saved = eventCaptor.getAllValues();

        assertThat(saved).allMatch(e -> e.getEventType() == EventType.MR_OPENED);
        assertThat(saved).allMatch(e -> "ms-customer".equals(e.getRepoSlug()));
        assertThat(saved.get(0).getAuthorUsername()).isEqualTo("wira");
        assertThat(saved.get(0).getGitlabIid()).isEqualTo(1L);
        assertThat(saved.get(1).getAuthorUsername()).isEqualTo("andes");
        assertThat(saved.get(1).getGitlabIid()).isEqualTo(2L);
    }

    @Test
    void dispatchMergeRequests_mrMergedType_isPreserved() {
        String json = "[{\"iid\":5,\"state\":\"merged\",\"web_url\":\"https://gitlab.com/group/repo/-/merge_requests/5\",\"author\":{\"username\":\"edityo\"}}]";
        when(eventRepo.existsByEventTypeAndRepoSlugAndGitlabIid(any(), any(), anyLong())).thenReturn(false);

        dispatcher.dispatchMergeRequests("ms-integration", json, EventType.MR_MERGED);

        verify(eventRepo).save(eventCaptor.capture());
        assertThat(eventCaptor.getValue().getEventType()).isEqualTo(EventType.MR_MERGED);
    }

    @Test
    void dispatchMergeRequests_missingAuthorField_savesNullUsername() {
        String json = "[{\"iid\":3,\"state\":\"opened\"}]";
        when(eventRepo.existsByEventTypeAndRepoSlugAndGitlabIid(any(), any(), anyLong())).thenReturn(false);

        dispatcher.dispatchMergeRequests("ms-catalog", json, EventType.MR_OPENED);

        verify(eventRepo).save(eventCaptor.capture());
        assertThat(eventCaptor.getValue().getAuthorUsername()).isNull();
    }

    // ── dispatchPipelines ─────────────────────────────────────────

    @Test
    void dispatchPipelines_savesEventWithNestedUser() {
        String json = """
                [{"id":99,"status":"success","web_url":"https://gitlab.com/group/repo/-/pipelines/99","user":{"username":"rangga"}}]
                """;
        when(eventRepo.existsByEventTypeAndRepoSlugAndGitlabIid(any(), any(), anyLong())).thenReturn(false);

        dispatcher.dispatchPipelines("api-gateway", json);

        verify(eventRepo).save(eventCaptor.capture());
        PollEvent saved = eventCaptor.getValue();

        assertThat(saved.getEventType()).isEqualTo(EventType.PIPELINE);
        assertThat(saved.getRepoSlug()).isEqualTo("api-gateway");
        assertThat(saved.getAuthorUsername()).isEqualTo("rangga");
    }

    @Test
    void dispatchPipelines_emptyArray_savesNothing() {
        dispatcher.dispatchPipelines("api-gateway", "[]");
        verifyNoInteractions(eventRepo);
    }
}
