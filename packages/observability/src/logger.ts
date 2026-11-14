import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import { getRequestContext } from './context.js';
import { ARVEN_REDACT_PATHS } from './redaction.js';

export type ArvenLogger = Logger;

export interface CreateLoggerOptions {
  service: string;
  level?: string;
  env?: string;
  destination?: DestinationStream;
}

/**
 * Creates a structured JSON Pino logger with mandatory secret/PII redaction and requestId correlation.
 */
export function createLogger(options: CreateLoggerOptions): ArvenLogger {
  const loggerOptions: LoggerOptions = {
    level: options.level ?? 'info',
    base: {
      service: options.service,
      env: options.env ?? process.env.NODE_ENV ?? 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ARVEN_REDACT_PATHS,
      censor: '[Redacted]',
    },
    mixin() {
      const ctx = getRequestContext();
      if (!ctx) {
        return {};
      }
      const fields: Record<string, string> = { requestId: ctx.requestId };
      if (ctx.actorId) {
        fields.actorId = ctx.actorId;
      }
      return fields;
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
  };

  return options.destination ? pino(loggerOptions, options.destination) : pino(loggerOptions);
}
