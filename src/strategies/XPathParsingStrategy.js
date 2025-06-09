const ParsingStrategy = require('./ParsingStrategy');
const XPathHelper = require('../utils/XPathHelper');
const Logger = require('../utils/logger');
const RetryUtils = require('../utils/retry');
const config = require('../config/app.config');
const axios = require('axios');

class XPathParsingStrategy extends ParsingStrategy {
    constructor() {
        super('XPath');
        this.xpathHelper = new XPathHelper();
        this.axiosConfig = {
            timeout: config.parsing.timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        };
    }
    
    validateConfig(config) {
        super.validateConfig(config);
        
        if (config.xpathSelectors && Array.isArray(config.xpathSelectors)) {
            for (const selector of config.xpathSelectors) {
                const validation = this.xpathHelper.validateXPath(selector);
                if (!validation.valid) {
                    throw new Error(`Невалидный XPath селектор "${selector}": ${validation.error}`);
                }
            }
        }
    }
    
    async parse(url, parseConfig, result) {
        this.validateConfig(parseConfig);
        
        const {
            paginationType = 'none',
            paginationConfig = {},
            itemSelector,
            xpathSelectors = [],
            maxPages = config.parsing.defaultMaxPages,
            delay = config.parsing.defaultDelay
        } = parseConfig;
        
        Logger.info(`Начинаем XPath парсинг`, { 
            url, 
            maxPages, 
            paginationType,
            xpathSelectorsCount: xpathSelectors.length,
            strategy: this.name 
        });
        
        let currentPage = 1;
        let hasNextPage = true;
        
        while (hasNextPage && currentPage <= maxPages) {
            try {
                Logger.info(`Обрабатываем страницу ${currentPage}/${maxPages} с XPath`);
                
                const pageUrl = this.buildPageUrl(url, currentPage, paginationType, paginationConfig);
                const html = await this.fetchPage(pageUrl);
                result.addBytesProcessed(Buffer.byteLength(html, 'utf8'));
                
                // Загружаем HTML в XPath helper
                if (!this.xpathHelper.loadHTML(html)) {
                    throw new Error('Не удалось загрузить HTML для XPath обработки');
                }
                
                const pageItems = await this.parsePageItemsWithXPath(
                    this.xpathHelper, 
                    itemSelector, 
                    xpathSelectors, 
                    parseConfig, 
                    result
                );
                
                Logger.info(`Найдено ${pageItems.length} элементов на странице ${currentPage} (XPath)`);
                result.addItems(pageItems);
                result.incrementPageCount();
                result.incrementSuccessfulRequests();
                
                // Проверяем наличие следующей страницы с XPath
                hasNextPage = this.checkNextPageWithXPath(paginationType, paginationConfig);
                currentPage++;
                
                // Добавляем задержку между запросами
                if (hasNextPage && delay > 0) {
                    Logger.debug(`Задержка ${delay}мс перед следующим запросом`);
                    await RetryUtils.sleep(delay);
                }
                
            } catch (error) {
                Logger.error(`Ошибка при обработке страницы ${currentPage} (XPath)`, {
                    error: error.message,
                    url: this.buildPageUrl(url, currentPage, paginationType, paginationConfig)
                });
                
                result.addError(error);
                result.incrementFailedRequests();
                
                // Прерываем цикл при критических ошибках
                if (!RetryUtils.isRetryableError(error)) {
                    break;
                }
            }
        }
        
        // Очищаем XPath helper
        this.xpathHelper.cleanup();
        
        Logger.info(`XPath парсинг завершен`, {
            totalItems: result.metadata.totalItems,
            pagesProcessed: result.metadata.pagesProcessed,
            strategy: this.name
        });
        
        return result;
    }
    
    async fetchPage(url) {
        return await RetryUtils.withRetry(
            async () => {
                Logger.debug(`Загружаем страницу для XPath: ${url}`);
                const response = await axios.get(url, this.axiosConfig);
                return response.data;
            },
            {
                maxAttempts: config.parsing.retryAttempts,
                baseDelay: config.parsing.retryDelay,
                shouldRetry: RetryUtils.isRetryableError
            }
        );
    }
    
