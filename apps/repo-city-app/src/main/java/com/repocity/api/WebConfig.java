package com.repocity.api;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Global CORS configuration for all REST API endpoints.
 *
 * <p>Allows the Vite dev-server (port 5173) and any locally served frontend
 * to call {@code /api/**} without the browser blocking the request due to
 * cross-origin restrictions ({@code strict-origin-when-cross-origin}).
 *
 * <p>In production the frontend is served from the same origin (via Nginx or
 * a reverse-proxy), so CORS is a no-op there — but allowing {@code *} in the
 * allowed-origins list is still safe because the API only reads data.
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(false)
                .maxAge(3600);
    }
}
