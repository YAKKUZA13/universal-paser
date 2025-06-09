const axios = require('axios');
const cheerio = require('cheerio');
const ParsingStrategy = require('./ParsingStrategy');
const Logger = require('../utils/logger');
const RetryUtils = require('../utils/retry');
const config = require('../config/app.config');

class CheerioParsingStrategy extends ParsingStrategy {
    constructor() {
        super('Cheerio');
        this.axiosConfig = {
            timeout: config.parsing.timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        };
    }
    
    async parse(url, parseConfig, result) {
        this.validateConfig(parseConfig);
        
        const {
            paginationType = 'none',
            paginationConfig = {},
            itemSelector,
            maxPages = config.parsing.defaultMaxPages,
            delay = config.parsing.defaultDelay
        } = parseConfig;
        
        Logger.info(`Начинаем парсинг с Cheerio`, { 
            url, 
            maxPages, 
            paginationType,
            strategy: this.name 
        });
        
        let currentPage = 1;
        let hasNextPage = true;
        
        while (hasNextPage && currentPage <= maxPages) {
            try {
                Logger.info(`Обрабатываем страницу ${currentPage}/${maxPages}`);
                
                const pageUrl = this.buildPageUrl(url, currentPage, paginationType, paginationConfig);
                const html = await this.fetchPage(pageUrl);
                result.addBytesProcessed(Buffer.byteLength(html, 'utf8'));
                
                const $ = cheerio.load(html);
                const pageItems = await this.parsePageItems($, itemSelector, parseConfig, result);
                
                Logger.info(`Найдено ${pageItems.length} элементов на странице ${currentPage}`);
                result.addItems(pageItems);
                result.incrementPageCount();
                result.incrementSuccessfulRequests();
                
                // Проверяем наличие следующей страницы
                hasNextPage = this.checkNextPage($, paginationType, paginationConfig);
                currentPage++;
                
                // Добавляем задержку между запросами
                if (hasNextPage && delay > 0) {
                    Logger.debug(`Задержка ${delay}мс перед следующим запросом`);
                    await RetryUtils.sleep(delay);
                }
                
            } catch (error) {
                Logger.error(`Ошибка при обработке страницы ${currentPage}`, {
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
        
        Logger.info(`Парсинг завершен`, {
            totalItems: result.metadata.totalItems,
            pagesProcessed: result.metadata.pagesProcessed,
            strategy: this.name
        });
        
        return result;
    }
    
    async fetchPage(url) {
        return await RetryUtils.withRetry(
            async () => {
                Logger.debug(`Загружаем страницу: ${url}`);
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
    
    async parsePageItems($, itemSelector, parseConfig, result) {
        const items = [];
        
        $(itemSelector).each((index, element) => {
            try {
                const $element = $(element);
                const data = this.extractData($element, $, parseConfig, result);
                
                if (Object.keys(data).length > 0) {
                    items.push(data);
                }
            } catch (error) {
                Logger.warn(`Ошибка при извлечении данных из элемента ${index}`, {
                    error: error.message,
                    selector: itemSelector
                });
                result.addWarning(`Ошибка при извлечении данных из элемента ${index}: ${error.message}`);
            }
        });
        
        return items;
    }

    extractData($element, $, parseConfig, result) {
        const data = {};
        
        // Извлекаем базовые данные элемента
        const text = $element.text().trim();
        const html = $element.html();
        
        if (text) {
            data.text = text;
        }
        
        // Извлекаем ссылки
        const links = [];
        $element.find('a[href]').each((i, link) => {
            const href = $(link).attr('href');
            const linkText = $(link).text().trim();
            if (href && linkText) {
                links.push({ href, text: linkText });
            }
        });
        
        if (links.length > 0) {
            data.links = links;
        }
        
        // Извлекаем изображения
        const images = [];
        $element.find('img[src]').each((i, img) => {
            const src = $(img).attr('src');
            const alt = $(img).attr('alt') || '';
            if (src) {
                images.push({ src, alt });
            }
        });
        
        if (images.length > 0) {
            data.images = images;
        }
        
        // Если есть селекторы тегов, обрабатываем их
        if (parseConfig.tagSelectors && parseConfig.tagSelectors.length > 0) {
            parseConfig.tagSelectors.forEach(selector => {
                const fieldName = selector.name || selector.tag || selector.selector;
                const elements = $element.find(selector.selector || selector.tag);
                
                if (elements.length > 0) {
                    if (elements.length === 1) {
                        data[fieldName] = elements.text().trim();
                    } else {
                        data[fieldName] = [];
                        elements.each((i, el) => {
                            data[fieldName].push($(el).text().trim());
                        });
                    }
                }
            });
        }
        
        return data;
    }
}

module.exports = CheerioParsingStrategy; 