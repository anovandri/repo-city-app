package com.repocity.identity.repository;

import com.repocity.identity.domain.GitLabRepository;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface RepoRepository extends JpaRepository<GitLabRepository, Long> {
    Optional<GitLabRepository> findBySlug(String slug);
}
