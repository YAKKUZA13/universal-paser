const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

// Импортируем новые модули
const config = require('./config/app.config');
const ParsingController = require('./controllers/ParsingController');
const { errorHandler, notFoundHandler, requestLogger } = require('./middleware/errorHandler');
const Logger = require('./utils/logger');

const app = express();
const port = config.server.port;

// Инициализируем контроллер
const parsingController = new ParsingController();

// Middleware
app.use(requestLogger);
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes - Основные
app.post('/parse', (req, res, next) => parsingController.parse(req, res, next));
app.post('/validate-url', (req, res, next) => parsingController.validateUrl(req, res, next));
app.post('/estimate-time', (req, res, next) => parsingController.estimateTime(req, res, next));
app.get('/strategies', (req, res, next) => parsingController.getStrategies(req, res, next));
app.post('/parse-with-strategy', (req, res, next) => parsingController.parseWithStrategy(req, res, next));

// API Routes - Интеллектуальные возможности
app.post('/analyze-structure', (req, res, next) => parsingController.analyzeStructure(req, res, next));
app.post('/parsing-preview', (req, res, next) => parsingController.getParsingPreview(req, res, next));

// API Routes - XPath поддержка
app.post('/validate-xpath', (req, res, next) => parsingController.validateXPath(req, res, next));
app.post('/convert-css-to-xpath', (req, res, next) => parsingController.convertCSSToXPath(req, res, next));

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: require('../package.json').version,
        features: {
            strategies: ['cheerio', 'puppeteer', 'xpath', 'smart-puppeteer'],
            capabilities: [
                'Интеллектуальный анализ структуры',
                'XPath селекторы',
                'SPA поддержка',
                'Fallback стратегии',
                'Валидация данных',
                'Infinite scrolling'
            ]
        }
    });
});

// API info endpoint
app.get('/api/info', (req, res) => {
    res.json({
        name: 'Universal Web Parser API v2.0',
        version: require('../package.json').version,
        description: 'Усовершенствованный парсер с ИИ возможностями',
        endpoints: {
            // Основные endpoints
            'POST /parse': {
                description: 'Основной парсинг с автоматическим выбором стратегии',
                features: ['Fallback стратегии', 'Валидация данных', 'Интеллектуальный анализ']
            },
            'POST /validate-url': {
                description: 'Валидация URL на доступность',
                features: ['Проверка доступности', 'Диагностика ошибок']
            },
            'POST /estimate-time': {
                description: 'Оценка времени парсинга',
                features: ['Умная оценка', 'Учет стратегий', 'Анализ функций']
            },
            'GET /strategies': {
                description: 'Список доступных стратегий парсинга',
                features: ['Детальная информация', 'Возможности стратегий']
            },
            'POST /parse-with-strategy': {
                description: 'Парсинг с определенной стратегией',
                features: ['Принудительный выбор', 'Расширенные настройки']
            },
            
            // Интеллектуальные возможности
            'POST /analyze-structure': {
                description: 'Анализ структуры страницы с ИИ',
                features: ['Определение типа сайта', 'Предложение селекторов', 'Анализ паттернов']
            },
            'POST /parsing-preview': {
                description: 'Предварительный просмотр результатов парсинга',
                features: ['Быстрый анализ', 'Структура данных', 'Рекомендации']
            },
            
            // XPath поддержка
            'POST /validate-xpath': {
                description: 'Валидация XPath выражений',
                features: ['Синтаксическая проверка', 'Оптимизация']
            },
            'POST /convert-css-to-xpath': {
                description: 'Конвертация CSS селекторов в XPath',
                features: ['Автоматическая конвертация', 'Валидация результата']
            },
            
            // Системные
            'GET /health': {
                description: 'Проверка работоспособности сервиса',
                features: ['Статус системы', 'Информация о возможностях']
            },
            'GET /api/info': {
                description: 'Информация об API',
                features: ['Документация endpoints', 'Описание возможностей']
            }
        },
        
        strategies: {
            'cheerio': {
                name: 'Cheerio (Быстрый)',
                features: ['Быстрый', 'Статический HTML', 'CSS селекторы'],
                use_cases: ['Статические сайты', 'Быстрый парсинг', 'Большие объемы данных']
            },
            'puppeteer': {
                name: 'Puppeteer (JavaScript поддержка)',
                features: ['JavaScript', 'Динамический контент', 'Автоскроллинг'],
                use_cases: ['Динамические сайты', 'JavaScript приложения', 'Интерактивный контент']
            },
            'xpath': {
                name: 'XPath (Продвинутые селекторы)',
                features: ['XPath селекторы', 'Продвинутые запросы', 'Конвертация CSS в XPath'],
                use_cases: ['Сложные селекторы', 'Точная навигация по DOM', 'Условные выборки']
            },
            'smart-puppeteer': {
                name: 'Smart Puppeteer (ИИ + SPA поддержка)',
                features: ['ИИ анализ', 'SPA поддержка', 'Infinite scrolling', 'Fallback стратегии'],
                use_cases: ['SPA приложения', 'Сложные сайты', 'Интеллектуальный анализ']
            }
        },
        
        new_features: {
            'v2.0': [
                'Интеллектуальный анализ структуры страниц',
                'Поддержка XPath селекторов', 
                'Улучшенная обработка SPA',
                'Fallback стратегии для надежности',
                'Автоматическая валидация и очистка данных',
                'Предварительный просмотр результатов',
                'Infinite scrolling поддержка',
                'Расширенное логирование и мониторинг'
            ]
        }
    });
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
    Logger.info('Получен сигнал SIGTERM, завершаем работу сервера...');
    process.exit(0);
});

process.on('SIGINT', () => {
    Logger.info('Получен сигнал SIGINT, завершаем работу сервера...');
    process.exit(0);
});

// Запуск сервера
app.listen(port, () => {
    Logger.info('Усовершенствованный сервер запущен', {
        port: port,
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        version: require('../package.json').version,
        features: {
            strategies: 4,
            intelligence: true,
            xpath_support: true,
            spa_support: true,
            data_validation: true
        }
    });
    
    Logger.info('Доступные endpoints v2.0:', {
        main: `http://localhost:${port}/`,
        api: `http://localhost:${port}/api/info`,
        health: `http://localhost:${port}/health`,
        analyze: `http://localhost:${port}/analyze-structure`,
        preview: `http://localhost:${port}/parsing-preview`,
        xpath: `http://localhost:${port}/validate-xpath`
    });
}); 