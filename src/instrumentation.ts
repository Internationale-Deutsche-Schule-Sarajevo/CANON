/**
 * Environment Validation and Sentry Initialization
 * 
 * This function runs at application startup (before any route, connection, or service).
 * It validates all required environment variables and initializes Sentry error tracking.
 * 
 * The application will refuse to start if any required environment variable is missing.
 */
export async function register() {
  // Validate environment variables first - fail fast if anything is missing
  import('./lib/env');

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
