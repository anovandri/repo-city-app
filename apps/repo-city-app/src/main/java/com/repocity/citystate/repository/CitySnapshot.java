package com.repocity.citystate.repository;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

/**
 * JPA entity that stores a periodic JSON snapshot of the full city state.
 *
 * <p>Snapshots are written by {@link com.repocity.citystate.CityStateService} at
 * configurable intervals (e.g. every 5 minutes). On restart, the service restores
 * from the most recent snapshot so that browsers joining after a restart see a
 * populated city rather than an empty one.
 *
 * <p>The {@code realtime} module also reads the latest snapshot to send a
 * {@code CitySnapshotMessage} to newly connected browser clients.
 */
@Entity
@Table(name = "city_snapshots",
       indexes = @Index(name = "idx_city_snapshots_created", columnList = "created_at DESC"))
@Data
@NoArgsConstructor
public class CitySnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Full city state serialized as JSON.
     * Stored as TEXT so it works with both H2 (dev) and PostgreSQL (prod).
     */
    @Column(nullable = false, columnDefinition = "TEXT")
    private String payload;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /** Number of districts captured in this snapshot — useful for quick integrity checks. */
    @Column(name = "district_count")
    private int districtCount;

    /** Number of workers captured in this snapshot. */
    @Column(name = "worker_count")
    private int workerCount;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
    }

    public CitySnapshot(String payload, int districtCount, int workerCount) {
        this.payload       = payload;
        this.districtCount = districtCount;
        this.workerCount   = workerCount;
    }
}
