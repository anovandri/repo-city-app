package com.repocity.citystate.model;

import com.repocity.identity.domain.RepoStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Set;

import static org.assertj.core.api.Assertions.*;

/**
 * Unit tests for {@link DistrictState} mutation helpers.
 * No Spring context needed — pure in-memory logic.
 */
class DistrictStateTest {

    private DistrictState district;

    @BeforeEach
    void setUp() {
        district = new DistrictState("partner-web", "ms-partner-web", "🌐", RepoStatus.ACTIVE, 2);
    }

    // ── initial state ──────────────────────────────────────────────────────────

    @Test
    void constructor_setsFieldsCorrectly() {
        assertThat(district.getRepoSlug()).isEqualTo("partner-web");
        assertThat(district.getRepoIcon()).isEqualTo("🌐");
        assertThat(district.getOpenMrCount()).isEqualTo(2);
        assertThat(district.getBuildingFloors()).isEqualTo(0);
        assertThat(district.getPipelineStatus()).isEqualTo(PipelineStatus.IDLE);
        assertThat(district.getActiveWorkerNames()).isEmpty();
        assertThat(district.getLastActivityAt()).isEqualTo(Instant.EPOCH);
    }

    // ── commitArrived ──────────────────────────────────────────────────────────

    @Test
    void commitArrived_doesNotChangeBuildingFloors() {
        int floorsBefore = district.getBuildingFloors();
        district.commitArrived("Aditya");
        district.commitArrived("Wira");

        // Commits no longer grow buildings — only MR merges do.
        assertThat(district.getBuildingFloors()).isEqualTo(floorsBefore);
    }

    @Test
    void commitArrived_addsWorkerToActiveSet() {
        district.commitArrived("Aditya");
        district.commitArrived("Aditya"); // same person twice
        district.commitArrived("Wira");

        assertThat(district.getActiveWorkerNames()).containsExactlyInAnyOrder("Aditya", "Wira");
    }

    @Test
    void commitArrived_updatesLastActivityAt() {
        Instant before = Instant.now().minusSeconds(1);
        district.commitArrived("Aditya");

        assertThat(district.getLastActivityAt()).isAfter(before);
    }

    // ── mrOpened ───────────────────────────────────────────────────────────────

    @Test
    void mrOpened_incrementsOpenMrCount() {
        // starts at 2
        district.mrOpened("Wira");
        district.mrOpened("Wira");

        assertThat(district.getOpenMrCount()).isEqualTo(4);
    }

    @Test
    void mrOpened_addsWorkerToActiveSet() {
        district.mrOpened("Wira");

        assertThat(district.getActiveWorkerNames()).contains("Wira");
    }

    @Test
    void mrOpened_withNegativeCount_clampsToZeroBeforeIncrement() {
        // Force a negative starting point by creating a fresh district with 0 MRs
        DistrictState fresh = new DistrictState("test-repo", "test-repo", "🔧", RepoStatus.ACTIVE, 0);
        fresh.mrOpened("dev");

        assertThat(fresh.getOpenMrCount()).isEqualTo(1);
    }

    // ── mrMerged ───────────────────────────────────────────────────────────────

    @Test
    void mrMerged_decrementsOpenMrCount_andAddsBuildingFloors() {
        // starts at openMrCount=2, floors=0
        district.mrMerged("Aditya");

        assertThat(district.getOpenMrCount()).isEqualTo(1);
        assertThat(district.getBuildingFloors()).isEqualTo(3);
    }

    @Test
    void mrMerged_doesNotDecrementBelowZero() {
        DistrictState fresh = new DistrictState("test-repo", "test-repo", "🔧", RepoStatus.ACTIVE, 0);
        fresh.mrMerged("dev");

        assertThat(fresh.getOpenMrCount()).isEqualTo(0);
    }

    @Test
    void mrMerged_addsWorkerAndUpdatesActivityAt() {
        Instant before = Instant.now().minusSeconds(1);
        district.mrMerged("Aditya");

        assertThat(district.getActiveWorkerNames()).contains("Aditya");
        assertThat(district.getLastActivityAt()).isAfter(before);
    }

    // ── pipelineUpdated ────────────────────────────────────────────────────────

    @Test
    void pipelineUpdated_changesToRunning() {
        district.pipelineUpdated(PipelineStatus.RUNNING);
        assertThat(district.getPipelineStatus()).isEqualTo(PipelineStatus.RUNNING);
    }

    @Test
    void pipelineUpdated_changesToSuccess() {
        district.pipelineUpdated(PipelineStatus.SUCCESS);
        assertThat(district.getPipelineStatus()).isEqualTo(PipelineStatus.SUCCESS);
    }

    @Test
    void pipelineUpdated_changesToFailed() {
        district.pipelineUpdated(PipelineStatus.FAILED);
        assertThat(district.getPipelineStatus()).isEqualTo(PipelineStatus.FAILED);
    }

    @Test
    void pipelineUpdated_updatesLastActivityAt() {
        Instant before = Instant.now().minusSeconds(1);
        district.pipelineUpdated(PipelineStatus.RUNNING);

        assertThat(district.getLastActivityAt()).isAfter(before);
    }

    // ── getActiveWorkerNames — defensive copy ──────────────────────────────────

    @Test
    void getActiveWorkerNames_returnsImmutableSet() {
        district.commitArrived("Aditya");
        Set<String> snapshot = district.getActiveWorkerNames();

        assertThatThrownBy(() -> snapshot.add("intruder"))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void getActiveWorkerNames_doesNotReflectLaterMutations() {
        district.commitArrived("Aditya");
        Set<String> snapshot = district.getActiveWorkerNames();

        district.commitArrived("Wira");

        // The snapshot taken before Wira's commit must NOT contain Wira
        assertThat(snapshot).doesNotContain("Wira");
        assertThat(district.getActiveWorkerNames()).contains("Wira");
    }
}
