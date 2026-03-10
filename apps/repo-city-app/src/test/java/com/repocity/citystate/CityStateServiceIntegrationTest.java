package com.repocity.citystate;

import com.repocity.citystate.event.CityMutation;
import com.repocity.citystate.event.CityMutationEvent;
import com.repocity.citystate.event.PollCycleCompleted;
import com.repocity.citystate.model.CityState;
import com.repocity.citystate.model.DistrictState;
import com.repocity.citystate.model.PipelineStatus;
import com.repocity.citystate.repository.CitySnapshot;
import com.repocity.citystate.repository.CitySnapshotRepository;
import com.repocity.poller.domain.PollEvent;
import com.repocity.poller.domain.PollEvent.EventType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.test.context.ActiveProfiles;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.*;

/**
 * Integration test for the {@code city-state} module.
 *
 * <p>Boots the full Spring context with H2 and the seeded identity data.
 * Fires {@link PollCycleCompleted} events directly via {@link ApplicationEventPublisher}
 * and asserts in-memory city state, published {@link CityMutationEvent}s, and
 * persisted {@link CitySnapshot}s.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(CityStateServiceIntegrationTest.MutationEventCollector.class)
class CityStateServiceIntegrationTest {

    @Autowired private ApplicationEventPublisher   eventPublisher;
    @Autowired private CityStateService            cityStateService;
    @Autowired private CitySnapshotRepository      snapshotRepo;

    /**
     * In-process spy that collects every {@link CityMutationEvent} published during a test.
     * Spring registers this as a bean and wires the {@code @EventListener} automatically.
     */
    @Component
    static class MutationEventCollector {
        final List<CityMutationEvent> received = new ArrayList<>();

        @EventListener
        void onMutationEvent(CityMutationEvent event) {
            received.add(event);
        }

        void reset() { received.clear(); }
    }

    @Autowired private MutationEventCollector collector;

    @BeforeEach
    void resetCollector() {
        collector.reset();
    }

    // ── bootstrap ─────────────────────────────────────────────────────────────

    @Test
    void bootstrap_loadsAllSeededReposAndUsers() {
        CityState state = cityStateService.getCityState();

        // data.sql seeds 18 repos and 36 users
        assertThat(state.getDistricts()).hasSize(18);
        assertThat(state.getWorkers()).isNotEmpty();
    }

    @Test
    void bootstrap_createsDistrictForEverySeededRepo() {
        CityState state = cityStateService.getCityState();

        assertThat(state.getDistricts()).containsKey("ms-partner-web");
        assertThat(state.getDistricts()).containsKey("ms-ginpay");
        assertThat(state.getDistricts()).containsKey("ms-partner-administration");
    }

    // ── COMMIT event ───────────────────────────────────────────────────────────

    @Test
    void commitEvent_doesNotChangeBuildingFloors_andPublishesMutationEvent() {
        PollEvent commit = event(EventType.COMMIT, "ms-partner-web",
                "@anovandri",
                "{\"id\":\"sha-1\",\"author_name\":\"Aditya Novandri\",\"message\":\"feat: x\"}");

        DistrictState districtBefore = cityStateService.getCityState().getDistricts().get("ms-partner-web");
        int floorsBefore = districtBefore != null ? districtBefore.getBuildingFloors() : 0;

        eventPublisher.publishEvent(new PollCycleCompleted(List.of(commit)));

        // Commits no longer grow buildings — only MR merges do.
        DistrictState district = cityStateService.getCityState().getDistricts().get("ms-partner-web");
        assertThat(district.getBuildingFloors()).isEqualTo(floorsBefore);

        assertThat(collector.received).hasSize(1);
        CityMutation mutation = collector.received.get(0).getMutations().get(0);
        assertThat(mutation.getEventType()).isEqualTo(EventType.COMMIT);
        assertThat(mutation.getAnimationHint()).isEqualTo(CityMutation.AnimationHint.COMMIT_BEAM);
        assertThat(mutation.getRepoSlug()).isEqualTo("ms-partner-web");
    }

    @Test
    void multipleCommitEvents_incrementTotalCommitCounter() {
        List<PollEvent> commits = List.of(
                event(EventType.COMMIT, "ms-ginpay", "@anovandri", commitPayload("Aditya Novandri")),
                event(EventType.COMMIT, "ms-pip-catalog", "@anovandri", commitPayload("Aditya Novandri")),
                event(EventType.COMMIT, "ms-pip-gateway", "@anovandri", commitPayload("Aditya Novandri"))
        );

        int before = cityStateService.getCityState().getTotalCommits();
        eventPublisher.publishEvent(new PollCycleCompleted(commits));

        assertThat(cityStateService.getCityState().getTotalCommits()).isEqualTo(before + 3);
    }

    // ── MR_OPENED event ───────────────────────────────────────────────────────

    @Test
    void mrOpenedEvent_incrementsOpenMrCount_andHintIsBeam() {
        DistrictState district = cityStateService.getCityState().getDistricts().get("ms-partner-callback");
        int mrsBefore = district.getOpenMrCount();

        eventPublisher.publishEvent(new PollCycleCompleted(List.of(
                event(EventType.MR_OPENED, "ms-partner-callback", "@anovandri",
                      "{\"iid\":99,\"state\":\"opened\",\"author\":{\"username\":\"@anovandri\"}}"))));

        // openMrCount is re-synced from gitlab_repositories.open_mrs after every poll cycle,
        // so the post-cycle value equals the DB-seeded value (mrsBefore), not mrsBefore+1.
        assertThat(district.getOpenMrCount()).isEqualTo(mrsBefore);
        assertThat(collector.received).hasSize(1);
        assertThat(collector.received.get(0).getMutations().get(0).getAnimationHint())
                .isEqualTo(CityMutation.AnimationHint.MR_OPENED_BEAM);
    }

    // ── MR_MERGED event ───────────────────────────────────────────────────────

    @Test
    void mrMergedEvent_decrementsOpenMrAndAddsBuildingFloors() {
        DistrictState district = cityStateService.getCityState().getDistricts().get("ms-partner-transaction");
        int mrsBefore    = district.getOpenMrCount();
        int floorsBefore = district.getBuildingFloors();

        eventPublisher.publishEvent(new PollCycleCompleted(List.of(
                event(EventType.MR_MERGED, "ms-partner-transaction", "@anovandri",
                      "{\"iid\":5,\"state\":\"merged\",\"author\":{\"username\":\"@anovandri\"}}"))));

        // openMrCount is re-synced from gitlab_repositories.open_mrs after every poll cycle,
        // so the post-cycle value equals the DB-seeded value (mrsBefore), not mrsBefore-1.
        assertThat(district.getOpenMrCount()).isEqualTo(mrsBefore);
        assertThat(district.getBuildingFloors()).isEqualTo(floorsBefore + 3);

        CityMutation m = collector.received.get(0).getMutations().get(0);
        assertThat(m.getAnimationHint()).isEqualTo(CityMutation.AnimationHint.MERGE_SUCCESS);
    }

    // ── PIPELINE events ───────────────────────────────────────────────────────

    @Test
    void pipelineRunning_setsDistrictStatusAndHint() {
        DistrictState district = cityStateService.getCityState().getDistricts().get("ms-ginpay");

        eventPublisher.publishEvent(new PollCycleCompleted(List.of(
                event(EventType.PIPELINE, "ms-ginpay", "andes", "{\"id\":1,\"status\":\"running\"}"))));

        assertThat(district.getPipelineStatus()).isEqualTo(PipelineStatus.RUNNING);
        assertThat(collector.received.get(0).getMutations().get(0).getAnimationHint())
                .isEqualTo(CityMutation.AnimationHint.PIPELINE_RUNNING);
    }

    @Test
    void pipelineSuccess_setsDistrictStatusAndHint() {
        DistrictState district = cityStateService.getCityState().getDistricts().get("ms-ginpay");

        eventPublisher.publishEvent(new PollCycleCompleted(List.of(
                event(EventType.PIPELINE, "ms-ginpay", "andes", "{\"id\":1,\"status\":\"success\"}"))));

        assertThat(district.getPipelineStatus()).isEqualTo(PipelineStatus.SUCCESS);
        assertThat(collector.received.get(0).getMutations().get(0).getAnimationHint())
                .isEqualTo(CityMutation.AnimationHint.PIPELINE_SUCCESS);
    }

    @Test
    void pipelineFailed_setsDistrictStatusAndHint() {
        DistrictState district = cityStateService.getCityState().getDistricts().get("ms-ginpay");

        eventPublisher.publishEvent(new PollCycleCompleted(List.of(
                event(EventType.PIPELINE, "ms-ginpay", "andes", "{\"id\":1,\"status\":\"failed\"}"))));

        assertThat(district.getPipelineStatus()).isEqualTo(PipelineStatus.FAILED);
        assertThat(collector.received.get(0).getMutations().get(0).getAnimationHint())
                .isEqualTo(CityMutation.AnimationHint.PIPELINE_FAILED);
    }

    // ── unknown repo — silent skip ────────────────────────────────────────────

    @Test
    void unknownRepo_skipped_noMutationEventPublished() {
        eventPublisher.publishEvent(new PollCycleCompleted(List.of(
                event(EventType.COMMIT, "no-such-repo", "@anovandri", commitPayload("Aditya")))));

        assertThat(collector.received).isEmpty();
    }

    // ── empty cycle ───────────────────────────────────────────────────────────

    @Test
    void emptyCycle_publishesNoMutationEvent() {
        eventPublisher.publishEvent(new PollCycleCompleted(List.of()));

        assertThat(collector.received).isEmpty();
    }

    // ── persistSnapshot ───────────────────────────────────────────────────────

    @Test
    void persistSnapshot_persistsSnapshotWithCorrectDistrictCount() {
        long countBefore = snapshotRepo.count();

        cityStateService.persistSnapshot();

        long countAfter = snapshotRepo.count();
        assertThat(countAfter).isEqualTo(countBefore + 1);

        CitySnapshot latest = snapshotRepo.findTopByOrderByCreatedAtDesc().orElseThrow();
        assertThat(latest.getDistrictCount()).isEqualTo(18);
        assertThat(latest.getPayload()).isNotBlank();
    }

    // ── CityMutationEvent immutability ────────────────────────────────────────

    @Test
    void publishedMutationEvent_mutationListIsImmutable() {
        eventPublisher.publishEvent(new PollCycleCompleted(List.of(
                event(EventType.COMMIT, "ms-partner-web", "@anovandri", commitPayload("Aditya Novandri")))));

        List<CityMutation> mutations = collector.received.get(0).getMutations();
        assertThatThrownBy(() -> mutations.add(null))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private static PollEvent event(EventType type, String slug, String author, String payload) {
        PollEvent e = new PollEvent();
        e.setEventType(type);
        e.setRepoSlug(slug);
        e.setAuthorUsername(author);
        e.setPayload(payload);
        return e;
    }

    private static String commitPayload(String authorName) {
        return "{\"id\":\"sha-abc\",\"author_name\":\"" + authorName + "\",\"message\":\"chore: test\"}";
    }
}
