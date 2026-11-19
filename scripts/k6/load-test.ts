import 'reflect-metadata';
import http from 'node:http';
import { createApp } from '../../apps/api/src/main.js';

export interface BenchmarkMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  durationMs: number;
  requestsPerSecond: number;
}

export interface LoadTestScenarioResult {
  endpoint: string;
  concurrency: number;
  metrics: BenchmarkMetrics;
  targetMet: boolean; // P95 < 200ms
}

export interface LoadTestSuiteResult {
  timestamp: string;
  targetP95Ms: number;
  scenarios: LoadTestScenarioResult[];
  overallStatus: 'PASS' | 'FAIL';
}

function computePercentiles(latencies: number[]): Omit<BenchmarkMetrics, 'totalRequests' | 'successfulRequests' | 'failedRequests' | 'durationMs' | 'requestsPerSecond'> {
  if (latencies.length === 0) {
    return { p50Ms: 0, p90Ms: 0, p95Ms: 0, p99Ms: 0, minMs: 0, maxMs: 0, avgMs: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const minMs = sorted[0]!;
  const maxMs = sorted[sorted.length - 1]!;
  const avgMs = Math.round((sorted.reduce((sum, val) => sum + val, 0) / sorted.length) * 100) / 100;

  const getP = (p: number) => {
    const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
    return Math.round(sorted[idx]! * 100) / 100;
  };

  return {
    p50Ms: getP(50),
    p90Ms: getP(90),
    p95Ms: getP(95),
    p99Ms: getP(99),
    minMs: Math.round(minMs * 100) / 100,
    maxMs: Math.round(maxMs * 100) / 100,
    avgMs,
  };
}

async function fetchHttp(url: string, clientIp = '127.0.0.1'): Promise<{ status: number; latencyMs: number }> {
  const start = performance.now();
  return new Promise((resolve) => {
    const options: http.RequestOptions = {
      headers: {
        'X-Forwarded-For': clientIp,
        'User-Agent': 'k6-load-benchmark/1.0',
      },
    };
    const req = http.get(url, options, (res) => {
      res.resume();
      res.on('end', () => {
        const latencyMs = performance.now() - start;
        resolve({ status: res.statusCode || 500, latencyMs });
      });
    });
    req.on('error', () => {
      const latencyMs = performance.now() - start;
      resolve({ status: 500, latencyMs });
    });
    req.setTimeout(5000, () => {
      req.destroy();
      const latencyMs = performance.now() - start;
      resolve({ status: 504, latencyMs });
    });
  });
}

async function runScenario(
  baseUrl: string,
  endpoint: string,
  totalRequests: number,
  concurrency: number,
): Promise<LoadTestScenarioResult> {
  const url = `${baseUrl}${endpoint}`;
  const latencies: number[] = [];
  let successful = 0;
  let failed = 0;

  const testStart = performance.now();
  let completed = 0;
  let inFlight = 0;
  let launched = 0;

  await new Promise<void>((resolve) => {
    const launchNext = () => {
      while (inFlight < concurrency && launched < totalRequests) {
        const clientIndex = (launched % 20) + 1; // 20 virtual users
        const clientIp = `192.168.1.${clientIndex}`;
        launched++;
        inFlight++;
        fetchHttp(url, clientIp).then(({ status, latencyMs }) => {
          inFlight--;
          completed++;
          latencies.push(latencyMs);
          if (status >= 200 && status < 400) {
            successful++;
          } else {
            failed++;
          }
          if (completed >= totalRequests) {
            resolve();
          } else {
            launchNext();
          }
        });
      }
    };
    launchNext();
  });

  const durationMs = performance.now() - testStart;
  const percentiles = computePercentiles(latencies);
  const requestsPerSecond = Math.round((totalRequests / (durationMs / 1000)) * 10) / 10;

  const metrics: BenchmarkMetrics = {
    totalRequests,
    successfulRequests: successful,
    failedRequests: failed,
    durationMs: Math.round(durationMs),
    requestsPerSecond,
    ...percentiles,
  };

  return {
    endpoint,
    concurrency,
    metrics,
    targetMet: metrics.p95Ms < 200 && metrics.failedRequests === 0,
  };
}

export async function runLoadBenchmark(
  existingBaseUrl?: string,
): Promise<LoadTestSuiteResult> {
  let app: any = null;
  let baseUrl = existingBaseUrl;

  if (!baseUrl) {
    // Check if port 4000 is already active
    const check = await fetchHttp('http://127.0.0.1:4000/health');
    if (check.status === 200) {
      baseUrl = 'http://127.0.0.1:4000';
    } else {
      // Boot ephemeral NestJS instance on 4005
      const created = await createApp();
      app = created.app;
      await app.listen(4005, '127.0.0.1');
      baseUrl = 'http://127.0.0.1:4005';
    }
  }

  try {
    // Warm-up phase (10 requests) to prime DB connection pool & Node JIT
    for (let i = 0; i < 5; i++) {
      await fetchHttp(`${baseUrl}/health`);
      await fetchHttp(`${baseUrl}/api/v1/categories`);
    }

    const scenarios: LoadTestScenarioResult[] = [];

    // Scenario 1: Health Liveness (/health)
    scenarios.push(await runScenario(baseUrl, '/health', 100, 10));

    // Scenario 2: Health Readiness with DB/Redis probes (/health/ready)
    scenarios.push(await runScenario(baseUrl, '/health/ready', 100, 10));

    // Scenario 3: Public Catalog Categories (/api/v1/categories)
    scenarios.push(await runScenario(baseUrl, '/api/v1/categories', 100, 10));

    // Scenario 4: Public Catalog Filtered Products (/api/v1/products?limit=12)
    scenarios.push(await runScenario(baseUrl, '/api/v1/products?limit=12', 100, 10));

    const allPassed = scenarios.every((s) => s.targetMet);

    return {
      timestamp: new Date().toISOString(),
      targetP95Ms: 200,
      scenarios,
      overallStatus: allPassed ? 'PASS' : 'FAIL',
    };
  } finally {
    if (app) {
      await app.close();
    }
  }
}

// CLI Execution
if (process.argv[1]?.endsWith('load-test.ts')) {
  runLoadBenchmark()
    .then((result) => {
      console.log('\n======================================================');
      console.log('       ARVEN API LOAD & BENCHMARK REPORT (k6/HTTP)     ');
      console.log('======================================================');
      console.log(`Timestamp: ${result.timestamp}`);
      console.log(`Target P95 Latency: < ${result.targetP95Ms}ms`);
      console.log(`Overall Benchmark Status: ${result.overallStatus}`);
      console.log('------------------------------------------------------');
      for (const sc of result.scenarios) {
        console.log(`[${sc.targetMet ? 'PASS' : 'FAIL'}] ${sc.endpoint}`);
        console.log(`  Requests: ${sc.metrics.successfulRequests}/${sc.metrics.totalRequests} | Concurrency: ${sc.concurrency}`);
        console.log(`  P50: ${sc.metrics.p50Ms}ms | P90: ${sc.metrics.p90Ms}ms | P95: ${sc.metrics.p95Ms}ms | P99: ${sc.metrics.p99Ms}ms`);
        console.log(`  Throughput: ${sc.metrics.requestsPerSecond} req/s | Duration: ${sc.metrics.durationMs}ms`);
        console.log('------------------------------------------------------');
      }
      process.exit(result.overallStatus === 'PASS' ? 0 : 1);
    })
    .catch((err) => {
      console.error('Load benchmark execution failed:', err);
      process.exit(1);
    });
}
