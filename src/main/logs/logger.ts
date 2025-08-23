/**
 * winston 로거
 * --
 */
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import * as path from 'path';
import { app } from 'electron';

// 로그 파일이 저장될 경로
const logDir = path.join(app.getPath('userData'), 'logs');

// 로그 출력 형식 정의
const logFormat = winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} ${level}: ${stack || message}`;
});

/**
 * Winston 로거 인스턴스
 * --
 * - 개발 환경에서는 `debug` 레벨까지 콘솔에 출력
 * - 운영 환경에서는 `info` 레벨까지 콘솔에 출력
 * - 모든 로그(`debug` 포함)는 파일로 기록
 * - 로그 파일은 일자별로 생성되며, 14일이 지나면 자동 삭제
 * - 처리되지 않은 예외는 별도 파일에 기록
 */
const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }), // 에러 발생 시 스택 트레이스 포함
        logFormat,
    ),
    transports: [
        // 콘솔 출력 설정
        new winston.transports.Console({
            level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
            format: winston.format.combine(
                winston.format.colorize(), // 로그 레벨에 따라 색상 추가
                logFormat,
            ),
        }),

        // 모든 레벨 로그 파일 설정 (일자별 로테이션)
        new winston.transports.DailyRotateFile({
            level: 'debug',
            datePattern: 'YYYY-MM-DD',
            dirname: logDir,
            filename: `%DATE%.log`,
            maxFiles: '14d', // 14일치 로그 파일 저장
            zippedArchive: true, // 오래된 로그는 압축
        }),
        
        // 에러 전용 로그 파일 설정
        new winston.transports.DailyRotateFile({
            level: 'error',
            datePattern: 'YYYY-MM-DD',
            dirname: logDir,
            filename: `%DATE%.error.log`,
            maxFiles: '30d',
            zippedArchive: true,
        }),
    ],
    // 처리되지 않은 예외 로깅
    exceptionHandlers: [
        new winston.transports.DailyRotateFile({
            dirname: logDir,
            filename: 'exceptions.log',
        }),
    ],
});

export default logger;