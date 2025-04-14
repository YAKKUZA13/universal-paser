const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer-core');

class UniversalParser {
    constructor(options = {}) {
        this.options = {
            usePuppeteer: options.usePuppeteer || false,
            delay: options.delay || 1000,
            maxPages: options.maxPages || 1,
            ...options
        };
    }

    async parse(url, config) {
        const {
            paginationType = 'query',
            paginationConfig = {},
            itemSelector,
            extractData,
            tagSelectors = []
        } = config;

        console.log(`Парсинг URL: ${url}`);
        console.log(`Селектор элементов: ${itemSelector}`);
        console.log(`Количество тегов для парсинга: ${tagSelectors.length}`);

        let items = [];
        let currentPage = 1;
        let hasNextPage = true;

        while (hasNextPage && currentPage <= this.options.maxPages) {
            console.log(`Парсинг страницы ${currentPage}...`);
            const pageUrl = this.buildPageUrl(url, currentPage, paginationType, paginationConfig);
            const html = await this.fetchPage(pageUrl);
            const $ = cheerio.load(html);

            const pageItems = $(itemSelector).map((_, element) => {
                const $element = $(element);
                const data = extractData ? extractData($element, $) : {};
                
                if (tagSelectors && tagSelectors.length > 0) {
                    tagSelectors.forEach(tagConfig => {
                        const { tag, selector, attribute } = tagConfig;
                        const elements = selector 
                            ? $element.find(selector).find(tag) 
                            : $element.find(tag);
                        
                        if (elements.length > 0) {
                            const tagData = elements.map((_, el) => {
                                const $el = $(el);
                                return attribute 
                                    ? $el.attr(attribute) 
                                    : $el.text().trim();
                            }).get();
                            
                            data[tag] = tagData;
                        }
                    });
                }
                
                return data;
            }).get();

            console.log(`Найдено элементов на странице ${currentPage}: ${pageItems.length}`);
            items = [...items, ...pageItems];

            hasNextPage = this.checkNextPage($, paginationType, paginationConfig);
            currentPage++;

            if (this.options.delay) {
                await new Promise(resolve => setTimeout(resolve, this.options.delay));
            }
        }

        console.log(`Всего найдено элементов: ${items.length}`);
        return items;
    }

    buildPageUrl(baseUrl, page, type, config) {
        switch (type) {
            case 'query':
                return `${baseUrl}?${config.queryParam}=${page}`;
            case 'path':
                return `${baseUrl}/${config.pathPrefix}${page}`;
            default:
                return baseUrl;
        }
    }

    checkNextPage($, type, config) {
        switch (type) {
            case 'query':
            case 'path':
                return $(config.nextPageSelector).length > 0;
            case 'button':
                return $(config.nextButtonSelector).length > 0;
            case 'infinite':
                return $(config.loadMoreSelector).length > 0;
            default:
                return false;
        }
    }

    async fetchPage(url) {
        if (this.options.usePuppeteer) {
            const browser = await puppeteer.launch({
                headless: 'new',
                executablePath: process.platform === 'win32' 
                    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
                    : '/usr/bin/google-chrome'
            });
            const page = await browser.newPage();
            await page.goto(url);
            const content = await page.content();
            await browser.close();
            return content;
        } else {
            const response = await axios.get(url);
            return response.data;
        }
    }
}

module.exports = UniversalParser; 