const config = require('../config/app.config');

class ParseRequest {
    constructor(data) {
        this.url = data.url;
        this.itemSelector = data.itemSelector || 'body';
        this.paginationType = data.paginationType || 'query';
        this.paginationConfig = data.paginationConfig || {};
        this.fileExtension = data.fileExtension || 'json';
        this.maxPages = parseInt(data.maxPages) || config.parsing.defaultMaxPages;
        this.delay = parseInt(data.delay) || config.parsing.defaultDelay;
        this.tagSelectors = data.tagSelectors || [];
        this.usePuppeteer = data.usePuppeteer || false;
        
        // Новые параметры для улучшенного парсинга
        this.xpathSelectors = data.xpathSelectors || [];
        this.enableSmartAnalysis = data.enableSmartAnalysis !== false;
        this.spa = data.spa || false;
        this.infiniteScrolling = data.infiniteScrolling || false;
        this.waitStrategy = data.waitStrategy || 'networkidle2';
        this.customWaitSelector = data.customWaitSelector || null;
        this.enableDataValidation = data.enableDataValidation !== false;
        this.validationSchema = data.validationSchema || null;
        this.includeMetadata = data.includeMetadata || false;
        this.strategy = data.strategy || null; // Принудительный выбор стратегии
        
        this.validate();
    }
    
