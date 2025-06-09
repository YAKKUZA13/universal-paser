const cheerio = require('cheerio');
const natural = require('natural');
const kmeans = require('ml-kmeans');
const Logger = require('../utils/logger');

class PageStructureAnalyzer {
    constructor() {
        this.contentPatterns = {
            // Паттерны для распознавания типов контента
            title: ['h1', 'h2', 'h3', '.title', '.heading', '[class*="title"]', '[class*="heading"]'],
            content: ['p', '.content', '.text', '.description', '[class*="content"]', '[class*="text"]'],
            list: ['ul', 'ol', '.list', '.items', '[class*="list"]', '[class*="item"]'],
            navigation: ['nav', '.nav', '.menu', '.navbar', '[class*="nav"]', '[class*="menu"]'],
            article: ['article', '.article', '.post', '.entry', '[class*="article"]', '[class*="post"]'],
            product: ['.product', '.item', '.card', '[class*="product"]', '[class*="item"]', '[class*="card"]'],
            image: ['img', '.image', '.photo', '[class*="image"]', '[class*="photo"]'],
            link: ['a', '.link', '[class*="link"]'],
            button: ['button', '.btn', '.button', '[class*="btn"]', '[class*="button"]'],
            form: ['form', '.form', '[class*="form"]'],
            table: ['table', '.table', '[class*="table"]'],
            footer: ['footer', '.footer', '[class*="footer"]'],
            header: ['header', '.header', '[class*="header"]'],
            sidebar: ['.sidebar', '.aside', 'aside', '[class*="sidebar"]', '[class*="aside"]']
        };
        
        this.semanticKeywords = {
            ecommerce: ['price', 'buy', 'cart', 'shop', 'product', 'order', 'payment'],
            news: ['article', 'news', 'story', 'report', 'headline', 'author', 'date'],
            blog: ['post', 'blog', 'comment', 'tag', 'category', 'archive'],
            social: ['like', 'share', 'follow', 'friend', 'profile', 'feed'],
            forum: ['thread', 'post', 'reply', 'user', 'topic', 'discussion']
        };
    }
    
