package com.repocity.identity.domain;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "gitlab_users")
@Data
@NoArgsConstructor
public class GitlabUser {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Human-readable display name (e.g. "Aditya Novandri") */
    @Column(name = "display_name", nullable = false, length = 120)
    private String displayName;

    /**
     * GitLab username used to match events from the API.
     * May be null until resolved from a real API response.
     */
    @Column(name = "gitlab_username", unique = true, length = 120)
    private String gitlabUsername;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Gender gender;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private UserRole role;

    public GitlabUser(String displayName, Gender gender, UserRole role) {
        this.displayName = displayName;
        this.gender = gender;
        this.role = role;
    }
}
