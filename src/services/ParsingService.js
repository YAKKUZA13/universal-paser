const ParseRequest = require('../models/ParseRequest');
const ParseResult = require('../models/ParseResult');
const CheerioParsingStrategy = require('../strategies/CheerioParsingStrategy');
const PuppeteerParsingStrategy = require('../strategies/PuppeteerParsingStrategy');
const XPathParsingStrategy = require('../strategies/XPathParsingStrategy');
const SmartPuppeteerStrategy = require('../strategies/SmartPuppeteerStrategy');
const PageStructureAnalyzer = require('../intelligence/PageStructureAnalyzer');
const DataValidator = require('../validators/DataValidator');
const Logger = require('../utils/logger');

class ParsingService {
    constructor() {
        this.strategies = new Map();
        this.structureAnalyzer = new PageStructureAnalyzer();
        this.dataValidator = new DataValidator();
        this.fallbackStrategies = new Map();
        this.registerDefaultStrategies();
        this.setupFallbackStrategies();
    }
    
    registerDefaultStrategies() {
        this.strategies.set('cheerio', new CheerioParsingStrategy());
        this.strategies.set('puppeteer', new PuppeteerParsingStrategy());
        this.strategies.set('xpath', new XPathParsingStrategy());
        this.strategies.set('smart-puppeteer', new SmartPuppeteerStrategy());
        
        Logger.info('Зарегистрированы стратегии парсинга', {
            strategies: Array.from(this.strategies.keys())
        });
    }
    
    setupFallbackStrategies() {
        // Настройка fallback стратегий
        this.fallbackStrategies.set('cheerio', ['xpath']);
        this.fallbackStrategies.set('puppeteer', ['cheerio', 'xpath']);
        this.fallbackStrategies.set('xpath', ['cheerio']);
        this.fallbackStrategies.set('smart-puppeteer', ['puppeteer', 'cheerio']);
        
        Logger.info('Настроены fallback стратегии', {
            fallbacks: Object.fromEntries(this.fallbackStrategies)
        });
    }
    
    registerStrategy(name, strategy) {
        this.strategies.set(name, strategy);
        Logger.info(`Зарегистрирована новая стратегия парсинга: ${name}`);
    }
    
    async parse(requestData) {
        // Валидируем и создаем объект запроса
        const parseRequest = new ParseRequest(requestData);
        
        // Создаем объект результата
        const result = new ParseResult();
        
        // Выбираем стратегию парсинга
        const strategy = this.selectStrategy(parseRequest);
        
        // Определяем правильное имя стратегии 
        let strategyName = null;
        for (const [key, value] of this.strategies.entries()) {
            if (value === strategy) {
                strategyName = key;
                break;
            }
        }
        
        if (!strategyName) {
            throw new Error('Не удалось определить имя выбранной стратегии');
        }
        
        Logger.info('Начинаем парсинг с улучшенной логикой', {
            url: parseRequest.url,
            strategy: strategyName,
            maxPages: parseRequest.maxPages,
            enableValidation: requestData.enableDataValidation !== false
        });
        
        try {
            // Выполняем парсинг с возможностью fallback
            await this.parseWithFallback(parseRequest, result, strategyName);
            
            // Валидируем и очищаем данные если включено
            if (requestData.enableDataValidation !== false) {
                await this.validateAndCleanData(result, requestData.validationSchema);
            }
            
            // Финализируем результат
            result.finalize();
            
            Logger.info('Парсинг успешно завершен', {
                totalItems: result.metadata.totalItems,
                duration: result.metadata.duration,
                strategy: strategyName,
                successRate: result.getSuccessRate(),
                validationEnabled: requestData.enableDataValidation !== false
            });
            
            return result;
            
        } catch (error) {
            Logger.error('Критическая ошибка при парсинге', {
                error: error.message,
                url: parseRequest.url,
                strategy: strategyName
            });
            
            result.addError(error);
            result.finalize();
            throw error;
        }
    }
    
