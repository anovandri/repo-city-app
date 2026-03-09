package com.repocity.citystate.model;

import com.repocity.identity.domain.Gender;
import com.repocity.identity.domain.RepoStatus;
import com.repocity.identity.domain.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.*;

/**
 * Unit tests for {@link CityState}.
 * Covers district/worker registration, commit/merge counters,
 * and the ring-buffer behaviour of the recent-events feed.
 */
class CityStateTest {

    private CityState cityState;

    @BeforeEach
    void setUp() {
        cityState = new CityState();
    }

    // ── putDistrict / putWorker ────────────────────────────────────────────────

    @Test
    void putDistrict_registersDistrictBySlug() {
        cityState.putDistrict(new DistrictState("partner-web", "ms-partner-web", "🌐", RepoStatus.ACTIVE, 0));

        assertThat(cityState.getDistricts()).containsKey("partner-web");
    }

    @Test
    void putWorker_registersWorkerByDisplayName() {
        cityState.putWorker(new WorkerState("Aditya", UserRole.ENGINEER, Gender.MALE));

        assertThat(cityState.getWorkers()).containsKey("Aditya");
    }

    @Test
    void putDistrict_overwritesPreviousEntry() {
        cityState.putDistrict(new DistrictState("partner-web", "ms-partner-web", "🌐", RepoStatus.ACTIVE, 0));
        cityState.putDistrict(new DistrictState("partner-web", "ms-partner-web", "🔁", RepoStatus.ACTIVE, 5));

        assertThat(cityState.getDistricts().get("partner-web").getRepoIcon()).isEqualTo("🔁");
    }

    // ── recordCommit / recordMerge ─────────────────────────────────────────────

    @Test
    void recordCommit_incrementsTotalCommits() {
        cityState.recordCommit();
        cityState.recordCommit();

        assertThat(cityState.getTotalCommits()).isEqualTo(2);
    }

    @Test
    void recordMerge_incrementsTotalMrsMerged() {
        cityState.recordMerge();

        assertThat(cityState.getTotalMrsMerged()).isEqualTo(1);
    }

    @Test
    void recordCommit_updatesLastUpdatedAt() {
        assertThat(cityState.getLastUpdatedAt()).isNotNull();
        cityState.recordCommit();
        assertThat(cityState.getLastUpdatedAt()).isNotNull();
    }

    // ── getActiveDeveloperCount ────────────────────────────────────────────────

    @Test
    void getActiveDeveloperCount_reflectsNumberOfRegisteredWorkers() {
        cityState.putWorker(new WorkerState("Aditya", UserRole.ENGINEER, Gender.MALE));
        cityState.putWorker(new WorkerState("Wira",   UserRole.ENGINEER, Gender.MALE));

        assertThat(cityState.getActiveDeveloperCount()).isEqualTo(2);
    }

    // ── pushRecentEvent — ring buffer ──────────────────────────────────────────

    @Test
    void pushRecentEvent_addsMostRecentFirst() {
        cityState.pushRecentEvent("first");
        cityState.pushRecentEvent("second");
        cityState.pushRecentEvent("third");

        List<String> events = cityState.getRecentEventSummaries();
        assertThat(events).first().isEqualTo("third");
    }

    @Test
    void pushRecentEvent_capsAt50Entries() {
        for (int i = 0; i < 60; i++) {
            cityState.pushRecentEvent("event-" + i);
        }

        assertThat(cityState.getRecentEventSummaries()).hasSize(50);
    }

    @Test
    void pushRecentEvent_discardsOldestWhenFull() {
        for (int i = 0; i < 50; i++) {
            cityState.pushRecentEvent("event-" + i);
        }
        // Push one more — "event-0" was the oldest, it should now be gone
        cityState.pushRecentEvent("newest");

        assertThat(cityState.getRecentEventSummaries()).doesNotContain("event-0");
        assertThat(cityState.getRecentEventSummaries()).contains("newest");
    }

    @Test
    void getRecentEventSummaries_returnsImmutableList() {
        cityState.pushRecentEvent("some event");
        List<String> snapshot = cityState.getRecentEventSummaries();

        assertThatThrownBy(() -> snapshot.add("intruder"))
                .isInstanceOf(UnsupportedOperationException.class);
    }
}
