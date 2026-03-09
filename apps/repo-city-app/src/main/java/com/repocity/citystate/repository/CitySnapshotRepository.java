package com.repocity.citystate.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

/**
 * Persistence layer for {@link CitySnapshot} records.
 *
 * <p>Only the most recent snapshot is typically needed; older ones can be pruned by
 * a scheduled task or a database policy.
 */
public interface CitySnapshotRepository extends JpaRepository<CitySnapshot, Long> {

    /** Returns the most recently written snapshot, if any. */
    Optional<CitySnapshot> findTopByOrderByCreatedAtDesc();
}
