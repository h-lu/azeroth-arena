export interface StructuredLogRecord {
  timestamp: string;
  level: "info" | "error";
  event: string;
  [key: string]: unknown;
}

export interface StructuredLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

type LogSink = (record: StructuredLogRecord) => void;

function now() {
  return new Date().toISOString();
}

function defaultSink(record: StructuredLogRecord) {
  const line = JSON.stringify(record);
  if (record.level === "error") {
    console.error(line);
    return;
  }
  console.log(line);
}

export function createStructuredLogger(sink: LogSink = defaultSink): StructuredLogger {
  return {
    info(event, fields = {}) {
      sink({
        timestamp: now(),
        level: "info",
        event,
        ...fields,
      });
    },
    error(event, fields = {}) {
      sink({
        timestamp: now(),
        level: "error",
        event,
        ...fields,
      });
    },
  };
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    name: "Error",
    message: String(error),
  };
}