    async parseWithFallback(parseRequest, result, primaryStrategyName) {
        const primaryStrategy = this.strategies.get(primaryStrategyName);
        
        // Добавляем детальную отладку
        Logger.info('Отладка стратегий', {
            primaryStrategyName,
            strategyExists: !!primaryStrategy,
            strategyName: primaryStrategy?.name,
            availableStrategies: Array.from(this.strategies.keys()),
            strategyType: typeof primaryStrategy,
            hasParseMethod: primaryStrategy && typeof primaryStrategy.parse === 'function'
        });
        
        if (!primaryStrategy) {
            throw new Error(`Стратегия '${primaryStrategyName}' не найдена в зарегистрированных стратегиях: ${Array.from(this.strategies.keys()).join(', ')}`);
        }
        
        if (typeof primaryStrategy.parse !== 'function') {
            throw new Error(`Стратегия '${primaryStrategyName}' не имеет метода parse. Тип: ${typeof primaryStrategy}, Методы: ${Object.getOwnPropertyNames(primaryStrategy)}`);
        }
        
        try {
            // Пытаемся парсить основной стратегией
            await primaryStrategy.parse(parseRequest.url, parseRequest, result);
            
            // Проверяем качество результата
            const qualityScore = this.assessResultQuality(result);
            
            if (qualityScore < 0.3) {
                Logger.warn('Низкое качество результата, пробуем fallback стратегию', {
                    primaryStrategy: primaryStrategyName,
                    qualityScore,
                    itemsFound: result.metadata.totalItems
                });
                
                // Пробуем fallback стратегии
                await this.tryFallbackStrategies(parseRequest, result, primaryStrategyName);
            }
            
        } catch (error) {
            Logger.error('Ошибка в основной стратегии, переходим к fallback', {
                primaryStrategy: primaryStrategyName,
                error: error.message,
                stack: error.stack
            });
            
            result.addError(error);
            
            // Пробуем fallback стратегии
            await this.tryFallbackStrategies(parseRequest, result, primaryStrategyName);
        }
    }
    
    async tryFallbackStrategies(parseRequest, result, failedStrategyName) {
        const fallbackNames = this.fallbackStrategies.get(failedStrategyName) || [];
        
        for (const fallbackName of fallbackNames) {
            try {
                Logger.info(`Пробуем fallback стратегию: ${fallbackName}`);
                
                const fallbackStrategy = this.strategies.get(fallbackName);
                if (!fallbackStrategy) {
                    continue;
                }
                
                // Создаем новый объект результата для fallback
                const fallbackResult = new ParseResult();
                
                await fallbackStrategy.parse(parseRequest.url, parseRequest, fallbackResult);
                
                // Если fallback стратегия дала лучший результат, используем его
                if (fallbackResult.metadata.totalItems > result.metadata.totalItems) {
                    Logger.info('Fallback стратегия дала лучший результат', {
                        fallbackStrategy: fallbackName,
                        originalItems: result.metadata.totalItems,
                        fallbackItems: fallbackResult.metadata.totalItems
                    });
                    
                    // Объединяем результаты
                    result.addItems(fallbackResult.items);
                    result.metadata.pagesProcessed += fallbackResult.metadata.pagesProcessed;
                    result.statistics.successfulRequests += fallbackResult.statistics.successfulRequests;
                    
                    break;
                }
                
            } catch (error) {
                Logger.warn(`Fallback стратегия ${fallbackName} также не удалась`, {
                    error: error.message
                });
                result.addError(error);
            }
        }
    }
    
    assessResultQuality(result) {
        const itemsCount = result.metadata.totalItems;
        const successRate = result.getSuccessRate();
        const errorsCount = result.metadata.errors.length;
        
        // Простая оценка качества (можно улучшить)
        let score = 0;
        
        // Баллы за количество найденных элементов
        if (itemsCount > 0) score += 0.3;
        if (itemsCount > 10) score += 0.2;
        if (itemsCount > 50) score += 0.1;
        
        // Баллы за успешность запросов
        score += successRate * 0.3;
        
        // Штраф за ошибки
        score -= Math.min(errorsCount * 0.1, 0.3);
        
        return Math.max(0, Math.min(1, score));
    }
    
