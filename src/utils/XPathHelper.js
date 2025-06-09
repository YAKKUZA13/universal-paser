const { JSDOM } = require('jsdom');
const xpath = require('xpath');
const Logger = require('./logger');

class XPathHelper {
    constructor() {
        this.dom = null;
        this.document = null;
    }
    
    loadHTML(html) {
        try {
            this.dom = new JSDOM(html);
            this.document = this.dom.window.document;
            Logger.debug('HTML загружен для XPath обработки');
            return true;
        } catch (error) {
            Logger.error('Ошибка при загрузке HTML для XPath', { error: error.message });
            return false;
        }
    }
    
    evaluate(xpathExpression) {
        if (!this.document) {
            throw new Error('HTML не загружен. Вызовите loadHTML() сначала.');
        }
        
        try {
            Logger.debug('Выполняем XPath запрос', { xpath: xpathExpression });
            
            const result = xpath.select(xpathExpression, this.document);
            
            Logger.debug('XPath запрос выполнен', { 
                xpath: xpathExpression, 
                resultsCount: Array.isArray(result) ? result.length : 1 
            });
            
            return result;
        } catch (error) {
            Logger.error('Ошибка при выполнении XPath запроса', {
                xpath: xpathExpression,
                error: error.message
            });
            throw error;
        }
    }
    
    evaluateText(xpathExpression) {
        const nodes = this.evaluate(xpathExpression);
        
        if (!Array.isArray(nodes)) {
            return typeof nodes === 'string' ? nodes : (nodes?.textContent || '');
        }
        
        return nodes.map(node => {
            if (typeof node === 'string') return node;
            return node.textContent || '';
        }).filter(text => text.trim());
    }
    
    evaluateAttributes(xpathExpression, attributeName) {
        const nodes = this.evaluate(xpathExpression);
        
        if (!Array.isArray(nodes)) {
            return nodes?.getAttribute ? nodes.getAttribute(attributeName) : null;
        }
        
        return nodes.map(node => {
            return node?.getAttribute ? node.getAttribute(attributeName) : null;
        }).filter(attr => attr !== null);
    }
    
    convertCSSToXPath(cssSelector) {
        try {
            Logger.debug('Конвертируем CSS селектор в XPath', { css: cssSelector });
            
            let xpath = '';
            
            // Обработка основных CSS селекторов
            if (cssSelector.startsWith('#')) {
                // ID селектор: #myid -> //*[@id='myid']
                const id = cssSelector.substring(1);
                xpath = `//*[@id='${id}']`;
            } else if (cssSelector.startsWith('.')) {
                // Class селектор: .myclass -> //*[contains(@class,'myclass')]
                const className = cssSelector.substring(1);
                xpath = `//*[contains(@class,'${className}')]`;
            } else if (cssSelector.includes('[') && cssSelector.includes(']')) {
                // Attribute селектор: div[data-id="123"] -> //div[@data-id='123']
                const match = cssSelector.match(/^(\w+)?\[([^=]+)=?"?([^"]*)"?\]$/);
                if (match) {
                    const tag = match[1] || '*';
                    const attr = match[2];
                    const value = match[3];
                    xpath = value ? `//${tag}[@${attr}='${value}']` : `//${tag}[@${attr}]`;
                }
            } else if (cssSelector.includes('>')) {
                // Прямой потомок: div > p -> //div/p
                const parts = cssSelector.split('>').map(s => s.trim());
                xpath = '//' + parts.join('/');
            } else if (cssSelector.includes(' ')) {
                // Потомок: div p -> //div//p
                const parts = cssSelector.split(' ').filter(s => s.trim());
                xpath = '//' + parts.join('//');
            } else {
                // Простой тег селектор: div -> //div
                xpath = `//${cssSelector}`;
            }
            
            Logger.debug('CSS селектор конвертирован', { css: cssSelector, xpath });
            return xpath;
            
        } catch (error) {
            Logger.error('Ошибка при конвертации CSS в XPath', {
                css: cssSelector,
                error: error.message
            });
            throw error;
        }
    }
    
    generateSmartXPath(element) {
        if (!element || !element.tagName) {
            return null;
        }
        
        const tagName = element.tagName.toLowerCase();
        
        // Проверяем уникальный ID
        if (element.id) {
            return `//${tagName}[@id='${element.id}']`;
        }
        
        // Проверяем уникальные атрибуты
        const uniqueAttrs = ['data-id', 'data-testid', 'data-qa', 'name'];
        for (const attr of uniqueAttrs) {
            const value = element.getAttribute(attr);
            if (value) {
                return `//${tagName}[@${attr}='${value}']`;
            }
        }
        
        // Используем классы
        if (element.className) {
            const classes = element.className.split(' ').filter(c => c.trim());
            if (classes.length > 0) {
                const classConditions = classes.map(c => `contains(@class,'${c}')`).join(' and ');
                return `//${tagName}[${classConditions}]`;
            }
        }
        
        // Генерируем путь через родителей
        return this.generatePathBasedXPath(element);
    }
    
