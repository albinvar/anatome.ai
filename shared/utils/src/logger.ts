import winston from 'winston';

const { combine, timestamp, json, errors, colorize, simple } = winston.format;

export const createLogger = (service: string) => {
  const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
      errors({ stack: true }),
      timestamp(),
      json()
    ),
    defaultMeta: { service },
    transports: [
      new winston.transports.Console({
        format: process.env.NODE_ENV === 'development'
          ? combine(colorize(), simple())
          : json(),
      }),
    ],
  });

  if (process.env.NODE_ENV === 'production') {
    logger.add(new winston.transports.File({
      filename: `logs/${service}-error.log`,
      level: 'error',
    }));
    
    logger.add(new winston.transports.File({
      filename: `logs/${service}-combined.log`,
    }));
  }

  return logger;
};

export class Logger {
  private logger: winston.Logger;

  constructor(service: string) {
    this.logger = createLogger(service);
  }

  info(message: string, meta?: any) {
    this.logger.info(message, meta);
  }

  error(message: string, error?: Error | any) {
    this.logger.error(message, { error: error?.stack || error });
  }

  warn(message: string, meta?: any) {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: any) {
    this.logger.debug(message, meta);
  }

  http(message: string, meta?: any) {
    this.logger.http(message, meta);
  }
}