    async validateAndCleanData(result, validationSchema = null) {
        if (result.metadata.totalItems === 0) {
            Logger.debug('Нет данных для валидации');
            return;
        }
        
        Logger.info('Начинаем валидацию и очистку данных', {
            itemsCount: result.metadata.totalItems,
            hasCustomSchema: !!validationSchema
        });
        
        try {
            // Генерируем схему валидации если не предоставлена
            const schema = validationSchema || this.dataValidator.generateValidationSchema(result.items);
            
            // Валидируем данные
            const validationResult = this.dataValidator.validateData(result.items, schema);
            
            if (validationResult.isValid) {
                // Заменяем исходные данные очищенными
                result.items = validationResult.cleanedData;
                result.metadata.totalItems = validationResult.statistics.validItems;
                
                Logger.info('Данные успешно валидированы и очищены', {
                    validItems: validationResult.statistics.validItems,
                    invalidItems: validationResult.statistics.invalidItems,
                    cleanedItems: validationResult.statistics.cleanedItems
                });
                
                // Добавляем предупреждения о валидации
                validationResult.warnings.forEach(warning => {
                    result.addWarning(`Валидация: ${warning.message}`);
                });
                
            } else {
                Logger.warn('Валидация данных не прошла', {
                    errorsCount: validationResult.errors.length,
                    validItems: validationResult.statistics.validItems,
                    invalidItems: validationResult.statistics.invalidItems
                });
                
                // Добавляем ошибки валидации в результат
                validationResult.errors.forEach(error => {
                    result.addError(new Error(`Валидация: ${error.message}`));
                });
                
                // Все равно используем очищенные данные, если есть валидные элементы
                if (validationResult.statistics.validItems > 0) {
                    result.items = validationResult.cleanedData;
                    result.metadata.totalItems = validationResult.statistics.validItems;
                }
            }
            
        } catch (error) {
            Logger.error('Ошибка при валидации данных', {
                error: error.message
            });
            result.addError(error);
        } finally {
            // Очищаем кэш валидатора
            this.dataValidator.clearCache();
        }
    }
    
    async analyzePageStructure(url) {
        try {
            Logger.info('Выполняем анализ структуры страницы', { url });
            
            // Получаем HTML страницы
            const strategy = this.strategies.get('cheerio');
            const html = await strategy.fetchPage(url);
            
            // Анализируем структуру
            const analysis = await this.structureAnalyzer.analyzePageStructure(html, url);
            
            Logger.info('Анализ структуры завершен', {
                pageType: analysis.pageType,
                confidence: analysis.confidence,
                patterns: analysis.dataPatterns.length,
                suggestions: Object.keys(analysis.suggestedSelectors).length
            });
            
            return analysis;
            
        } catch (error) {
            Logger.error('Ошибка при анализе структуры страницы', {
                error: error.message,
                url
            });
            throw error;
        }
    }
    
    selectStrategy(parseRequest) {
        // Если стратегия явно указана, используем её
        if (parseRequest.strategy) {
            const requestedStrategy = this.strategies.get(parseRequest.strategy);
            if (requestedStrategy) {
                Logger.info('Используем явно указанную стратегию', {
                    strategy: parseRequest.strategy,
                    hasXPath: parseRequest.xpathSelectors.length > 0,
                    spa: parseRequest.spa,
                    smartAnalysis: parseRequest.enableSmartAnalysis
                });
                return requestedStrategy;
            } else {
                Logger.warn('Запрошенная стратегия не найдена, выбираем автоматически', {
                    requestedStrategy: parseRequest.strategy,
                    availableStrategies: Array.from(this.strategies.keys())
                });
            }
        }

        // Интеллектуальный выбор стратегии
        if (parseRequest.usePuppeteer) {
            // Если запрошен Puppeteer, выбираем между обычным и умным
            if (parseRequest.spa || parseRequest.infiniteScrolling || parseRequest.enableSmartAnalysis) {
                return this.strategies.get('smart-puppeteer');
            }
            return this.strategies.get('puppeteer');
        }
        
        // Если есть XPath селекторы, используем XPath стратегию
        if (parseRequest.xpathSelectors && parseRequest.xpathSelectors.length > 0) {
            return this.strategies.get('xpath');
        }

        // Если включены SPA или smart анализ, используем smart-puppeteer
        if (parseRequest.spa || parseRequest.infiniteScrolling || parseRequest.enableSmartAnalysis) {
            return this.strategies.get('smart-puppeteer');
        }
        
        // По умолчанию используем Cheerio для лучшей производительности
        return this.strategies.get('cheerio');
    }
    