    validate() {
        const errors = [];
        
        // Валидация URL
        if (!this.url) {
            errors.push('URL является обязательным полем');
        } else if (this.url.length > config.validation.maxUrlLength) {
            errors.push(`URL не должен превышать ${config.validation.maxUrlLength} символов`);
        } else if (!this.isValidUrl(this.url)) {
            errors.push('Неверный формат URL');
        }
        
        // Валидация селекторов
        if (this.tagSelectors.length > config.validation.maxSelectorsCount) {
            errors.push(`Количество селекторов не должно превышать ${config.validation.maxSelectorsCount}`);
        }
        
        // Валидация XPath селекторов
        if (this.xpathSelectors && this.xpathSelectors.length > 0) {
            if (this.xpathSelectors.length > config.validation.maxSelectorsCount) {
                errors.push(`Количество XPath селекторов не должно превышать ${config.validation.maxSelectorsCount}`);
            }
            
            // Валидация структуры XPath селекторов
            this.xpathSelectors.forEach((xpathConfig, index) => {
                if (typeof xpathConfig === 'string') {
                    // Простой формат - только XPath
                    if (!xpathConfig.trim()) {
                        errors.push(`XPath селектор ${index + 1} не может быть пустым`);
                    }
                } else if (typeof xpathConfig === 'object') {
                    // Расширенный формат
                    if (!xpathConfig.xpath || !xpathConfig.xpath.trim()) {
                        errors.push(`XPath селектор ${index + 1} должен содержать поле 'xpath'`);
                    }
                    if (!xpathConfig.name || !xpathConfig.name.trim()) {
                        errors.push(`XPath селектор ${index + 1} должен содержать поле 'name'`);
                    }
                    if (xpathConfig.type && !['text', 'html', 'attribute'].includes(xpathConfig.type)) {
                        errors.push(`Неподдерживаемый тип XPath селектора: ${xpathConfig.type}`);
                    }
                } else {
                    errors.push(`XPath селектор ${index + 1} имеет неверный формат`);
                }
            });
        }
        
        // Валидация максимального количества страниц
        if (this.maxPages > config.validation.maxPagesLimit) {
            errors.push(`Максимальное количество страниц не должно превышать ${config.validation.maxPagesLimit}`);
        }
        
        // Валидация формата файла
        if (!config.export.allowedFormats.includes(this.fileExtension)) {
            errors.push(`Неподдерживаемый формат файла: ${this.fileExtension}`);
        }
        
        // Валидация типа пагинации
        const allowedPaginationTypes = ['query', 'path', 'button', 'infinite', 'none'];
        if (!allowedPaginationTypes.includes(this.paginationType)) {
            errors.push(`Неподдерживаемый тип пагинации: ${this.paginationType}`);
        }
        
        // Валидация стратегий ожидания
        const allowedWaitStrategies = ['networkidle0', 'networkidle2', 'domcontentloaded', 'load'];
        if (!allowedWaitStrategies.includes(this.waitStrategy)) {
            errors.push(`Неподдерживаемая стратегия ожидания: ${this.waitStrategy}`);
        }
        
        // Валидация принудительной стратегии
        if (this.strategy) {
            const allowedStrategies = ['cheerio', 'puppeteer', 'xpath', 'smart-puppeteer'];
            if (!allowedStrategies.includes(this.strategy)) {
                errors.push(`Неподдерживаемая стратегия парсинга: ${this.strategy}`);
            }
        }
        
        // Логические проверки
        if (this.spa && !this.usePuppeteer && this.strategy !== 'smart-puppeteer') {
            errors.push('SPA поддержка требует использования Puppeteer или Smart Puppeteer стратегии');
        }
        
        if (this.infiniteScrolling && !this.usePuppeteer && this.strategy !== 'smart-puppeteer') {
            errors.push('Infinite scrolling требует использования Puppeteer или Smart Puppeteer стратегии');
        }
        
        if (this.xpathSelectors.length > 0 && this.strategy && !['xpath', 'smart-puppeteer'].includes(this.strategy)) {
            errors.push('XPath селекторы поддерживаются только стратегиями xpath и smart-puppeteer');
        }
        
        // Валидация схемы валидации данных
        if (this.validationSchema && typeof this.validationSchema !== 'object') {
            errors.push('Схема валидации должна быть объектом');
        }
        
        if (errors.length > 0) {
            throw new Error(`Ошибки валидации: ${errors.join(', ')}`);
        }
    }
    
    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    }
    
    // Нормализация XPath селекторов к единому формату
    normalizeXPathSelectors() {
        return this.xpathSelectors.map((selector, index) => {
            if (typeof selector === 'string') {
                return {
                    xpath: selector,
                    name: `xpath_field_${index + 1}`,
                    type: 'text',
                    multiple: false,
                    fallback: null
                };
            }
            
            return {
                xpath: selector.xpath,
                name: selector.name,
                type: selector.type || 'text',
                attribute: selector.attribute || null,
                multiple: selector.multiple || false,
                fallback: selector.fallback || null
            };
        });
    }
    
    // Определение подходящей стратегии на основе параметров
    getSuggestedStrategy() {
        if (this.strategy) {
            return this.strategy;
        }
        
        // Умный выбор стратегии
        if (this.spa || this.infiniteScrolling || this.enableSmartAnalysis) {
            return 'smart-puppeteer';
        }
        
        if (this.xpathSelectors.length > 0) {
            return 'xpath';
        }
        
        if (this.usePuppeteer) {
            return 'puppeteer';
        }
        
        return 'cheerio';
    }
    
    // Проверка совместимости параметров
    checkCompatibility() {
        const warnings = [];
        
        if (this.enableSmartAnalysis && this.strategy === 'cheerio') {
            warnings.push('Интеллектуальный анализ работает лучше с Puppeteer стратегиями');
        }
        
        if (this.spa && this.delay < 2000) {
            warnings.push('Для SPA рекомендуется увеличить задержку до 2+ секунд');
        }
        
        if (this.maxPages > 10 && this.strategy === 'smart-puppeteer') {
            warnings.push('Smart Puppeteer может быть медленным для большого количества страниц');
        }
        
        if (this.infiniteScrolling && this.paginationType !== 'infinite') {
            warnings.push('При infinite scrolling рекомендуется установить paginationType = "infinite"');
        }
        
        return warnings;
    }
    
    toJSON() {
        return {
            url: this.url,
            itemSelector: this.itemSelector,
            paginationType: this.paginationType,
            paginationConfig: this.paginationConfig,
            fileExtension: this.fileExtension,
            maxPages: this.maxPages,
            delay: this.delay,
            tagSelectors: this.tagSelectors,
            usePuppeteer: this.usePuppeteer,
            
            // Новые параметры
            xpathSelectors: this.normalizeXPathSelectors(),
            enableSmartAnalysis: this.enableSmartAnalysis,
            spa: this.spa,
            infiniteScrolling: this.infiniteScrolling,
            waitStrategy: this.waitStrategy,
            customWaitSelector: this.customWaitSelector,
            enableDataValidation: this.enableDataValidation,
            validationSchema: this.validationSchema,
            includeMetadata: this.includeMetadata,
            strategy: this.strategy,
            
            // Дополнительная информация
            suggestedStrategy: this.getSuggestedStrategy(),
            compatibilityWarnings: this.checkCompatibility()
        };
    }
}

module.exports = ParseRequest; 