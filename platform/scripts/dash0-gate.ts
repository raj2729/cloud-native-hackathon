import './env';
import { getDash0Summary } from '../lib/dash0';
import { AVAILABILITY_TARGET, SLO_TARGET } from '../lib/observability';

async function main(): Promise<void> {
  const result = await getDash0Summary(15, 'discovery');
  if (result.status !== 'connected') throw new Error(`Dash0 gate cannot evaluate: ${result.message}`);
  const metric = (key: string): number => {
    const panel = result.panels.find((entry) => entry.key === key);
    if (!panel || panel.error || panel.value === null) throw new Error(`Missing telemetry for ${key}; the gate cannot pass without data.`);
    return panel.value;
  };
  const requests = metric('requests');
  const minimum = Number(process.env.DASH0_GATE_MIN_REQUESTS ?? '20');
  if (!Number.isFinite(minimum) || minimum < 1) throw new Error('DASH0_GATE_MIN_REQUESTS must be positive.');
  if (requests < minimum) throw new Error(`Insufficient traffic: ${requests.toFixed(0)} operations; need ${minimum}.`);
  const latency = metric('latencySli') / 100;
  const availability = metric('availabilitySli') / 100;
  console.log(`15-minute discovery SLIs: latency ${(latency * 100).toFixed(2)}%, availability ${(availability * 100).toFixed(2)}%, operations ${requests.toFixed(0)}.`);
  if (latency < SLO_TARGET || availability < AVAILABILITY_TARGET) throw new Error('Reliability target breached. Investigate in Dash0 before release.');
  console.log('Dash0 release gate passed.');
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Gate failed'); process.exitCode = 1; });
