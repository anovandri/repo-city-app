package com.repocity.citystate.model;

/**
 * CI pipeline status for a district.
 *
 * <p>Maps to the GitLab pipeline status field values so comparisons are
 * string-free: {@code "running"}, {@code "success"}, {@code "failed"}, etc.
 */
public enum PipelineStatus {
    IDLE,
    RUNNING,
    SUCCESS,
    FAILED
}
