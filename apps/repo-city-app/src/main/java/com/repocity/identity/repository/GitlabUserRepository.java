package com.repocity.identity.repository;

import com.repocity.identity.domain.GitlabUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface GitlabUserRepository extends JpaRepository<GitlabUser, Long> {
    Optional<GitlabUser> findByGitlabUsername(String gitlabUsername);
    Optional<GitlabUser> findByDisplayNameIgnoreCase(String displayName);
}
