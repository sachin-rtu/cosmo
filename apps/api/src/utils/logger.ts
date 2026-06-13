import pino from 'pino'

const pinoLogger = pino()

// Wrapper to accept multiple arguments like console.log
export const logger = {
    info: (...args: any[]) => pinoLogger.info({ msg: args.map(String).join(' '), args }),
    warn: (...args: any[]) => pinoLogger.warn({ msg: args.map(String).join(' '), args }),
    error: (...args: any[]) => pinoLogger.error({ msg: args.map(String).join(' '), args }),
}
