/**
 * winston 로거
 * --
 */
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import * as path from 'path';
import { app } from 'electron';

const logDir = path.join(app.getPath('userData'), 'logs');

const logFormat = winston.format.printf(
  ({ level, message, timestamp, stack }) => {
    return `${timestamp} ${level}: ${stack || message}`;
  }
);

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    logFormat
  ),
  transports: [
    new winston.transports.Console({
      level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
      format: winston.format.combine(winston.format.colorize(), logFormat),
    }),

    new winston.transports.DailyRotateFile({
      level: 'debug',
      datePattern: 'YYYY-MM-DD',
      dirname: logDir,
      filename: `%DATE%.log`,
      maxFiles: '14d',
      zippedArchive: true,
    }),

    new winston.transports.DailyRotateFile({
      level: 'error',
      datePattern: 'YYYY-MM-DD',
      dirname: logDir,
      filename: `%DATE%.error.log`,
      maxFiles: '30d',
      zippedArchive: true,
    }),
  ],

  exceptionHandlers: [
    new winston.transports.DailyRotateFile({
      dirname: logDir,
      filename: 'exceptions.log',
    }),
  ],
});

export default logger;
