/**
 * OpenTelemetry instrumentation setup for Axiom.
 *
 * CRITICAL: This file MUST be imported FIRST in index.ts before any other imports.
 * It initializes distributed tracing with Axiom for observability.
 *
 * When AXIOM_API_TOKEN is not set, tracing is completely disabled (no-op).
 */

import { trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

const axiomToken = process.env.AXIOM_API_TOKEN;

const traceExporter = new OTLPTraceExporter({
  url: process.env.AXIOM_OTLP_ENDPOINT || "https://api.axiom.co/v1/traces",
  headers: {
    Authorization: `Bearer ${axiomToken}`,
    "X-Axiom-Dataset": process.env.AXIOM_DATASET || "backend-traces",
  },
});

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "backend",
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version || "0.0.0",
});

export const sdk = new NodeSDK({
  resource,
  spanProcessor: new BatchSpanProcessor(traceExporter, {
    maxQueueSize: 1000,
    maxExportBatchSize: 512,
    scheduledDelayMillis: 5000,
  }),
  // No auto-instrumentations — incompatible with Bun runtime
});

if (axiomToken) {
  try {
    sdk.start();

    // Initialize Axiom AI SDK for automatic AI model tracing
    const { initAxiomAI } = await import("axiom/ai");
    initAxiomAI({ tracer: trace.getTracer("backend") });

    console.log(
      `OpenTelemetry initialized (dataset=${process.env.AXIOM_DATASET || "backend-traces"})`,
    );
  } catch (err) {
    console.error("Error starting OpenTelemetry", err);
  }
} else {
  console.log("OpenTelemetry disabled (AXIOM_API_TOKEN not set)");
}

export const tracer = trace.getTracer("backend");
