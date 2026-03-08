# ──────────────────────────────────────────────────────────────
#  Stage 1 — build
#  Uses the official Maven image with Java 21 to compile and
#  package the fat JAR, without needing Maven installed locally.
# ──────────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /app

# Copy the POM first so Docker can cache the dependency download
# layer separately from the source code layer.
COPY pom.xml .
RUN mvn dependency:go-offline -q

# Copy source and build (skip tests — they run in CI, not here)
COPY src ./src
RUN mvn package -DskipTests -q

# ──────────────────────────────────────────────────────────────
#  Stage 2 — runtime
#  Slim JRE-only image; no compiler or Maven present.
# ──────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-jammy

WORKDIR /app

# Non-root user for security
RUN addgroup --system repocity && adduser --system --ingroup repocity repocity
USER repocity

COPY --from=build /app/target/*.jar app.jar

# Spring Boot listens on 8080 by default
EXPOSE 8080

# Use exec form so signals (SIGTERM) reach the JVM directly.
# Virtual threads are enabled via spring.threads.virtual.enabled=true in
# application.properties — no JVM flag needed.
ENTRYPOINT ["java", \
  "-Dspring.profiles.active=prod", \
  "-jar", "app.jar"]
