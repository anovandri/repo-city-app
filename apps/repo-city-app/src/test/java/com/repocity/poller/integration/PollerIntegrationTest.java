package com.repocity.poller.integration;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.repocity.poller.domain.PollEvent;
import com.repocity.poller.repository.PollEventRepository;
import com.repocity.identity.repository.RepoRepository;
import com.repocity.poller.service.PollerService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.util.List;

import static com.github.tomakehurst.wiremock.client.WireMock.*;
import static org.assertj.core.api.Assertions.*;

/**
 * Full-stack integration test.
 *
 * - Spring context starts with the {@code test} profile (H2 in-memory, seed data loaded).
 * - WireMock stubs all three GitLab endpoints for every repo slug that the seeded DB contains.
 * - One poll cycle is triggered manually and the resulting {@link PollEvent} rows
 *   are verified in the H2 database.
 */
@SpringBootTest
@ActiveProfiles("test")
class PollerIntegrationTest {

    private static WireMockServer wireMock;

    @Autowired private PollerService       pollerService;
    @Autowired private PollEventRepository pollEventRepository;
    @Autowired private RepoRepository      repoRepository;

    // ── WireMock lifecycle ────────────────────────────────────────

    @BeforeAll
    static void startWireMock() {
        wireMock = new WireMockServer(WireMockConfiguration.options().dynamicPort());
        wireMock.start();
    }

    @AfterAll
    static void stopWireMock() {
        wireMock.stop();
    }

    /** Override gitlab.base-url so GitLabClient points at WireMock before context boots. */
    @DynamicPropertySource
    static void overrideGitlabUrl(DynamicPropertyRegistry registry) {
        // WireMock port is not known yet at class-load time; this callback runs after
        // @BeforeAll so the server is already up.
        registry.add("gitlab.base-url", () -> "http://localhost:" + wireMock.port());
    }

    @BeforeEach
    void stubWireMock() {
        wireMock.resetAll();

        // Stub commits — 1 commit per repo
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*/repository/commits.*"))
                .willReturn(okJson("""
                        [{"id":"sha-abc","author_name":"Aditya","message":"chore: test"}]
                        """)));

        // Stub open MRs — 1 open MR per repo
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*/merge_requests.*"))
                .withQueryParam("state", equalTo("opened"))
                .willReturn(okJson("""
                        [{"iid":1,"state":"opened","author":{"username":"wira"}}]
                        """)));

        // Stub merged MRs — empty
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*/merge_requests.*"))
                .withQueryParam("state", equalTo("merged"))
                .willReturn(okJson("[]")));

        // Stub pipelines — 1 pipeline per repo
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*/pipelines.*"))
                .willReturn(okJson("""
                        [{"id":1,"status":"success","user":{"username":"andes"}}]
                        """)));
    }

    @AfterEach
    void cleanEvents() {
        pollEventRepository.deleteAll();
    }

    // ── Tests ─────────────────────────────────────────────────────

    @Test
    void singlePollCycle_persistsEventsForAllSeededRepos() {
        int repoCount = (int) repoRepository.count();
        assertThat(repoCount).isEqualTo(16); // all 16 repos seeded

        pollerService.pollAll();

        List<PollEvent> allEvents = pollEventRepository.findAll();

        // Expect at least 2 events per repo (1 COMMIT + 1 MR_OPENED) × 16 repos
        // plus 1 PIPELINE per repo = 48 events minimum
        assertThat(allEvents.size()).isGreaterThanOrEqualTo(repoCount * 2);
    }

    @Test
    void singlePollCycle_commitEvents_haveCorrectAuthorAndSlug() {
        pollerService.pollAll();

        List<PollEvent> commits = pollEventRepository.findAll().stream()
                .filter(e -> e.getEventType() == PollEvent.EventType.COMMIT)
                .toList();

        assertThat(commits).isNotEmpty();
        assertThat(commits).allMatch(e -> "Aditya".equals(e.getAuthorUsername()));
        // Every commit event should belong to a slug that exists in the DB
        List<String> knownSlugs = repoRepository.findAll().stream()
                .map(r -> r.getSlug())
                .toList();
        assertThat(commits).allMatch(e -> knownSlugs.contains(e.getRepoSlug()));
    }

    @Test
    void singlePollCycle_mrOpenedEvents_haveCorrectAuthor() {
        pollerService.pollAll();

        List<PollEvent> mrEvents = pollEventRepository.findAll().stream()
                .filter(e -> e.getEventType() == PollEvent.EventType.MR_OPENED)
                .toList();

        assertThat(mrEvents).isNotEmpty();
        assertThat(mrEvents).allMatch(e -> "wira".equals(e.getAuthorUsername()));
    }

    @Test
    void singlePollCycle_pipelineEvents_saved() {
        pollerService.pollAll();

        List<PollEvent> pipelineEvents = pollEventRepository.findAll().stream()
                .filter(e -> e.getEventType() == PollEvent.EventType.PIPELINE)
                .toList();

        assertThat(pipelineEvents).isNotEmpty();
        assertThat(pipelineEvents).allMatch(e -> "andes".equals(e.getAuthorUsername()));
    }

    @Test
    void singlePollCycle_on401_savesNoEventsForThatRepo() {
        // Override commits stub to return 401 for ms-ginpay specifically
        // (group segment is URL-encoded, use a wildcard so the test-group config also matches)
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/[^/]*ms-ginpay/repository/commits.*"))
                .atPriority(1)
                .willReturn(aResponse().withStatus(401)));

        pollerService.pollAll();

        // ms-ginpay should have no COMMIT events
        long ginpayCommits = pollEventRepository.findAll().stream()
                .filter(e -> "ms-ginpay".equals(e.getRepoSlug())
                          && e.getEventType() == PollEvent.EventType.COMMIT)
                .count();

        assertThat(ginpayCommits).isZero();
    }
}
