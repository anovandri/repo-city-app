package com.repocity.api;

/**
 * REST DTO — a single developer entry returned by {@code GET /api/workers}.
 *
 * @param displayName  human-readable name (e.g. "Aditya Novandri")
 * @param role         developer role in uppercase (e.g. "ENGINEER", "LEADER", "CARETAKER")
 * @param gender       gender in uppercase (e.g. "MALE", "FEMALE")
 */
public record WorkerSummary(
        String displayName,
        String role,
        String gender
) {}
