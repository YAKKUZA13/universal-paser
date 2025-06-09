const PuppeteerParsingStrategy = require('./PuppeteerParsingStrategy');
const PageStructureAnalyzer = require('../intelligence/PageStructureAnalyzer');
const Logger = require('../utils/logger');
const RetryUtils = require('../utils/retry');
const config = require('../config/app.config');

class SmartPuppeteerStrategy extends PuppeteerParsingStrategy {
    constructor() {
        super();
        this.name = 'SmartPuppeteer';
        this.structureAnalyzer = new PageStructureAnalyzer();
        this.waitStrategies = {
            networkIdle: 'networkidle2',
            domContentLoaded: 'domcontentloaded',
            load: 'load',
            custom: null
        };
    }
    
    async parse(url, parseConfig, result) {
        this.validateConfig(parseConfig);
        
        const {
            paginationType = 'none',
            paginationConfig = {},
            itemSelector,
            maxPages = config.parsing.defaultMaxPages,
            delay = config.parsing.defaultDelay,
            enableSmartAnalysis = true,
            spa = false,
            waitStrategy = 'networkidle2',
            customWaitSelector = null,
            infiniteScrolling = false
        } = parseConfig;
        
        Logger.info(`Начинаем умный Puppeteer парсинг`, { 
            url, 
            maxPages, 
            paginationType,
            spa,
            infiniteScrolling,
            strategy: this.name 
        });
        
        try {
            await this.initBrowser();
            
            let currentPage = 1;
            let hasNextPage = true;
            let pageAnalysis = null;
            
            while (hasNextPage && currentPage <= maxPages) {
                try {
                    Logger.info(`Обрабатываем страницу ${currentPage}/${maxPages} (Smart Puppeteer)`);
                    
                    const pageUrl = this.buildPageUrl(url, currentPage, paginationType, paginationConfig);
                    const { html, pageInstance } = await this.fetchPageSmart(pageUrl, {
                        waitStrategy,
                        customWaitSelector,
                        spa,
                        infiniteScrolling
                    });
                    
                    result.addBytesProcessed(Buffer.byteLength(html, 'utf8'));
                    
                    // Анализируем структуру страницы только для первой страницы
                    if (currentPage === 1 && enableSmartAnalysis) {
                        pageAnalysis = await this.structureAnalyzer.analyzePageStructure(html, pageUrl);
                        Logger.info('Анализ структуры страницы завершен', {
                            pageType: pageAnalysis.pageType,
                            confidence: pageAnalysis.confidence,
                            recommendations: pageAnalysis.recommendations.length
                        });
                        
                        // Обновляем конфигурацию парсинга на основе анализа
                        parseConfig = this.adaptConfigFromAnalysis(parseConfig, pageAnalysis);
                    }
                    
                    const pageItems = await this.parsePageItemsSmart(
                        pageInstance,
                        html,
                        parseConfig,
                        pageAnalysis,
                        result
                    );
                    
                    Logger.info(`Найдено ${pageItems.length} элементов на странице ${currentPage} (Smart)`);
                    result.addItems(pageItems);
                    result.incrementPageCount();
                    result.incrementSuccessfulRequests();
                    
                    // Умная проверка следующей страницы
                    if (infiniteScrolling) {
                        hasNextPage = await this.handleInfiniteScrolling(pageInstance, paginationConfig);
                    } else {
                        hasNextPage = await this.checkNextPageSmart(pageInstance, paginationType, paginationConfig);
                    }
                    
                    currentPage++;
                    
                    // Добавляем задержку между запросами
                    if (hasNextPage && delay > 0) {
                        Logger.debug(`Задержка ${delay}мс перед следующим запросом`);
                        await RetryUtils.sleep(delay);
                    }
                    
                } catch (error) {
                    Logger.error(`Ошибка при обработке страницы ${currentPage} (Smart Puppeteer)`, {
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
            
        } finally {
            await this.closeBrowser();
        }
        
        Logger.info(`Smart Puppeteer парсинг завершен`, {
            totalItems: result.metadata.totalItems,
            pagesProcessed: result.metadata.pagesProcessed,
            strategy: this.name
        });
        
        return result;
    }
    
    async fetchPageSmart(url, options = {}) {
        const {
            waitStrategy = 'networkidle2',
            customWaitSelector = null,
            spa = false,
            infiniteScrolling = false
        } = options;
        
        return await RetryUtils.withRetry(
            async () => {
                Logger.debug(`Загружаем страницу через Smart Puppeteer: ${url}`);
                
                const page = await this.browser.newPage();
                
                try {
                    // Настраиваем страницу
                    await this.setupPage(page, { spa, infiniteScrolling });
                    
                    // Переходим на страницу с умным ожиданием
                    await page.goto(url, { 
                        waitUntil: waitStrategy,
                        timeout: config.puppeteer.timeout 
                    });
                    
                    // Дополнительное ожидание для SPA
                    if (spa) {
                        await this.waitForSPAContent(page, customWaitSelector);
                    }
                    
                    // Ожидание кастомного селектора
                    if (customWaitSelector) {
                        await page.waitForSelector(customWaitSelector, { 
                            timeout: 10000 
                        }).catch(() => {
                            Logger.warn(`Кастомный селектор не найден: ${customWaitSelector}`);
                        });
                    }
                    
                    // Обработка бесконечной прокрутки
                    if (infiniteScrolling) {
                        await this.handleInitialInfiniteScroll(page);
                    } else {
                        // Обычная прокрутка
                        await this.autoScroll(page);
                    }
                    
                    // Получаем HTML
                    const html = await page.content();
                    
                    return { html, pageInstance: page };
                    
                } catch (error) {
                    await page.close();
                    throw error;
                }
            },
            {
                maxAttempts: config.parsing.retryAttempts,
                baseDelay: config.parsing.retryDelay,
                shouldRetry: RetryUtils.isRetryableError
            }
        );
    }
    
    async setupPage(page, options = {}) {
        const { spa = false, infiniteScrolling = false } = options;
        
        // Базовые настройки
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Отключаем загрузку ненужных ресурсов для ускорения
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['stylesheet', 'font', 'image'].includes(resourceType)) {
                req.abort();
            } else {
                req.continue();
            }
        });
        
        // Обработка JavaScript ошибок
        page.on('pageerror', error => {
            Logger.debug('JavaScript ошибка на странице', { error: error.message });
        });
        
        // Для SPA - дополнительные настройки
        if (spa) {
            await page.evaluateOnNewDocument(() => {
                // Отслеживание AJAX запросов
                window.__ajaxRequests = 0;
                const originalXMLHttpRequest = window.XMLHttpRequest;
                window.XMLHttpRequest = function() {
                    const xhr = new originalXMLHttpRequest();
                    window.__ajaxRequests++;
                    xhr.addEventListener('loadend', () => {
                        window.__ajaxRequests--;
                    });
                    return xhr;
                };
                
                // Отслеживание fetch запросов
                window.__fetchRequests = 0;
                const originalFetch = window.fetch;
                window.fetch = function(...args) {
                    window.__fetchRequests++;
                    return originalFetch.apply(this, args).finally(() => {
                        window.__fetchRequests--;
                    });
                };
            });
        }
        
        // Для infinite scrolling
        if (infiniteScrolling) {
            await page.evaluateOnNewDocument(() => {
                window.__lastScrollHeight = 0;
                window.__scrollTimeout = null;
            });
        }
    }
    
    async waitForSPAContent(page, customSelector = null) {
        Logger.debug('Ожидание загрузки SPA контента');
        
        try {
            // Ждем завершения AJAX запросов
            await page.waitForFunction(
                () => window.__ajaxRequests === 0 && window.__fetchRequests === 0,
                { timeout: 15000 }
            );
            
            // Дополнительная пауза для рендеринга
            await page.waitForTimeout(2000);
            
            // Ждем появления основного контента
            if (customSelector) {
                await page.waitForSelector(customSelector, { timeout: 10000 });
            } else {
                // Ждем появления распространенных элементов контента
                await page.waitForFunction(
                    () => {
                        const selectors = ['main', '[role="main"]', '.content', '.container', 'article'];
                        return selectors.some(sel => document.querySelector(sel));
                    },
                    { timeout: 10000 }
                ).catch(() => {
                    Logger.debug('Основные селекторы контента не найдены');
                });
            }
            
        } catch (error) {
            Logger.warn('Таймаут при ожидании SPA контента', { error: error.message });
        }
    }
    
    async handleInitialInfiniteScroll(page) {
        Logger.debug('Выполняем начальную бесконечную прокрутку');
        
        let lastHeight = 0;
        let unchangedCount = 0;
        const maxScrolls = 10; // Максимум прокруток для начальной загрузки
        
        for (let i = 0; i < maxScrolls; i++) {
            // Прокручиваем вниз
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            
            // Ждем загрузки нового контента
            await page.waitForTimeout(2000);
            
            // Проверяем изменение высоты
            const newHeight = await page.evaluate(() => document.body.scrollHeight);
            
            if (newHeight === lastHeight) {
                unchangedCount++;
                if (unchangedCount >= 3) {
                    Logger.debug('Высота страницы не изменилась 3 раза подряд, останавливаем прокрутку');
                    break;
                }
            } else {
                unchangedCount = 0;
            }
            
            lastHeight = newHeight;
        }
    }
    
    async handleInfiniteScrolling(page, paginationConfig) {
        Logger.debug('Обрабатываем бесконечную прокрутку для следующей страницы');
        
        try {
            const initialHeight = await page.evaluate(() => document.body.scrollHeight);
            
            // Прокручиваем для загрузки нового контента
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });
            
            // Ждем изменения высоты страницы
            const heightChanged = await page.waitForFunction(
                (initialHeight) => document.body.scrollHeight > initialHeight,
                { timeout: 10000 },
                initialHeight
            ).then(() => true).catch(() => false);
            
            if (heightChanged) {
                // Ждем загрузки нового контента
                await page.waitForTimeout(3000);
                
                // Проверяем наличие кнопки "Загрузить еще" или других индикаторов
                if (paginationConfig.loadMoreSelector) {
                    const loadMoreButton = await page.$(paginationConfig.loadMoreSelector);
                    if (loadMoreButton) {
                        await loadMoreButton.click();
                        await page.waitForTimeout(2000);
                    }
                }
                
                return true;
            }
            
            return false;
            
        } catch (error) {
            Logger.warn('Ошибка при обработке бесконечной прокрутки', {
                error: error.message
            });
            return false;
        }
    }
    
    adaptConfigFromAnalysis(originalConfig, analysis) {
        const adaptedConfig = { ...originalConfig };
        
        // Используем предложенные селекторы если оригинальный селектор неэффективен
        if (analysis.suggestedSelectors && Object.keys(analysis.suggestedSelectors).length > 0) {
            const suggestions = analysis.suggestedSelectors;
            
            // Если есть лучший селектор для основных элементов
            if (suggestions.products && suggestions.products.count > 0) {
                adaptedConfig.itemSelector = suggestions.products.selector;
                Logger.info('Адаптирован селектор на основе анализа', {
                    original: originalConfig.itemSelector,
                    adapted: adaptedConfig.itemSelector,
                    reason: 'products_detected'
                });
            } else if (suggestions.articles && suggestions.articles.count > 0) {
                adaptedConfig.itemSelector = suggestions.articles.selector;
                Logger.info('Адаптирован селектор на основе анализа', {
                    original: originalConfig.itemSelector,
                    adapted: adaptedConfig.itemSelector,
                    reason: 'articles_detected'
                });
            }
        }
        
        // Добавляем рекомендации как предупреждения
        if (analysis.recommendations && analysis.recommendations.length > 0) {
            analysis.recommendations.forEach(rec => {
                Logger.info(`Рекомендация анализатора: ${rec.message}`, { type: rec.type });
            });
        }
        
        return adaptedConfig;
    }
    
    async parsePageItemsSmart(pageInstance, html, parseConfig, pageAnalysis, result) {
        const items = [];
        
        try {
            const $ = require('cheerio').load(html);
            const selector = parseConfig.itemSelector;
            
            Logger.debug(`Парсим элементы с умным селектором: ${selector}`);
            
            // Если есть анализ структуры, используем его для оптимизации
            if (pageAnalysis && pageAnalysis.dataPatterns.length > 0) {
                const bestPattern = pageAnalysis.dataPatterns[0];
                Logger.debug('Используем лучший паттерн из анализа', {
                    pattern: bestPattern.type,
                    selector: bestPattern.selector,
                    confidence: bestPattern.confidence
                });
            }
            
            $(selector).each(async (index, element) => {
                try {
                    const $element = $(element);
                    
                    // Используем стандартную функцию извлечения данных
                    const data = await this.extractData($element, $, parseConfig, result);
                    
                    // Дополнительно извлекаем данные используя Puppeteer для интерактивных элементов
                    const enhancedData = await this.enhanceDataWithPuppeteer(
                        pageInstance, 
                        $element, 
                        index, 
                        data
                    );
                    
                    if (Object.keys(enhancedData).length > 0) {
                        items.push(enhancedData);
                    }
                    
                } catch (error) {
                    Logger.warn(`Ошибка при извлечении данных из элемента ${index} (Smart)`, {
                        error: error.message,
                        selector
                    });
                    result.addWarning(`Ошибка при извлечении данных из элемента ${index}: ${error.message}`);
                }
            });
            
        } catch (error) {
            Logger.error('Ошибка при умном парсинге элементов', {
                error: error.message,
                selector: parseConfig.itemSelector
            });
            result.addError(error);
        }
        
        return items;
    }
    
    async enhanceDataWithPuppeteer(pageInstance, $element, index, basicData) {
        try {
            // Получаем уникальный селектор для элемента
            const elementSelector = this.generateUniqueSelector($element, index);
            
            // Проверяем, есть ли элемент на странице
            const puppeteerElement = await pageInstance.$(elementSelector).catch(() => null);
            
            if (!puppeteerElement) {
                return basicData;
            }
            
            const enhancedData = { ...basicData };
            
            // Извлекаем данные, которые могут быть доступны только через JavaScript
            const jsData = await pageInstance.evaluate((selector) => {
                const element = document.querySelector(selector);
                if (!element) return {};
                
                const data = {};
                
                // Проверяем data-атрибуты
                for (const attr of element.attributes) {
                    if (attr.name.startsWith('data-')) {
                        data[attr.name] = attr.value;
                    }
                }
                
                // Проверяем вычисленные стили
                const computedStyle = window.getComputedStyle(element);
                if (computedStyle.display === 'none') {
                    data._isHidden = true;
                }
                
                // Проверяем обработчики событий (если доступны)
                if (element.onclick) {
                    data._hasClickHandler = true;
                }
                
                return data;
            }, elementSelector);
            
            // Объединяем данные
            Object.assign(enhancedData, jsData);
            
            return enhancedData;
            
        } catch (error) {
            Logger.debug('Ошибка при обогащении данных через Puppeteer', {
                error: error.message,
                index
            });
            return basicData;
        }
    }
    
    generateUniqueSelector($element, index) {
        // Пытаемся создать уникальный селектор
        const id = $element.attr('id');
        if (id) {
            return `#${id}`;
        }
        
        const classes = $element.attr('class');
        if (classes) {
            const className = classes.split(' ')[0];
            return `.${className}:nth-of-type(${index + 1})`;
        }
        
        const tagName = $element.prop('tagName').toLowerCase();
        return `${tagName}:nth-of-type(${index + 1})`;
    }
    
    async checkNextPageSmart(pageInstance, paginationType, paginationConfig) {
        try {
            if (!paginationConfig.nextPageSelector) {
                return false;
            }
            
            // Проверяем через Puppeteer для более точного результата
            const hasNext = await pageInstance.evaluate((selector, type) => {
                const elements = document.querySelectorAll(selector);
                
                if (elements.length === 0) {
                    return false;
                }
                
                // Для кнопок проверяем, не отключены ли они
                if (type === 'button') {
                    return Array.from(elements).some(el => 
                        !el.disabled && 
                        !el.classList.contains('disabled') &&
                        el.offsetParent !== null // не скрыт
                    );
                }
                
                return true;
            }, paginationConfig.nextPageSelector, paginationType);
            
            Logger.debug('Умная проверка следующей страницы', {
                selector: paginationConfig.nextPageSelector,
                paginationType,
                hasNext
            });
            
            return hasNext;
            
        } catch (error) {
            Logger.warn('Ошибка при умной проверке следующей страницы', {
                error: error.message,
                paginationType
            });
            return false;
        }
    }
}

module.exports = SmartPuppeteerStrategy; 