    async parsePageItemsWithXPath(xpathHelper, itemSelector, xpathSelectors, parseConfig, result) {
        const items = [];
        
        try {
            // Конвертируем CSS селектор в XPath если нужно
            let xpathItemSelector = itemSelector;
            if (!itemSelector.startsWith('//') && !itemSelector.startsWith('/')) {
                xpathItemSelector = xpathHelper.convertCSSToXPath(itemSelector);
                Logger.debug(`CSS селектор конвертирован в XPath`, { 
                    css: itemSelector, 
                    xpath: xpathItemSelector 
                });
            }
            
            // Получаем основные элементы
            const elements = xpathHelper.evaluate(xpathItemSelector);
            
            if (!Array.isArray(elements)) {
                Logger.warn('XPath запрос вернул не массив элементов');
                return items;
            }
            
            Logger.debug(`Найдено ${elements.length} элементов по XPath селектору`);
            
            for (let i = 0; i < elements.length; i++) {
                try {
                    const element = elements[i];
                    const data = await this.extractDataWithXPath(
                        element, 
                        xpathHelper, 
                        xpathSelectors, 
                        parseConfig, 
                        result
                    );
                    
                    if (Object.keys(data).length > 0) {
                        items.push(data);
                    }
                    
                } catch (error) {
                    Logger.warn(`Ошибка при извлечении данных из элемента ${i} (XPath)`, {
                        error: error.message,
                        selector: xpathItemSelector
                    });
                    result.addWarning(`Ошибка при извлечении данных из элемента ${i}: ${error.message}`);
                }
            }
            
        } catch (error) {
            Logger.error('Ошибка при парсинге элементов с XPath', {
                error: error.message,
                selector: itemSelector
            });
            result.addError(error);
        }
        
        return items;
    }
    
    async extractDataWithXPath(element, xpathHelper, xpathSelectors, parseConfig, result) {
        Logger.debug('Начало извлечения данных с XPath', { 
            xpathSelectorsCount: xpathSelectors.length,
            strategy: this.name 
        });
        
        const data = {};
        
        try {
            // Базовые данные элемента
            if (element.tagName) {
                data.tagName = element.tagName.toLowerCase();
            }
            
            if (element.textContent) {
                data.text = element.textContent.trim();
            }
            
            if (element.innerHTML) {
                data.html = element.innerHTML;
            }
            
            // Получаем атрибуты
            if (element.attributes) {
                const attributes = {};
                for (let i = 0; i < element.attributes.length; i++) {
                    const attr = element.attributes[i];
                    attributes[attr.name] = attr.value;
                }
                if (Object.keys(attributes).length > 0) {
                    data.attributes = attributes;
                }
            }
            
            // Обрабатываем дополнительные XPath селекторы
            for (const xpathConfig of xpathSelectors) {
                await this.processXPathSelector(element, xpathHelper, xpathConfig, data);
            }
            
            // Обрабатываем обычные тег селекторы если есть
            if (parseConfig.tagSelectors && parseConfig.tagSelectors.length > 0) {
                this.processTagSelectorsForXPath(element, parseConfig.tagSelectors, data);
            }
            
            Logger.debug('Данные извлечены с XPath', { 
                dataKeys: Object.keys(data),
                strategy: this.name 
            });
            
        } catch (error) {
            Logger.error('Ошибка при извлечении данных с XPath', {
                error: error.message,
                strategy: this.name
            });
            result.addError(error);
        }
        
        return data;
    }
    