    generatePathBasedXPath(element) {
        const path = [];
        let current = element;
        
        while (current && current.tagName) {
            const tagName = current.tagName.toLowerCase();
            const siblings = Array.from(current.parentNode?.children || []).filter(
                child => child.tagName === current.tagName
            );
            
            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                path.unshift(`${tagName}[${index}]`);
            } else {
                path.unshift(tagName);
            }
            
            current = current.parentNode;
            
            // Останавливаемся на body или после 5 уровней
            if (!current || current.tagName === 'BODY' || path.length >= 5) {
                break;
            }
        }
        
        return '//' + path.join('/');
    }
    
    validateXPath(xpathExpression) {
        try {
            // Простая валидация синтаксиса XPath
            if (!xpathExpression || typeof xpathExpression !== 'string') {
                return { valid: false, error: 'XPath выражение должно быть строкой' };
            }
            
            if (!xpathExpression.startsWith('//') && !xpathExpression.startsWith('/')) {
                return { valid: false, error: 'XPath должен начинаться с / или //' };
            }
            
            // Проверяем баланс скобок
            const openBrackets = (xpathExpression.match(/\[/g) || []).length;
            const closeBrackets = (xpathExpression.match(/\]/g) || []).length;
            
            if (openBrackets !== closeBrackets) {
                return { valid: false, error: 'Несбалансированные скобки в XPath' };
            }
            
            // Проверяем баланс кавычек
            const singleQuotes = (xpathExpression.match(/'/g) || []).length;
            const doubleQuotes = (xpathExpression.match(/"/g) || []).length;
            
            if (singleQuotes % 2 !== 0 || doubleQuotes % 2 !== 0) {
                return { valid: false, error: 'Несбалансированные кавычки в XPath' };
            }
            
            return { valid: true };
            
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }
    
    optimizeXPath(xpathExpression) {
        let optimized = xpathExpression;
        
        // Удаляем лишние // в начале
        optimized = optimized.replace(/^\/\/+/, '//');
        
        // Оптимизируем contains для классов
        optimized = optimized.replace(
            /@class='([^']+)'/g, 
            (match, className) => `contains(@class,'${className}')`
        );
        
        // Упрощаем position() когда возможно
        optimized = optimized.replace(/\[position\(\)=1\]/g, '[1]');
        
        Logger.debug('XPath оптимизирован', { 
            original: xpathExpression, 
            optimized 
        });
        
        return optimized;
    }
    
    findSimilarElements(xpathExpression, similarityThreshold = 0.8) {
        const baseElements = this.evaluate(xpathExpression);
        if (!Array.isArray(baseElements) || baseElements.length === 0) {
            return [];
        }
        
        const baseElement = baseElements[0];
        const allElements = this.evaluate('//*');
        
        const similarElements = [];
        
        for (const element of allElements) {
            if (element === baseElement) continue;
            
            const similarity = this.calculateElementSimilarity(baseElement, element);
            if (similarity >= similarityThreshold) {
                similarElements.push({
                    element,
                    similarity,
                    xpath: this.generateSmartXPath(element)
                });
            }
        }
        
        return similarElements.sort((a, b) => b.similarity - a.similarity);
    }
    
    calculateElementSimilarity(element1, element2) {
        let score = 0;
        
        // Сравниваем тег
        if (element1.tagName === element2.tagName) score += 0.3;
        
        // Сравниваем классы
        const classes1 = (element1.className || '').split(' ').filter(c => c.trim());
        const classes2 = (element2.className || '').split(' ').filter(c => c.trim());
        
        if (classes1.length > 0 && classes2.length > 0) {
            const commonClasses = classes1.filter(c => classes2.includes(c));
            score += (commonClasses.length / Math.max(classes1.length, classes2.length)) * 0.4;
        }
        
        // Сравниваем структуру
        if (element1.children.length === element2.children.length) {
            score += 0.2;
        }
        
        // Сравниваем позицию в DOM
        const parent1 = element1.parentNode;
        const parent2 = element2.parentNode;
        
        if (parent1 && parent2 && parent1.tagName === parent2.tagName) {
            score += 0.1;
        }
        
        return Math.min(score, 1.0);
    }
    
    cleanup() {
        if (this.dom) {
            this.dom.window.close();
            this.dom = null;
            this.document = null;
            Logger.debug('XPath DOM очищен');
        }
    }
}

module.exports = XPathHelper; 