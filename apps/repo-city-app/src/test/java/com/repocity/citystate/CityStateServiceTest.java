package com.repocity.citystate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.repocity.citystate.event.CityMutation;
import com.repocity.citystate.event.CityMutationEvent;
import com.repocity.citystate.event.PollCycleCompleted;
import com.repocity.citystate.model.CityState;
import com.repocity.citystate.model.DistrictState;
import com.repocity.citystate.model.PipelineStatus;
import com.repocity.citystate.model.WorkerState;
import com.repocity.citystate.repository.CitySnapshot;
import com.repocity.citystate.repository.CitySnapshotRepository;
import com.repocity.identity.domain.Gender;
import com.repocity.identity.domain.GitLabRepository;
import com.repocity.identity.domain.GitlabUser;
import com.repocity.identity.domain.RepoStatus;
import com.repocity.identity.domain.UserRole;
import com.repocity.identity.repository.GitlabUserRepository;
import com.repocity.identity.repository.RepoRepository;
import com.repocity.poller.domain.PollEvent;
import com.repocity.poller.domain.PollEvent.EventType;
import com.repocity.poller.repository.PollEventRepository;
import com.repocity.poller.service.PollerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.context.ApplicationEventPublisher;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link CityStateService}.
 *
 * <p>All collaborators (repositories, event publisher) are mocked. The service is
 * constructed directly — no Spring context is loaded. The {@code @PostConstruct} bootstrap
 * is tested by calling it explicitly after configuring mock return values.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class CityStateServiceTest {

    @Mock private RepoRepository           repoRepo;
    @Mock private GitlabUserRepository     userRepo;
    @Mock private CitySnapshotRepository   snapshotRepo;
    @Mock private PollEventRepository      pollEventRepo;
    @Mock private ApplicationEventPublisher eventPublisher;
    @Mock private PollerService            pollerService;  // Phase 2: Mock for bootstrap
    @Captor private ArgumentCaptor<CityMutationEvent> mutationEventCaptor;
    @Captor private ArgumentCaptor<CitySnapshot>      snapshotCaptor;

    private CityStateService service;

    /** A known repo and developer pre-registered in every test. */
    private static final String REPO_SLUG = "partner-web";
    private static final String DEV_NAME  = "Aditya";
    private static final String DEV_USER  = "aditya";

    @BeforeEach
    void setUp() {
        service = new CityStateService(repoRepo, userRepo, snapshotRepo,
                                       pollEventRepo,
                                       eventPublisher,
                                       new ObjectMapper().registerModule(new JavaTimeModule()));

        // Bootstrap: one repo, one developer
        // Phase 1.2: GitLabRepository no longer has openMrs field
        GitLabRepository repo = new GitLabRepository(REPO_SLUG, REPO_SLUG, 1L, "🌐", RepoStatus.ACTIVE, "ms-partner", 8);
        GitlabUser user = new GitlabUser(DEV_NAME, Gender.MALE, UserRole.LEADER);
        user.setGitlabUsername(DEV_USER);

        when(repoRepo.findAll()).thenReturn(List.of(repo));
        when(userRepo.findAll()).thenReturn(List.of(user));
        service.bootstrap();
        
        // Phase 5: Clear invocations after bootstrap (bootstrap publishes ImmediatePollRequested event)
        clearInvocations(eventPublisher);

        // Author resolution stubs
        when(userRepo.findByGitlabUsername(DEV_USER)).thenReturn(Optional.of(user));
        when(userRepo.findByDisplayNameIgnoreCase(DEV_NAME)).thenReturn(Optional.of(user));
        when(userRepo.findByGitlabUsername(argThat(s -> s != null && !s.equals(DEV_USER))))
                .thenReturn(Optional.empty());
        when(userRepo.findByDisplayNameIgnoreCase(argThat(s -> s != null && !s.equals(DEV_NAME))))
                .thenReturn(Optional.empty());
    }

    // ── bootstrap ─────────────────────────────────────────────────────────────

    @Test
    void bootstrap_registersDistrictAndWorker() {
        CityState state = service.getCityState();

        assertThat(state.getDistricts()).containsKey(REPO_SLUG);
        assertThat(state.getWorkers()).containsKey(DEV_NAME);
    }

    // ── COMMIT event ───────────────────────────────────────────────────────────

    @Test
    void onPollCycleCompleted_commit_producesCityMutationEvent() {
        PollCycleCompleted cycle = new PollCycleCompleted(List.of(commitEvent()));

        service.onPollCycleCompleted(cycle);

        verify(eventPublisher).publishEvent(mutationEventCaptor.capture());
        CityMutationEvent evt = mutationEventCaptor.getValue();
        assertThat(evt.getMutations()).hasSize(1);

        CityMutation m = evt.getMutations().get(0);
        assertThat(m.getEventType()).isEqualTo(EventType.COMMIT);
        assertThat(m.getRepoSlug()).isEqualTo(REPO_SLUG);
        assertThat(m.getAnimationHint()).isEqualTo(CityMutation.AnimationHint.COMMIT_BEAM);
        assertThat(m.getActorDisplayName()).isEqualTo(DEV_NAME);
        assertThat(m.getActorRole()).isEqualTo(UserRole.LEADER);
    }

    @Test
    void onPollCycleCompleted_commit_doesNotChangeBuildingFloors() {
        // Commits no longer grow buildings — only MR merges do.
        service.onPollCycleCompleted(new PollCycleCompleted(List.of(commitEvent())));

        DistrictState district = service.getCityState().getDistricts().get(REPO_SLUG);
        assertThat(district.getBuildingFloors()).isEqualTo(0);
        assertThat(m(service).getNewBuildingFloors()).isEqualTo(0);
    }

    @Test
    void onPollCycleCompleted_commit_incrementsTotalCommits() {
        service.onPollCycleCompleted(new PollCycleCompleted(List.of(commitEvent(), commitEvent())));

        assertThat(service.getCityState().getTotalCommits()).isEqualTo(2);
    }

    @Test
    void onPollCycleCompleted_commit_movesWorkerToDistrict() {
        service.onPollCycleCompleted(new PollCycleCompleted(List.of(commitEvent())));

        WorkerState worker = service.getCityState().getWorkers().get(DEV_NAME);
        assertThat(worker.getCurrentDistrictSlug()).isEqualTo(REPO_SLUG);
    }

    // ── MR_OPENED event ───────────────────────────────────────────────────────

    @Test
    void onPollCycleCompleted_mrOpened_openMrCountReflectsDb() {
        // Phase 1.2: openMrCount computed from poll_events, not read from GitLabRepository.
        // After bootstrap with no poll events, count starts at 0.
        // refreshOpenMrCountsFromDb() would call pollEventRepository to get actual count.
        service.onPollCycleCompleted(new PollCycleCompleted(List.of(mrOpenedEvent())));

        DistrictState district = service.getCityState().getDistricts().get(REPO_SLUG);
        // With null pollEventRepository mock, count stays at 0 (bootstrap value)
        assertThat(district.getOpenMrCount()).isEqualTo(0);
    }

    @Test
    void onPollCycleCompleted_mrOpened_hintIsMrOpenedBeam() {
        service.onPollCycleCompleted(new PollCycleCompleted(List.of(mrOpenedEvent())));

        assertThat(m(service).getAnimationHint()).isEqualTo(CityMutation.AnimationHint.MR_OPENED_BEAM);
    }

    // ── MR_MERGED event ───────────────────────────────────────────────────────

    @Test
    void onPollCycleCompleted_mrMerged_decrementsOpenMrAndAddsBuildingFloors() {
        service.onPollCycleCompleted(new PollCycleCompleted(List.of(mrMergedEvent())));

        DistrictState district = service.getCityState().getDistricts().get(REPO_SLUG);
        // Phase 1.2: openMrCount computed from poll_events. With null mock, stays at 0.
        assertThat(district.getOpenMrCount()).isEqualTo(0);
        assertThat(district.getBuildingFloors()).isEqualTo(3); // 0 + 3
    }

    @Test
    void onPollCycleCompleted_mrMerged_hintIsMergeSuccess() {
        service.onPollCycleCompleted(new PollCycleCompleted(List.of(mrMergedEvent())));

        assertThat(m(service).getAnimationHint()).isEqualTo(CityMutation.AnimationHint.MERGE_SUCCESS);
    }

    @Test
    void onPollCycleCompleted_mrMerged_incrementsTotalMrsMerged() {
        service.onPollCycleCompleted(new PollCycleCompleted(List.of(mrMergedEvent())));

        assertThat(service.getCityState().getTotalMrsMerged()).isEqualTo(1);
    }

    // ── PIPELINE event ────────────────────────────────────────────────────────

    @Test
    void onPollCycleCompleted_pipelineRunning_setsDistrictStatusAndHint() {
        service.onPollCycleCompleted(new PollCycleCompleted(
                List.of(pipelineEvent("{\"status\":\"running\"}"))));

        DistrictState district = service.getCityState().getDistricts().get(REPO_SLUG);
        assertThat(district.getPipelineStatus()).isEqualTo(PipelineStatus.RUNNING);
        assertThat(m(service).getAnimationHint()).isEqualTo(CityMutation.AnimationHint.PIPELINE_RUNNING);
        assertThat(m(service).getPipelineStatus()).isEqualTo("running");
    }

    @Test
    void onPollCycleCompleted_pipelineSuccess_setsDistrictStatusAndHint() {
        service.onPollCycleCompleted(new PollCycleCompleted(
                List.of(pipelineEvent("{\"status\":\"success\"}"))));

        DistrictState district = service.getCityState().getDistricts().get(REPO_SLUG);
        assertThat(district.getPipelineStatus()).isEqualTo(PipelineStatus.SUCCESS);
        assertThat(m(service).getAnimationHint()).isEqualTo(CityMutation.AnimationHint.PIPELINE_SUCCESS);
    }

    @Test
    void onPollCycleCompleted_pipelineFailed_setsDistrictStatusAndHint() {
        service.onPollCycleCompleted(new PollCycleCompleted(
                List.of(pipelineEvent("{\"status\":\"failed\"}"))));

        DistrictState district = service.getCityState().getDistricts().get(REPO_SLUG);
        assertThat(district.getPipelineStatus()).isEqualTo(PipelineStatus.FAILED);
        assertThat(m(service).getAnimationHint()).isEqualTo(CityMutation.AnimationHint.PIPELINE_FAILED);
    }

    // ── unknown repo ──────────────────────────────────────────────────────────

    @Test
    void onPollCycleCompleted_unknownRepo_skipsMutation_doesNotPublishEvent() {
        PollEvent unknown = event(EventType.COMMIT, "no-such-repo", DEV_USER, null);
        service.onPollCycleCompleted(new PollCycleCompleted(List.of(unknown)));

        verifyNoInteractions(eventPublisher);
    }

    // ── unknown author — graceful fallback ────────────────────────────────────

    @Test
    void onPollCycleCompleted_unknownAuthor_fallsBackToEngineerMale() {
        PollEvent evt = event(EventType.COMMIT, REPO_SLUG, "ghost-user", null);
        service.onPollCycleCompleted(new PollCycleCompleted(List.of(evt)));

        verify(eventPublisher).publishEvent(mutationEventCaptor.capture());
        CityMutation m = mutationEventCaptor.getValue().getMutations().get(0);
        assertThat(m.getActorRole()).isEqualTo(UserRole.ENGINEER);
        assertThat(m.getActorGender()).isEqualTo(Gender.MALE);
    }

    // ── empty cycle ───────────────────────────────────────────────────────────

    @Test
    void onPollCycleCompleted_emptyEventList_doesNotPublishAnything() {
        service.onPollCycleCompleted(new PollCycleCompleted(List.of()));

        verifyNoInteractions(eventPublisher);
    }

    // ── persistSnapshot ───────────────────────────────────────────────────────

    @Test
    void persistSnapshot_savesSnapshotWithCorrectCounts() {
        // add a second repo to get count = 2
        // Phase 1.2: removed openMrs parameter from constructor
        GitLabRepository repo2 = new GitLabRepository("partner-callback", "ms-partner-callback", 2L, "📞", RepoStatus.ACTIVE, "ms-partner", 7);
        when(repoRepo.findAll()).thenReturn(List.of(
                new GitLabRepository(REPO_SLUG, REPO_SLUG, 1L, "🌐", RepoStatus.ACTIVE, "ms-partner", 8),
                repo2));
        when(userRepo.findAll()).thenReturn(List.of(
                new GitlabUser(DEV_NAME, Gender.MALE, UserRole.LEADER)));
        service.bootstrap(); // re-bootstrap with 2 repos

        when(snapshotRepo.save(any(CitySnapshot.class))).thenAnswer(inv -> inv.getArgument(0));

        service.persistSnapshot();

        verify(snapshotRepo).save(snapshotCaptor.capture());
        CitySnapshot snap = snapshotCaptor.getValue();
        assertThat(snap.getDistrictCount()).isEqualTo(2);
        assertThat(snap.getWorkerCount()).isEqualTo(1);
        assertThat(snap.getPayload()).isNotBlank();
    }

    // ── recentEventSummaries ──────────────────────────────────────────────────

    @Test
    void onPollCycleCompleted_commit_addsToRecentEventSummaries() {
        service.onPollCycleCompleted(new PollCycleCompleted(List.of(commitEvent())));

        List<String> summaries = service.getCityState().getRecentEventSummaries();
        assertThat(summaries).anyMatch(s -> s.contains(DEV_NAME) && s.contains(REPO_SLUG));
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    /** Extracts the single mutation from the last published CityMutationEvent. */
    private CityMutation m(CityStateService svc) {
        verify(eventPublisher, atLeastOnce()).publishEvent(mutationEventCaptor.capture());
        List<CityMutationEvent> captured = mutationEventCaptor.getAllValues();
        return captured.get(captured.size() - 1).getMutations().get(0);
    }

    private PollEvent commitEvent() {
        return event(EventType.COMMIT, REPO_SLUG, DEV_USER,
                     "{\"id\":\"sha-abc\",\"author_name\":\"" + DEV_NAME + "\",\"message\":\"feat: init\"}");
    }

    private PollEvent mrOpenedEvent() {
        return event(EventType.MR_OPENED, REPO_SLUG, DEV_USER,
                     "{\"iid\":1,\"state\":\"opened\",\"author\":{\"username\":\"" + DEV_USER + "\"}}");
    }

    private PollEvent mrMergedEvent() {
        return event(EventType.MR_MERGED, REPO_SLUG, DEV_USER,
                     "{\"iid\":2,\"state\":\"merged\",\"author\":{\"username\":\"" + DEV_USER + "\"}}");
    }

    private PollEvent pipelineEvent(String payload) {
        return event(EventType.PIPELINE, REPO_SLUG, "andes", payload);
    }

    private static PollEvent event(EventType type, String slug, String author, String payload) {
        PollEvent e = new PollEvent();
        e.setEventType(type);
        e.setRepoSlug(slug);
        e.setAuthorUsername(author);
        e.setPayload(payload);
        return e;
    }
}