    async processXPathSelector(contextElement, xpathHelper, xpathConfig, data) {
        try {
            const { 
                xpath, 
                name, 
                type = 'text', 
                attribute = null,
                multiple = false,
                fallback = null 
            } = xpathConfig;
            
            if (!xpath || !name) {
                Logger.warn('XPath конфигурация incomplete', { xpathConfig });
                return;
            }
            
            // Создаем контекстный XPath относительно текущего элемента
            const contextualXPath = `.${xpath}`;
            
            Logger.debug('Обрабатываем XPath селектор', { 
                xpath: contextualXPath, 
                name, 
                type 
            });
            
            // Выполняем XPath запрос в контексте элемента
            let results = xpathHelper.evaluate(contextualXPath);
            
            // Если результат не массив, преобразуем
            if (!Array.isArray(results)) {
                results = results ? [results] : [];
            }
            
            if (results.length === 0 && fallback) {
                // Пробуем fallback селектор
                const fallbackResults = xpathHelper.evaluate(`.${fallback}`);
                results = Array.isArray(fallbackResults) ? fallbackResults : [fallbackResults];
            }
            
            if (results.length > 0) {
                const extractedValues = results.map(result => {
                    if (type === 'attribute' && attribute) {
                        return result.getAttribute ? result.getAttribute(attribute) : null;
                    } else if (type === 'html') {
                        return result.innerHTML || result.outerHTML || '';
                    } else {
                        return result.textContent || result.nodeValue || result.toString();
                    }
                }).filter(value => value !== null && value !== '');
                
                if (extractedValues.length > 0) {
                    data[name] = multiple ? extractedValues : extractedValues[0];
                }
            }
            
        } catch (error) {
            Logger.warn('Ошибка при обработке XPath селектора', {
                error: error.message,
                xpath: xpathConfig.xpath,
                name: xpathConfig.name
            });
        }
    }
    
    processTagSelectorsForXPath(element, tagSelectors, data) {
        // Эмулируем обработку тег селекторов для совместимости
        // В реальном XPath окружении это можно делать через XPath запросы
        try {
            tagSelectors.forEach(tagConfig => {
                const { tag, selector, attribute } = tagConfig;
                
                if (!tag) return;
                
                // Преобразуем в XPath и ищем в контексте элемента
                let xpath = `.//${tag}`;
                if (selector) {
                    const selectorXPath = this.xpathHelper.convertCSSToXPath(selector);
                    xpath = `${selectorXPath}//${tag}`;
                }
                
                try {
                    const results = this.xpathHelper.evaluate(xpath);
                    const values = [];
                    
                    if (Array.isArray(results)) {
                        results.forEach(result => {
                            if (attribute && result.getAttribute) {
                                const value = result.getAttribute(attribute);
                                if (value) values.push(value);
                            } else if (result.textContent) {
                                values.push(result.textContent.trim());
                            }
                        });
                    }
                    
                    if (values.length > 0) {
                        data[tag] = values;
                    }
                } catch (error) {
                    Logger.debug('Ошибка при обработке тег селектора в XPath', {
                        error: error.message,
                        tag,
                        selector
                    });
                }
            });
        } catch (error) {
            Logger.warn('Ошибка при обработке тег селекторов в XPath', {
                error: error.message
            });
        }
    }
    
    checkNextPageWithXPath(paginationType, paginationConfig) {
        if (!paginationConfig.nextPageSelector && !paginationConfig.nextPageXPath) {
            return false;
        }
        
        try {
            let xpath = paginationConfig.nextPageXPath;
            
            // Если нет XPath, конвертируем CSS селектор
            if (!xpath && paginationConfig.nextPageSelector) {
                xpath = this.xpathHelper.convertCSSToXPath(paginationConfig.nextPageSelector);
            }
            
            if (!xpath) {
                return false;
            }
            
            const elements = this.xpathHelper.evaluate(xpath);
            const hasElements = Array.isArray(elements) ? elements.length > 0 : !!elements;
            
            Logger.debug('Проверка следующей страницы с XPath', {
                xpath,
                hasElements,
                paginationType
            });
            
            return hasElements;
            
        } catch (error) {
            Logger.warn('Ошибка при проверке следующей страницы с XPath', {
                error: error.message,
                paginationType
            });
            return false;
        }
    }
}

module.exports = XPathParsingStrategy; 