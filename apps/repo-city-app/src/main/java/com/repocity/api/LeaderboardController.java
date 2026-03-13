package com.repocity.api;

import com.repocity.poller.domain.PollEvent;
import com.repocity.poller.repository.PollEventRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * REST API endpoint for City Leaderboard data.
 */
@RestController
@RequestMapping("/api/leaderboard")
public class LeaderboardController {

    private final PollEventRepository pollEventRepository;

    public LeaderboardController(PollEventRepository pollEventRepository) {
        this.pollEventRepository = pollEventRepository;
    }

    /**
     * Returns leaderboard data for the frontend:
     * - Top 5 repositories by MR merged (last 7 days)
     * - Top 5 developers by commits (last 7 days)
     * - Most active repository today (by commits)
     */
    @GetMapping
    public ResponseEntity<LeaderboardData> getLeaderboard() {
        Instant sevenDaysAgo = Instant.now().minus(7, ChronoUnit.DAYS);
        Instant todayStart = LocalDate.now()
                .atStartOfDay(ZoneId.systemDefault())
                .toInstant();

        // Fetch all events from last 7 days
        List<PollEvent> recentEvents = pollEventRepository.findByCreatedAtAfterOrderByCreatedAtDesc(sevenDaysAgo);
        List<PollEvent> todayEvents = pollEventRepository.findByCreatedAtAfterOrderByCreatedAtDesc(todayStart);

        // Top repositories by MR merged (last 7 days)
        Map<String, Long> repoMrCount = recentEvents.stream()
                .filter(e -> e.getEventType() == PollEvent.EventType.MR_MERGED)
                .collect(Collectors.groupingBy(PollEvent::getRepoSlug, Collectors.counting()));

        List<LeaderboardItem> topRepos = repoMrCount.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(5)
                .map(e -> new LeaderboardItem(e.getKey(), e.getValue().intValue()))
                .collect(Collectors.toList());

        // Top developers by commits (last 7 days)
        Map<String, Long> devCommitCount = recentEvents.stream()
                .filter(e -> e.getEventType() == PollEvent.EventType.COMMIT)
                .filter(e -> e.getAuthorUsername() != null)
                .collect(Collectors.groupingBy(PollEvent::getAuthorUsername, Collectors.counting()));

        List<LeaderboardItem> topDevelopers = devCommitCount.entrySet().stream()
                .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
                .limit(5)
                .map(e -> new LeaderboardItem(e.getKey(), e.getValue().intValue()))
                .collect(Collectors.toList());

        // Most active repository today (by commits)
        Map<String, Long> repoCommitToday = todayEvents.stream()
                .filter(e -> e.getEventType() == PollEvent.EventType.COMMIT)
                .collect(Collectors.groupingBy(PollEvent::getRepoSlug, Collectors.counting()));

        LeaderboardItem mostActiveToday = repoCommitToday.entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(e -> new LeaderboardItem(e.getKey(), e.getValue().intValue()))
                .orElse(new LeaderboardItem("N/A", 0));

        LeaderboardData data = new LeaderboardData(topRepos, topDevelopers, mostActiveToday);
        return ResponseEntity.ok(data);
    }

    // DTOs
    record LeaderboardData(
            List<LeaderboardItem> topRepos,
            List<LeaderboardItem> topDevelopers,
            LeaderboardItem mostActiveToday
    ) {}

    record LeaderboardItem(String name, int count) {}
}
