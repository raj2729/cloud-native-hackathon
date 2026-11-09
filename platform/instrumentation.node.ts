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
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
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

  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'converge',
      [ATTR_SERVICE_VERSION]: '0.1.0',
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
      headers,
    }),
    metricReaders: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${endpoint.replace(/\/$/, '')}/v1/metrics`,
          headers,
        }),
        exportIntervalMillis: 10_000,
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
  console.log(`[otel] exporting traces and metrics to ${endpoint}`);

  process.on('SIGTERM', () => {
    sdk.shutdown().finally(() => process.exit(0));
  });
}