    async analyzePageStructure(html, url = '') {
        Logger.info('Начинаем анализ структуры страницы', { url });
        
        const $ = cheerio.load(html);
        const analysis = {
            pageType: null,
            contentStructure: {},
            suggestedSelectors: {},
            dataPatterns: [],
            recommendations: [],
            confidence: 0
        };
        
        try {
            // 1. Определяем тип страницы
            analysis.pageType = this.detectPageType($, html);
            
            // 2. Анализируем структуру контента
            analysis.contentStructure = this.analyzeContentStructure($);
            
            // 3. Предлагаем оптимальные селекторы
            analysis.suggestedSelectors = this.suggestSelectors($, analysis.pageType);
            
            // 4. Ищем повторяющиеся паттерны данных
            analysis.dataPatterns = this.findDataPatterns($);
            
            // 5. Генерируем рекомендации
            analysis.recommendations = this.generateRecommendations(analysis);
            
            // 6. Рассчитываем уверенность в анализе
            analysis.confidence = this.calculateConfidence(analysis);
            
            Logger.info('Анализ структуры завершен', {
                pageType: analysis.pageType,
                confidence: analysis.confidence,
                patternsFound: analysis.dataPatterns.length
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
    
    detectPageType($, html) {
        const features = {};
        
        // Анализируем мета-теги
        const title = $('title').text().toLowerCase();
        const description = $('meta[name="description"]').attr('content') || '';
        const keywords = $('meta[name="keywords"]').attr('content') || '';
        
        // Анализируем структурные элементы
        Object.keys(this.semanticKeywords).forEach(type => {
            features[type] = 0;
            this.semanticKeywords[type].forEach(keyword => {
                if (title.includes(keyword)) features[type] += 3;
                if (description.toLowerCase().includes(keyword)) features[type] += 2;
                if (keywords.toLowerCase().includes(keyword)) features[type] += 1;
                
                // Анализируем классы и ID элементов
                $(`[class*="${keyword}"], [id*="${keyword}"]`).each(() => {
                    features[type] += 1;
                });
            });
        });
        
        // Анализируем специфические элементы
        if ($('.price, [class*="price"], [class*="cost"]').length > 0) features.ecommerce += 5;
        if ($('article, .article, [class*="article"]').length > 0) features.news += 5;
        if ($('.post, [class*="post"], .blog').length > 0) features.blog += 5;
        
        // Определяем тип с наибольшим весом
        const maxType = Object.keys(features).reduce((a, b) => 
            features[a] > features[b] ? a : b
        );
        
        return features[maxType] > 5 ? maxType : 'general';
    }
    
    analyzeContentStructure($) {
        const structure = {
            hasHeader: $('header, .header').length > 0,
            hasNavigation: $('nav, .nav, .menu').length > 0,
            hasFooter: $('footer, .footer').length > 0,
            hasSidebar: $('aside, .sidebar, .aside').length > 0,
            mainContentArea: this.findMainContentArea($),
            repeatingElements: this.findRepeatingElements($),
            forms: this.analyzeForms($),
            tables: this.analyzeTables($),
            media: this.analyzeMedia($)
        };
        
        return structure;
    }
    
    findMainContentArea($) {
        const candidates = [
            'main',
            '[role="main"]',
            '.main',
            '.content',
            '.container',
            '#content',
            '#main',
            'article',
            '.article'
        ];
        
        for (const selector of candidates) {
            const element = $(selector).first();
            if (element.length > 0) {
                return {
                    selector: selector,
                    tagName: element.prop('tagName'),
                    classes: element.attr('class'),
                    id: element.attr('id'),
                    childrenCount: element.children().length
                };
            }
        }
        
        // Если не найден явный main content, ищем наибольший контейнер
        let maxContent = { element: null, contentLength: 0 };
        
        $('div').each((i, el) => {
            const $el = $(el);
            const contentLength = $el.text().length;
            if (contentLength > maxContent.contentLength) {
                maxContent = { element: $el, contentLength };
            }
        });
        
        if (maxContent.element) {
            return {
                selector: this.generateSelector(maxContent.element),
                tagName: maxContent.element.prop('tagName'),
                classes: maxContent.element.attr('class'),
                id: maxContent.element.attr('id'),
                childrenCount: maxContent.element.children().length,
                isInferred: true
            };
        }
        
        return null;
    }
    
    findRepeatingElements($) {
        const elementGroups = {};
        
        // Ищем элементы с похожими селекторами
        $('*').each((i, el) => {
            const $el = $(el);
            const tagName = $el.prop('tagName');
            const className = $el.attr('class');
            
            if (className) {
                const mainClass = className.split(' ')[0];
                const key = `${tagName}.${mainClass}`;
                
                if (!elementGroups[key]) {
                    elementGroups[key] = [];
                }
                elementGroups[key].push({
                    element: $el,
                    text: $el.text().trim().substring(0, 100),
                    children: $el.children().length
                });
            }
        });
        
        // Фильтруем группы с минимум 3 элементами
        const repeatingGroups = {};
        Object.keys(elementGroups).forEach(key => {
            if (elementGroups[key].length >= 3) {
                repeatingGroups[key] = {
                    count: elementGroups[key].length,
                    selector: key,
                    avgChildren: elementGroups[key].reduce((sum, el) => sum + el.children, 0) / elementGroups[key].length,
                    samples: elementGroups[key].slice(0, 3).map(el => el.text)
                };
            }
        });
        
        return repeatingGroups;
    }
    
    suggestSelectors($, pageType) {
        const suggestions = {};
        
        // Базовые селекторы в зависимости от типа страницы
        switch (pageType) {
            case 'ecommerce':
                suggestions.products = this.findBestSelector($, [
                    '.product', '.item', '.product-item', '[class*="product"]'
                ]);
                suggestions.prices = this.findBestSelector($, [
                    '.price', '.cost', '[class*="price"]', '[class*="cost"]'
                ]);
                suggestions.titles = this.findBestSelector($, [
                    '.product-title', '.title', 'h1', 'h2', '[class*="title"]'
                ]);
                break;
                
            case 'news':
                suggestions.articles = this.findBestSelector($, [
                    'article', '.article', '.news-item', '[class*="article"]'
                ]);
                suggestions.headlines = this.findBestSelector($, [
                    'h1', 'h2', '.headline', '.title', '[class*="headline"]'
                ]);
                suggestions.content = this.findBestSelector($, [
                    '.content', '.text', 'p', '[class*="content"]'
                ]);
                break;
                
            case 'blog':
                suggestions.posts = this.findBestSelector($, [
                    '.post', 'article', '.entry', '[class*="post"]'
                ]);
                suggestions.titles = this.findBestSelector($, [
                    '.post-title', 'h1', 'h2', '[class*="title"]'
                ]);
                break;
                
            default:
                // Общие селекторы
                suggestions.content = this.findBestSelector($, [
                    '.content', 'p', '.text', 'article'
                ]);
                suggestions.links = this.findBestSelector($, ['a']);
                suggestions.headings = this.findBestSelector($, ['h1', 'h2', 'h3']);
        }
        
        return suggestions;
    }
    
    findBestSelector($, selectors) {
        let bestSelector = null;
        let maxElements = 0;
        
        selectors.forEach(selector => {
            const elements = $(selector);
            if (elements.length > maxElements && elements.length < 1000) {
                maxElements = elements.length;
                bestSelector = {
                    selector,
                    count: elements.length,
                    samples: elements.slice(0, 3).map((i, el) => $(el).text().trim().substring(0, 50)).get()
                };
            }
        });
        
        return bestSelector;
    }
    
    findDataPatterns($) {
        const patterns = [];
        
        // Ищем таблицы с данными
        $('table').each((i, table) => {
            const $table = $(table);
            const rows = $table.find('tr');
            if (rows.length > 2) {
                patterns.push({
                    type: 'table',
                    selector: this.generateSelector($table),
                    rowCount: rows.length,
                    confidence: 0.9
                });
            }
        });
        
        // Ищем списки с данными
        $('ul, ol').each((i, list) => {
            const $list = $(list);
            const items = $list.find('li');
            if (items.length > 3) {
                patterns.push({
                    type: 'list',
                    selector: this.generateSelector($list),
                    itemCount: items.length,
                    confidence: 0.8
                });
            }
        });
        
        // Ищем карточки/элементы
        const cardSelectors = ['.card', '.item', '.product', '.post', '[class*="card"]'];
        cardSelectors.forEach(selector => {
            const elements = $(selector);
            if (elements.length > 2) {
                patterns.push({
                    type: 'cards',
                    selector: selector,
                    itemCount: elements.length,
                    confidence: 0.85
                });
            }
        });
        
        return patterns.sort((a, b) => b.confidence - a.confidence);
    }
    
    generateSelector($element) {
        const tagName = $element.prop('tagName').toLowerCase();
        const id = $element.attr('id');
        const className = $element.attr('class');
        
        if (id) {
            return `${tagName}#${id}`;
        }
        
        if (className) {
            const mainClass = className.split(' ')[0];
            return `${tagName}.${mainClass}`;
        }
        
        return tagName;
    }
    
    analyzeForms($) {
        const forms = [];
        $('form').each((i, form) => {
            const $form = $(form);
            forms.push({
                selector: this.generateSelector($form),
                method: $form.attr('method') || 'GET',
                action: $form.attr('action') || '',
                inputs: $form.find('input, select, textarea').length
            });
        });
        return forms;
    }
    
    analyzeTables($) {
        const tables = [];
        $('table').each((i, table) => {
            const $table = $(table);
            tables.push({
                selector: this.generateSelector($table),
                rows: $table.find('tr').length,
                columns: $table.find('tr').first().find('td, th').length
            });
        });
        return tables;
    }
    
    analyzeMedia($) {
        return {
            images: $('img').length,
            videos: $('video').length,
            iframes: $('iframe').length
        };
    }
    
    generateRecommendations(analysis) {
        const recommendations = [];
        
        if (analysis.confidence < 0.7) {
            recommendations.push({
                type: 'warning',
                message: 'Низкая уверенность в анализе. Рекомендуется ручная проверка селекторов.'
            });
        }
        
        if (analysis.dataPatterns.length > 0) {
            recommendations.push({
                type: 'info',
                message: `Найдено ${analysis.dataPatterns.length} паттернов данных. Рекомендуется использовать автоматически предложенные селекторы.`
            });
        }
        
        if (analysis.contentStructure.repeatingElements && Object.keys(analysis.contentStructure.repeatingElements).length > 0) {
            recommendations.push({
                type: 'success',
                message: 'Обнаружены повторяющиеся элементы. Это хорошо подходит для автоматического парсинга.'
            });
        }
        
        if (analysis.pageType === 'ecommerce') {
            recommendations.push({
                type: 'tip',
                message: 'Для e-commerce сайтов рекомендуется парсить цены, названия товаров и изображения.'
            });
        }
        
        return recommendations;
    }
    
    calculateConfidence(analysis) {
        let confidence = 0.5; // Базовая уверенность
        
        // Увеличиваем уверенность если найден тип страницы
        if (analysis.pageType && analysis.pageType !== 'general') {
            confidence += 0.2;
        }
        
        // Увеличиваем если найдена основная область контента
        if (analysis.contentStructure.mainContentArea) {
            confidence += 0.1;
        }
        
        // Увеличиваем если найдены повторяющиеся элементы
        if (Object.keys(analysis.contentStructure.repeatingElements || {}).length > 0) {
            confidence += 0.15;
        }
        
        // Увеличиваем если найдены паттерны данных
        confidence += Math.min(analysis.dataPatterns.length * 0.05, 0.15);
        
        return Math.min(confidence, 1.0);
    }
}

module.exports = PageStructureAnalyzer; 