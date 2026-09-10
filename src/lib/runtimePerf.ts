import { NextResponse } from "next/server";

type SpanKind = "db" | "external";
type TimedOperation<T> = () => PromiseLike<T> | Promise<T>;
type Interval = { start: number; end: number };

function roundMs(value: number) {
  return Math.round(value * 100) / 100;
}

function mergedDuration(intervals: Interval[]) {
  if (intervals.length === 0) return 0;

  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let start = sorted[0].start;
  let end = sorted[0].end;

  for (let index = 1; index < sorted.length; index++) {
    const interval = sorted[index];
    if (interval.start <= end) {
      end = Math.max(end, interval.end);
      continue;
    }

    total += end - start;
    start = interval.start;
    end = interval.end;
  }

  return total + end - start;
}

function approximateJsonBytes(body: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(body)).byteLength;
  } catch {
    return null;
  }
}

export function createRuntimePerf(endpoint: string) {
  const enabled = process.env.PERF_INSTRUMENTATION === "1";
  const startedAt = performance.now();
  const requestId = enabled ? crypto.randomUUID() : null;
  const intervals: Record<SpanKind, Interval[]> = { db: [], external: [] };
  let dbOperations = 0;
  let status = 500;
  let responseBytes: number | null = null;

  async function time<T>(kind: SpanKind, operation: TimedOperation<T>, operations = 1) {
    if (!enabled) return await operation();

    const spanStartedAt = performance.now();
    if (kind === "db") dbOperations += operations;
    try {
      return await operation();
    } finally {
      intervals[kind].push({ start: spanStartedAt, end: performance.now() });
    }
  }

  return {
    db<T>(operation: TimedOperation<T>, operations = 1) {
      return time("db", operation, operations);
    },

    external<T>(operation: TimedOperation<T>) {
      return time("external", operation);
    },

    json(body: unknown, init?: ResponseInit) {
      status = init?.status ?? 200;
      if (enabled) responseBytes = approximateJsonBytes(body);
      return NextResponse.json(body, init);
    },

    finish() {
      if (!enabled) return;

      const finishedAt = performance.now();
      const totalMs = finishedAt - startedAt;
      const dbMs = mergedDuration(intervals.db);
      const externalMs = mergedDuration(intervals.external);
      const nonAppMs = mergedDuration([...intervals.db, ...intervals.external]);

      console.info(
        "PERF",
        JSON.stringify({
          endpoint,
          request_id: requestId,
          status,
          total_ms: roundMs(totalMs),
          db_ms: roundMs(dbMs),
          app_ms: roundMs(Math.max(0, totalMs - nonAppMs)),
          external_ms: roundMs(externalMs),
          db_operations: dbOperations,
          response_bytes_approx: responseBytes,
        })
      );
    },
  };
}
