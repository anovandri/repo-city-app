package com.repocity.poller.integration;

import com.repocity.identity.domain.Gender;
import com.repocity.identity.domain.GitLabRepository;
import com.repocity.identity.domain.GitlabUser;
import com.repocity.identity.domain.UserRole;
import com.repocity.identity.repository.GitlabUserRepository;
import com.repocity.identity.repository.RepoRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.test.context.ActiveProfiles;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;

/**
 * JPA slice tests for {@link RepoRepository} and {@link GitlabUserRepository}.
 *
 * Uses {@code @DataJpaTest} which spins up only the JPA layer (H2) and runs
 * {@code data.sql} to seed the database.
 */
@DataJpaTest
@ActiveProfiles("test")
@EntityScan("com.repocity.identity.domain")
@EnableJpaRepositories("com.repocity.identity.repository")
class RepoRepositoryTest {

    @Autowired private RepoRepository       repoRepo;
    @Autowired private GitlabUserRepository userRepo;

    // ── Seed verification ─────────────────────────────────────────

    @Test
    void seedData_loads_all18Repos() {
        assertThat(repoRepo.count()).isEqualTo(18);
    }

    @Test
    void seedData_loads_all36Users() {
        assertThat(userRepo.count()).isEqualTo(36);
    }

    // ── RepoRepository ────────────────────────────────────────────

    @Test
    void findBySlug_returnsCorrectRepo() {
        Optional<GitLabRepository> repo = repoRepo.findBySlug("ms-partner-customer");

        assertThat(repo).isPresent();
        assertThat(repo.get().getIcon()).isEqualTo("👤");
        assertThat(repo.get().getOpenMrs()).isEqualTo(4);
        assertThat(repo.get().getGitlabProjectId()).isEqualTo(35828382L);
    }

    @Test
    void findBySlug_unknownSlug_returnsEmpty() {
        assertThat(repoRepo.findBySlug("non-existent-repo")).isEmpty();
    }

    @Test
    void allRepos_havePositiveGitlabProjectId() {
        List<GitLabRepository> all = repoRepo.findAll();
        assertThat(all).allMatch(r -> r.getGitlabProjectId() != null && r.getGitlabProjectId() > 0);
    }

    @Test
    void allRepos_haveNonBlankSlug() {
        List<GitLabRepository> all = repoRepo.findAll();
        assertThat(all).allMatch(r -> r.getSlug() != null && !r.getSlug().isBlank());
    }

    @Test
    void partnerTransaction_hasHighestOpenMrs() {
        Optional<GitLabRepository> repo = repoRepo.findBySlug("ms-partner-transaction");
        assertThat(repo).isPresent();
        assertThat(repo.get().getOpenMrs()).isEqualTo(6);
    }

    @Test
    void saveAndRetrieve_newRepo() {
        GitLabRepository newRepo = new GitLabRepository(
                "ms-new-service",
                "ms-new-service",
                99999999L,
                "🆕",
                0,
                com.repocity.identity.domain.RepoStatus.ACTIVE,
                "standalone",
                7);
        repoRepo.save(newRepo);

        Optional<GitLabRepository> found = repoRepo.findBySlug("ms-new-service");
        assertThat(found).isPresent();
        assertThat(found.get().getId()).isNotNull();
    }

    // ── GitlabUserRepository ──────────────────────────────────────

    @Test
    void findByDisplayName_wira_returnsLeader() {
        Optional<GitlabUser> wira = userRepo.findByDisplayNameIgnoreCase("Wira");

        assertThat(wira).isPresent();
        assertThat(wira.get().getRole()).isEqualTo(UserRole.LEADER);
        assertThat(wira.get().getGender()).isEqualTo(Gender.MALE);
    }

    @Test
    void findByDisplayName_caseInsensitive() {
        assertThat(userRepo.findByDisplayNameIgnoreCase("WIRA")).isPresent();
        assertThat(userRepo.findByDisplayNameIgnoreCase("wira")).isPresent();
    }

    @Test
    void seedUsers_caretakers_areTwoInCount() {
        long caretakers = userRepo.findAll().stream()
                .filter(u -> u.getRole() == UserRole.CARETAKER)
                .count();
        assertThat(caretakers).isEqualTo(2);
    }

    @Test
    void seedUsers_leaders_areOneInCount() {
        long leaders = userRepo.findAll().stream()
                .filter(u -> u.getRole() == UserRole.LEADER)
                .count();
        assertThat(leaders).isEqualTo(1);
    }

    @Test
    void seedUsers_femaleEngineers_arePresent() {
        long females = userRepo.findAll().stream()
                .filter(u -> u.getGender() == Gender.FEMALE)
                .count();
        assertThat(females).isGreaterThanOrEqualTo(10);
    }

    @Test
    void findByGitlabUsername_whenNull_returnsEmpty() {
        // All seeded users have null gitlabUsername initially
        assertThat(userRepo.findByGitlabUsername("non-existent-user")).isEmpty();
    }

    @Test
    void saveAndRetrieve_newUserWithGitlabUsername() {
        GitlabUser user = new GitlabUser("Test User", Gender.MALE, UserRole.ENGINEER);
        user.setGitlabUsername("testuser123");
        userRepo.save(user);

        Optional<GitlabUser> found = userRepo.findByGitlabUsername("testuser123");
        assertThat(found).isPresent();
        assertThat(found.get().getDisplayName()).isEqualTo("Test User");
    }
}
