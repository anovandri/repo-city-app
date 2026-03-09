package com.repocity.citystate.model;

import com.repocity.identity.domain.Gender;
import com.repocity.identity.domain.UserRole;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.*;

/**
 * Unit tests for {@link WorkerState}.
 */
class WorkerStateTest {

    @Test
    void constructor_setsFieldsAndIdleDefaults() {
        WorkerState worker = new WorkerState("Aditya", UserRole.LEADER, Gender.MALE);

        assertThat(worker.getDisplayName()).isEqualTo("Aditya");
        assertThat(worker.getRole()).isEqualTo(UserRole.LEADER);
        assertThat(worker.getGender()).isEqualTo(Gender.MALE);
        assertThat(worker.getCurrentDistrictSlug()).isNull();
        assertThat(worker.getLastSeenAt()).isEqualTo(Instant.EPOCH);
    }

    @Test
    void moveTo_updatesDistrictSlug() {
        WorkerState worker = new WorkerState("Wira", UserRole.ENGINEER, Gender.MALE);
        worker.moveTo("partner-web");

        assertThat(worker.getCurrentDistrictSlug()).isEqualTo("partner-web");
    }

    @Test
    void moveTo_updatesLastSeenAt() {
        WorkerState worker = new WorkerState("Wira", UserRole.ENGINEER, Gender.MALE);
        Instant before = Instant.now().minusSeconds(1);

        worker.moveTo("partner-web");

        assertThat(worker.getLastSeenAt()).isAfter(before);
    }

    @Test
    void moveTo_canBeCalledRepeatedly_updatesEachTime() {
        WorkerState worker = new WorkerState("Andes", UserRole.ENGINEER, Gender.MALE);
        worker.moveTo("ginpay");
        worker.moveTo("pip-gateway");

        assertThat(worker.getCurrentDistrictSlug()).isEqualTo("pip-gateway");
    }
}
