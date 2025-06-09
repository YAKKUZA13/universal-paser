const Logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
    Logger.error('Необработанная ошибка', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body
    });
    
    // Определяем тип ошибки и статус ответа
    let statusCode = 500;
    let message = 'Внутренняя ошибка сервера';
    
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = err.message;
    } else if (err.message.includes('URL')) {
        statusCode = 400;
        message = 'Неверный URL';
    } else if (err.message.includes('timeout')) {
        statusCode = 408;
        message = 'Превышено время ожидания запроса';
    } else if (err.message.includes('not found') || err.code === 'ENOTFOUND') {
        statusCode = 404;
        message = 'Ресурс не найден';
    }
    
    // Формируем ответ
    const response = {
        error: message,
        timestamp: new Date().toISOString()
    };
    
    // В режиме разработки добавляем стек ошибки
    if (process.env.NODE_ENV !== 'production') {
        response.stack = err.stack;
    }
    
    res.status(statusCode).json(response);
}

function notFoundHandler(req, res) {
    Logger.warn('Страница не найдена', {
        url: req.url,
        method: req.method
    });
    
    res.status(404).json({
        error: 'Страница не найдена',
        timestamp: new Date().toISOString()
    });
}

function requestLogger(req, res, next) {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        Logger.info('HTTP запрос', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            duration: `${duration}ms`,
            userAgent: req.get('User-Agent')
        });
    });
    
    next();
}

module.exports = {
    errorHandler,
    notFoundHandler,
    requestLogger
}; 