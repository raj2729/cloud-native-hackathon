/**
 * OpenTelemetry → Dash0. Registered by `instrumentation.ts` only on the Node
 * runtime.
 *
 * Set DASH0_AUTH_TOKEN and DASH0_ENDPOINT to ship telemetry; with neither set
 * the SDK is not started at all, so the app runs unchanged without Dash0.
 *
 *   DASH0_ENDPOINT=https://ingress.<region>.dash0.com
 *   DASH0_AUTH_TOKEN=auth_...
 *   DASH0_DATASET=default
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

const endpoint = process.env.DASH0_ENDPOINT;
const token = process.env.DASH0_AUTH_TOKEN;

if (!endpoint || !token) {
  console.log(
    '[otel] DASH0_ENDPOINT / DASH0_AUTH_TOKEN not set — telemetry disabled, app unaffected.',
  );
} else {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Dash0-Dataset': process.env.DASH0_DATASET ?? 'default',
  };

  const base = endpoint.replace(/\/$/, '');

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'converge',
      [ATTR_SERVICE_VERSION]: '0.1.0',
      // Lets Dash0 filters and dashboards separate this deployment from any other.
      'deployment.environment.name': process.env.DEPLOYMENT_ENV ?? 'hackathon',
      'service.namespace': 'converge',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${base}/v1/traces`, headers }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics`, headers }),
        exportIntervalMillis: 10_000,
      }),
    ],
    // Logs carry the active span context, so Dash0 shows each one inside its trace.
    logRecordProcessors: [
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url: `${base}/v1/logs`, headers }),
      }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        // Noisy and not useful here.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.log(`[otel] exporting traces, metrics and logs to ${endpoint}`);

  process.on('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
