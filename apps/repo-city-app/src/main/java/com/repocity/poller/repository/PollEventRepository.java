package com.repocity.poller.repository;

import com.repocity.poller.domain.PollEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface PollEventRepository extends JpaRepository<PollEvent, Long> {
    List<PollEvent> findByRepoSlugOrderByCreatedAtDesc(String repoSlug);
    List<PollEvent> findByCreatedAtAfterOrderByCreatedAtDesc(Instant since);
}
