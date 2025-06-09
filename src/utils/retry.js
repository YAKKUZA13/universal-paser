const Logger = require('./logger');

class RetryUtils {
    static async withRetry(fn, options = {}) {
        const {
            maxAttempts = 3,
            baseDelay = 1000,
            maxDelay = 10000,
            backoffFactor = 2,
            shouldRetry = () => true
        } = options;
        
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                Logger.debug(`Попытка ${attempt}/${maxAttempts}`);
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxAttempts || !shouldRetry(error)) {
                    Logger.error(`Все попытки исчерпаны или ошибка не подлежит повтору`, {
                        error: error.message,
                        attempt,
                        maxAttempts
                    });
                    throw error;
                }
                
                const delay = Math.min(
                    baseDelay * Math.pow(backoffFactor, attempt - 1),
                    maxDelay
                );
                
                Logger.warn(`Попытка ${attempt} неудачна, повтор через ${delay}мс`, {
                    error: error.message
                });
                
                await RetryUtils.sleep(delay);
            }
        }
        
        throw lastError;
    }
    
    static sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    static isRetryableError(error) {
        // Определяем, стоит ли повторять запрос при данной ошибке
        const retryableErrors = [
            'ECONNRESET',
            'ETIMEDOUT',
            'ENOTFOUND',
            'EAI_AGAIN',
            'ECONNREFUSED'
        ];
        
        const retryableStatuses = [408, 429, 500, 502, 503, 504];
        
        return (
            retryableErrors.some(code => error.code === code) ||
            retryableStatuses.includes(error.response?.status) ||
            error.message.includes('timeout') ||
            error.message.includes('network')
        );
    }
}

module.exports = RetryUtils; 