const puppeteer = require('puppeteer-core');
const cheerio = require('cheerio');
const ParsingStrategy = require('./ParsingStrategy');
const Logger = require('../utils/logger');
const RetryUtils = require('../utils/retry');
const config = require('../config/app.config');

class PuppeteerParsingStrategy extends ParsingStrategy {
    constructor() {
        super('Puppeteer');
        this.browser = null;
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
        
        Logger.info(`Начинаем парсинг с Puppeteer`, { 
            url, 
            maxPages, 
            paginationType,
            strategy: this.name 
        });
        
        try {
            await this.initBrowser();
            
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
            
        } finally {
            await this.closeBrowser();
        }
        
        Logger.info(`Парсинг завершен`, {
            totalItems: result.metadata.totalItems,
            pagesProcessed: result.metadata.pagesProcessed,
            strategy: this.name
        });
        
        return result;
    }
    
    async initBrowser() {
        if (this.browser) {
            return;
        }
        
        Logger.debug('Инициализация браузера Puppeteer');
        
        const executablePath = config.puppeteer.executablePath[process.platform];
        
        this.browser = await puppeteer.launch({
            headless: config.puppeteer.headless,
            executablePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        
        Logger.debug('Браузер Puppeteer успешно запущен');
    }
    
    async closeBrowser() {
        if (this.browser) {
            Logger.debug('Закрытие браузера Puppeteer');
            await this.browser.close();
            this.browser = null;
        }
    }
    
    async fetchPage(url) {
        return await RetryUtils.withRetry(
            async () => {
                Logger.debug(`Загружаем страницу через Puppeteer: ${url}`);
                
                const page = await this.browser.newPage();
                
                try {
                    // Настраиваем страницу
                    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
                    await page.setViewport({ width: 1920, height: 1080 });
                    
                    // Переходим на страницу
                    await page.goto(url, { 
                        waitUntil: 'networkidle2',
                        timeout: config.puppeteer.timeout 
                    });
                    
                    // Ждем загрузку динамического контента
                    await page.waitForTimeout(2000);
                    
                    // Скроллим страницу для загрузки lazy-loading контента
                    await this.autoScroll(page);
                    
                    // Получаем HTML
                    const content = await page.content();
                    return content;
                    
                } finally {
                    await page.close();
                }
            },
            {
                maxAttempts: config.parsing.retryAttempts,
                baseDelay: config.parsing.retryDelay,
                shouldRetry: RetryUtils.isRetryableError
            }
        );
    }
    
    async autoScroll(page) {
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if(totalHeight >= scrollHeight){
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
    }
    
    async parsePageItems($, itemSelector, parseConfig, result) {
        const items = [];
        
        $(itemSelector).each(async (index, element) => {
            try {
                const $element = $(element);
                const data = await this.extractData($element, $, parseConfig, result);
                
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
}

module.exports = PuppeteerParsingStrategy; 