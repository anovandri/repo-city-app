package com.repocity.poller.client;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import org.junit.jupiter.api.*;

import java.time.Instant;

import static com.github.tomakehurst.wiremock.client.WireMock.*;
import static org.assertj.core.api.Assertions.*;

/**
 * Unit tests for {@link GitLabClient}.
 *
 * WireMock is started on a random port; GitLabClient is constructed directly
 * (no Spring context needed) pointing at the WireMock base URL.
 */
class GitLabClientTest {

    private static WireMockServer wireMock;
    private GitLabClient client;

    private static final String GROUP = "mygroup";
    private static final String SLUG  = "ms-test";
    private static final String TOKEN = "test-token";

    @BeforeAll
    static void startWireMock() {
        wireMock = new WireMockServer(WireMockConfiguration.options().dynamicPort());
        wireMock.start();
    }

    @AfterAll
    static void stopWireMock() {
        wireMock.stop();
    }

    @BeforeEach
    void setUp() {
        wireMock.resetAll();
        client = new GitLabClient(
                "http://localhost:" + wireMock.port(),
                TOKEN,
                GROUP);
    }

    // ── fetchCommits ──────────────────────────────────────────────

    @Test
    void fetchCommits_returnsBodyOnSuccess() {
        String responseBody = """
                [{"id":"abc","author_name":"Aditya","message":"feat: add thing"}]
                """;
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*commits.*"))
                .willReturn(okJson(responseBody)));

        String result = client.fetchCommits(SLUG, null);

        assertThat(result).contains("author_name");
        assertThat(result).contains("Aditya");
    }

    @Test
    void fetchCommits_includesSinceQueryParam() {
        Instant since = Instant.parse("2026-01-01T00:00:00Z");
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*commits.*"))
                .withQueryParam("since", equalTo(since.toString()))
                .willReturn(okJson("[]")));

        String result = client.fetchCommits(SLUG, since);

        assertThat(result).isEqualTo("[]");
        wireMock.verify(getRequestedFor(urlPathMatching(".*commits.*"))
                .withQueryParam("since", equalTo(since.toString())));
    }

    @Test
    void fetchCommits_sendsPrivateTokenHeader() {
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*commits.*"))
                .willReturn(okJson("[]")));

        client.fetchCommits(SLUG, null);

        wireMock.verify(getRequestedFor(urlPathMatching(".*commits.*"))
                .withHeader("PRIVATE-TOKEN", equalTo(TOKEN)));
    }

    @Test
    void fetchCommits_returns_emptyArray_on_404() {
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*commits.*"))
                .willReturn(aResponse().withStatus(404).withBody("Not Found")));

        String result = client.fetchCommits(SLUG, null);

        assertThat(result).isEqualTo("[]");
    }

    @Test
    void fetchCommits_returns_emptyArray_on_401() {
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*commits.*"))
                .willReturn(aResponse().withStatus(401).withBody("Unauthorized")));

        String result = client.fetchCommits(SLUG, null);

        assertThat(result).isEqualTo("[]");
    }

    @Test
    void fetchCommits_returns_emptyArray_on_networkError() {
        // Fault simulates a connection reset mid-stream
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*commits.*"))
                .willReturn(aResponse().withFault(
                        com.github.tomakehurst.wiremock.http.Fault.CONNECTION_RESET_BY_PEER)));

        String result = client.fetchCommits(SLUG, null);

        assertThat(result).isEqualTo("[]");
    }

    // ── fetchMergeRequests ────────────────────────────────────────

    @Test
    void fetchMergeRequests_returnsBodyOnSuccess() {
        String body = """
                [{"iid":1,"state":"opened","author":{"username":"wira"}}]
                """;
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*merge_requests.*"))
                .willReturn(okJson(body)));

        String result = client.fetchMergeRequests(SLUG, "opened");

        assertThat(result).contains("wira");
    }

    @Test
    void fetchMergeRequests_includesStateQueryParam() {
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*merge_requests.*"))
                .withQueryParam("state", equalTo("merged"))
                .willReturn(okJson("[]")));

        client.fetchMergeRequests(SLUG, "merged");

        wireMock.verify(getRequestedFor(urlPathMatching(".*merge_requests.*"))
                .withQueryParam("state", equalTo("merged")));
    }

    @Test
    void fetchMergeRequests_returns_emptyArray_on_500() {
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*merge_requests.*"))
                .willReturn(aResponse().withStatus(500)));

        String result = client.fetchMergeRequests(SLUG, "opened");

        assertThat(result).isEqualTo("[]");
    }

    // ── fetchPipelines ────────────────────────────────────────────

    @Test
    void fetchPipelines_returnsBodyOnSuccess() {
        String body = """
                [{"id":99,"status":"success","user":{"username":"andes"}}]
                """;
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*pipelines.*"))
                .willReturn(okJson(body)));

        String result = client.fetchPipelines(SLUG, null);

        assertThat(result).contains("andes");
    }

    @Test
    void fetchPipelines_includesUpdatedAfterParam_whenSinceProvided() {
        Instant since = Instant.parse("2026-03-01T10:00:00Z");
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*pipelines.*"))
                .withQueryParam("updated_after", equalTo(since.toString()))
                .willReturn(okJson("[]")));

        client.fetchPipelines(SLUG, since);

        wireMock.verify(getRequestedFor(urlPathMatching(".*pipelines.*"))
                .withQueryParam("updated_after", equalTo(since.toString())));
    }

    @Test
    void fetchPipelines_returns_emptyArray_on_networkError() {
        wireMock.stubFor(get(urlPathMatching("/api/v4/projects/.*pipelines.*"))
                .willReturn(aResponse().withFault(
                        com.github.tomakehurst.wiremock.http.Fault.EMPTY_RESPONSE)));

        String result = client.fetchPipelines(SLUG, null);

        assertThat(result).isEqualTo("[]");
    }
}
