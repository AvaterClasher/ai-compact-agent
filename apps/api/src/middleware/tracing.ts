import { SpanStatusCode } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";
import { tracer } from "../instrumentation.js";
import { logger } from "../logger.js";

/**
 * Hono middleware that creates an OpenTelemetry span per HTTP request.
 * Also logs each request with method, path, status, and duration.
 */
export function tracingMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();
    const method = c.req.method;
    const path = c.req.path;

    return tracer.startActiveSpan(`${method} ${path}`, async (span) => {
      span.setAttribute("http.method", method);
      span.setAttribute("http.url", path);

      try {
        await next();
        span.setAttribute("http.status_code", c.res.status);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        throw err;
      } finally {
        span.end();
        const duration = Math.round(performance.now() - start);
        logger.info(`${method} ${path} ${c.res.status}`, { duration });
      }
    });
  };
}