    async parseWithCustomStrategy(requestData, strategyName) {
        if (!this.strategies.has(strategyName)) {
            throw new Error(`Стратегия '${strategyName}' не найдена`);
        }
        
        const parseRequest = new ParseRequest(requestData);
        const result = new ParseResult();
        const strategy = this.strategies.get(strategyName);
        
        Logger.info('Парсинг с пользовательской стратегией', {
            url: parseRequest.url,
            strategy: strategyName
        });
        
        try {
            await strategy.parse(parseRequest.url, parseRequest, result);
            
            // Валидация данных если включена
            if (requestData.enableDataValidation !== false) {
                await this.validateAndCleanData(result, requestData.validationSchema);
            }
            
            result.finalize();
            return result;
        } catch (error) {
            result.addError(error);
            result.finalize();
            throw error;
        }
    }
    
    getAvailableStrategies() {
        return Array.from(this.strategies.keys()).map(name => ({
            name,
            displayName: this.getStrategyDisplayName(name),
            features: this.getStrategyFeatures(name)
        }));
    }
    
    getStrategyDisplayName(strategyName) {
        const displayNames = {
            'cheerio': 'Cheerio (Быстрый)',
            'puppeteer': 'Puppeteer (JavaScript поддержка)',
            'xpath': 'XPath (Продвинутые селекторы)',
            'smart-puppeteer': 'Smart Puppeteer (ИИ + SPA поддержка)'
        };
        
        return displayNames[strategyName] || strategyName;
    }
    
    getStrategyFeatures(strategyName) {
        const features = {
            'cheerio': ['Быстрый', 'Статический HTML', 'CSS селекторы'],
            'puppeteer': ['JavaScript', 'Динамический контент', 'Автоскроллинг'],
            'xpath': ['XPath селекторы', 'Продвинутые запросы', 'Конвертация CSS в XPath'],
            'smart-puppeteer': ['ИИ анализ', 'SPA поддержка', 'Infinite scrolling', 'Fallback стратегии']
        };
        
        return features[strategyName] || [];
    }
    
    async validateUrl(url) {
        try {
            // Простая проверка доступности URL
            const strategy = this.strategies.get('cheerio');
            await strategy.fetchPage(url);
            return { valid: true, accessible: true };
        } catch (error) {
            Logger.warn('URL недоступен', { url, error: error.message });
            return { 
                valid: false, 
                accessible: false, 
                error: error.message 
            };
        }
    }
    
    async estimateParsingTime(requestData) {
        const parseRequest = new ParseRequest(requestData);
        
        // Базовая оценка времени с учетом новых стратегий
        const strategy = this.selectStrategy(parseRequest);
        
        let baseTimePerPage;
        switch (strategy.name) {
            case 'SmartPuppeteer':
                baseTimePerPage = 8000; // Умная стратегия медленнее
                break;
            case 'Puppeteer':
                baseTimePerPage = 5000;
                break;
            case 'XPath':
                baseTimePerPage = 3000;
                break;
            default:
                baseTimePerPage = 2000; // Cheerio
        }
        
        const delayTime = parseRequest.delay * (parseRequest.maxPages - 1);
        const estimatedTime = (baseTimePerPage * parseRequest.maxPages) + delayTime;
        
        return {
            estimatedTime,
            strategy: strategy.name,
            pages: parseRequest.maxPages,
            features: this.getStrategyFeatures(strategy.name.toLowerCase())
        };
    }
}

module.exports = ParsingService; 