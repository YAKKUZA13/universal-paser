const Logger = require('../utils/logger');

class ParsingStrategy {
    constructor(name) {
        if (new.target === ParsingStrategy) {
            throw new Error('ParsingStrategy is an abstract class');
        }
        this.name = name;
    }
    
    async parse(url, config, result) {
        throw new Error('parse method must be implemented');
    }
    
    validateConfig(config) {
        if (!config.itemSelector) {
            throw new Error('itemSelector is required');
        }
    }
    
    async extractData($element, $, config, result) {
        Logger.debug('Начало извлечения данных', { 
            selector: config.itemSelector,
            strategy: this.name 
        });
        
        const data = this.extractElementData($element, $);
        
        // Обработка дополнительных селекторов тегов
        if (config.tagSelectors && config.tagSelectors.length > 0) {
            this.processTagSelectors($element, $, config.tagSelectors, data);
        }
        
        Logger.debug('Данные извлечены', { 
            dataKeys: Object.keys(data),
            strategy: this.name 
        });
        
        return data;
    }
    
    extractElementData($element, $) {
        const result = {};
        
        // Извлекаем атрибуты
        const attributes = $element.attr();
        if (attributes && Object.keys(attributes).length > 0) {
            result.attributes = attributes;
        }
        
        // Извлекаем текст (без дочерних элементов)
        const text = $element.clone().children().remove().end().text().trim();
        if (text) {
            result.text = text;
        }
        
        // Извлекаем HTML содержимое
        const html = $element.html();
        if (html) {
            result.html = html;
        }
        
        // Рекурсивно обрабатываем дочерние элементы
        const children = $element.children();
        if (children.length > 0) {
            result.children = {};
            
            children.each((index, child) => {
                const $child = $(child);
                const tagName = $child.prop('tagName')?.toLowerCase() || 'unknown';
                const className = $child.attr('class');
                const id = $child.attr('id');
                
                let childKey = tagName;
                if (className) {
                    childKey += `.${className.replace(/\s+/g, '.')}`;
                }
                if (id) {
                    childKey += `#${id}`;
                }
                
                // Избегаем дублирования ключей
                if (result.children[childKey]) {
                    childKey = `${childKey}_${index}`;
                }
                
                result.children[childKey] = this.extractElementData($child, $);
            });
        }
        
        return result;
    }
    
    processTagSelectors($element, $, tagSelectors, data) {
        tagSelectors.forEach(tagConfig => {
            const { tag, selector, attribute } = tagConfig;
            
            if (!tag) return;
            
            const elements = selector 
                ? $element.find(selector).find(tag) 
                : $element.find(tag);
            
            if (elements.length > 0) {
                const tagData = elements.map((_, el) => {
                    const $el = $(el);
                    return attribute 
                        ? $el.attr(attribute) 
                        : $el.text().trim();
                }).get().filter(item => item); // Удаляем пустые значения
                
                if (tagData.length > 0) {
                    data[tag] = tagData;
                }
            }
        });
    }
    
    buildPageUrl(baseUrl, page, paginationType, paginationConfig) {
        switch (paginationType) {
            case 'query':
                const queryParam = paginationConfig.queryParam || 'page';
                const separator = baseUrl.includes('?') ? '&' : '?';
                return `${baseUrl}${separator}${queryParam}=${page}`;
            
            case 'path':
                const pathPrefix = paginationConfig.pathPrefix || 'page/';
                const cleanUrl = baseUrl.replace(/\/$/, '');
                return `${cleanUrl}/${pathPrefix}${page}`;
            
            default:
                return baseUrl;
        }
    }
    
    checkNextPage($, paginationType, paginationConfig) {
        if (!paginationConfig.nextPageSelector) {
            return false;
        }
        
        switch (paginationType) {
            case 'query':
            case 'path':
                return $(paginationConfig.nextPageSelector).length > 0;
            
            case 'button':
                const button = $(paginationConfig.nextButtonSelector || paginationConfig.nextPageSelector);
                return button.length > 0 && !button.hasClass('disabled');
            
            case 'infinite':
                return $(paginationConfig.loadMoreSelector || paginationConfig.nextPageSelector).length > 0;
            
            default:
                return false;
        }
    }
}

module.exports = ParsingStrategy; 