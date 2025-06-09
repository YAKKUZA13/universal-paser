class Logger {
    static LOG_LEVELS = {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3
    };
    
    static currentLevel = process.env.LOG_LEVEL === 'production' 
        ? Logger.LOG_LEVELS.INFO 
        : Logger.LOG_LEVELS.DEBUG;
    
    static formatMessage(level, message, context = {}) {
        const timestamp = new Date().toISOString();
        const contextStr = Object.keys(context).length > 0 
            ? ` [${JSON.stringify(context)}]` 
            : '';
        return `[${timestamp}] [${level}]${contextStr} ${message}`;
    }
    
    static error(message, context = {}) {
        if (Logger.currentLevel >= Logger.LOG_LEVELS.ERROR) {
            console.error(Logger.formatMessage('ERROR', message, context));
        }
    }
    
    static warn(message, context = {}) {
        if (Logger.currentLevel >= Logger.LOG_LEVELS.WARN) {
            console.warn(Logger.formatMessage('WARN', message, context));
        }
    }
    
    static info(message, context = {}) {
        if (Logger.currentLevel >= Logger.LOG_LEVELS.INFO) {
            console.log(Logger.formatMessage('INFO', message, context));
        }
    }
    
    static debug(message, context = {}) {
        if (Logger.currentLevel >= Logger.LOG_LEVELS.DEBUG) {
            console.log(Logger.formatMessage('DEBUG', message, context));
        }
    }
    
    static setLevel(level) {
        if (typeof level === 'string') {
            level = Logger.LOG_LEVELS[level.toUpperCase()] ?? Logger.LOG_LEVELS.INFO;
        }
        Logger.currentLevel = level;
    }
}

module.exports = Logger; 