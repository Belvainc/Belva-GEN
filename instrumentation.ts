// ─── Next.js Instrumentation ─────────────────────────────────────────────────
// This file is loaded once when the Node.js runtime starts.
// It initializes OpenTelemetry for distributed tracing.
// See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Lazy import to avoid bundling OTel in edge runtime
    const { createChildLogger } = await import("@/server/config/logger");
    const logger = createChildLogger({ module: "instrumentation" });

    logger.info("Node.js runtime instrumentation initialized");

    // TODO: Initialize OpenTelemetry SDK when @opentelemetry packages are added
    // const { NodeSDK } = await import('@opentelemetry/sdk-node');
    // const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    // const { PrismaInstrumentation } = await import('@prisma/instrumentation');
    //
    // const sdk = new NodeSDK({
    //   traceExporter: new OTLPTraceExporter(),
    //   instrumentations: [new PrismaInstrumentation()],
    //   serviceName: process.env.OTEL_SERVICE_NAME ?? 'belva-gen',
    // });
    //
    // sdk.start();
    // logger.info('OpenTelemetry SDK started');
  }
}
