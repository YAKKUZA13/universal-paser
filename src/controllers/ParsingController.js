const ParsingService = require('../services/ParsingService');
const Logger = require('../utils/logger');

class ParsingController {
    constructor() {
        this.parsingService = new ParsingService();
    }
    
    async parse(req, res, next) {
        try {
            Logger.info('Получен запрос на улучшенный парсинг', {
                url: req.body.url,
                fileExtension: req.body.fileExtension,
                maxPages: req.body.maxPages,
                strategy: req.body.strategy || 'auto',
                enableValidation: req.body.enableDataValidation !== false
            });
            
            // Выполняем парсинг
            const result = await this.parsingService.parse(req.body);
            
            // Формируем ответ в зависимости от запрашиваемого формата
            const fileExtension = req.body.fileExtension || 'json';
            const fileName = `parsed-data.${fileExtension}`;
            
            // Устанавливаем заголовки для скачивания файла
            if (fileExtension === 'json') {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                
                // Включаем метаданные если запрошено
                if (req.body.includeMetadata) {
                    res.json(result.toJSON());
                } else {
                    res.json(result.items);
                }
            } else if (fileExtension === 'csv') {
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                const csvData = result.toExportFormat('csv');
                res.send(csvData);
            } else {
                throw new Error(`Неподдерживаемый формат экспорта: ${fileExtension}`);
            }
            
            Logger.info('Улучшенный парсинг успешно завершен и файл отправлен', {
                fileName,
                itemsCount: result.metadata.totalItems,
                duration: result.metadata.duration,
                successRate: result.getSuccessRate(),
                errorsCount: result.metadata.errors.length,
                warningsCount: result.metadata.warnings.length
            });
            
        } catch (error) {
            Logger.error('Ошибка в контроллере улучшенного парсинга', {
                error: error.message,
                body: req.body
            });
            next(error);
        }
    }
    
    async analyzeStructure(req, res, next) {
        try {
            const { url } = req.body;
            
            if (!url) {
                return res.status(400).json({
                    error: 'URL является обязательным параметром',
                    success: false
                });
            }
            
            Logger.info('Запрос на анализ структуры страницы', { url });
            
            const analysis = await this.parsingService.analyzePageStructure(url);
            
            res.json({
                success: true,
                analysis: {
                    pageType: analysis.pageType,
                    confidence: analysis.confidence,
                    contentStructure: analysis.contentStructure,
                    suggestedSelectors: analysis.suggestedSelectors,
                    dataPatterns: analysis.dataPatterns,
                    recommendations: analysis.recommendations
                }
            });
            
            Logger.info('Анализ структуры завершен и отправлен', {
                url,
                pageType: analysis.pageType,
                confidence: analysis.confidence
            });
            
        } catch (error) {
            Logger.error('Ошибка при анализе структуры страницы', {
                error: error.message,
                url: req.body.url
            });
            next(error);
        }
    }
    
    async validateUrl(req, res, next) {
        try {
            const { url } = req.body;
            
            if (!url) {
                return res.status(400).json({
                    error: 'URL является обязательным параметром',
                    valid: false
                });
            }
            
            const validation = await this.parsingService.validateUrl(url);
            
            res.json({
                valid: validation.valid,
                accessible: validation.accessible,
                url: url,
                error: validation.error || null
            });
            
        } catch (error) {
            Logger.error('Ошибка при валидации URL', {
                error: error.message,
                url: req.body.url
            });
            next(error);
        }
    }
    
    async estimateTime(req, res, next) {
        try {
            const estimation = await this.parsingService.estimateParsingTime(req.body);
            
            res.json({
                estimatedTime: estimation.estimatedTime,
                estimatedTimeFormatted: this.formatTime(estimation.estimatedTime),
                strategy: estimation.strategy,
                pages: estimation.pages,
                features: estimation.features || []
            });
            
        } catch (error) {
            Logger.error('Ошибка при оценке времени парсинга', {
                error: error.message,
                body: req.body
            });
            next(error);
        }
    }
    
    async getStrategies(req, res, next) {
        try {
            const strategies = this.parsingService.getAvailableStrategies();
            
            res.json({
                strategies: strategies
            });
            
        } catch (error) {
            Logger.error('Ошибка при получении списка стратегий', {
                error: error.message
            });
            next(error);
        }
    }
    
    async parseWithStrategy(req, res, next) {
        try {
            const { strategy, ...requestData } = req.body;
            
            if (!strategy) {
                return res.status(400).json({
                    error: 'Стратегия парсинга является обязательным параметром'
                });
            }
            
            Logger.info('Запрос на парсинг с определенной стратегией', {
                strategy,
                url: requestData.url,
                enableValidation: requestData.enableDataValidation !== false
            });
            
            const result = await this.parsingService.parseWithCustomStrategy(requestData, strategy);
            
            const fileExtension = requestData.fileExtension || 'json';
            const fileName = `parsed-data-${strategy}.${fileExtension}`;
            
            if (fileExtension === 'json') {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                
                if (requestData.includeMetadata) {
                    res.json(result.toJSON());
                } else {
                    res.json(result.items);
                }
            } else if (fileExtension === 'csv') {
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                const csvData = result.toExportFormat('csv');
                res.send(csvData);
            }
            
            Logger.info('Парсинг с определенной стратегией завершен', {
                strategy,
                itemsCount: result.metadata.totalItems,
                duration: result.metadata.duration
            });
            
        } catch (error) {
            Logger.error('Ошибка при парсинге с кастомной стратегией', {
                error: error.message,
                strategy: req.body.strategy
            });
            next(error);
        }
    }
    
    async validateXPath(req, res, next) {
        try {
            const { xpath } = req.body;
            
            if (!xpath) {
                return res.status(400).json({
                    valid: false,
                    error: 'XPath выражение является обязательным параметром'
                });
            }
            
            const XPathHelper = require('../utils/XPathHelper');
            const xpathHelper = new XPathHelper();
            
            const validation = xpathHelper.validateXPath(xpath);
            
            let optimizedXPath = null;
            if (validation.valid) {
                optimizedXPath = xpathHelper.optimizeXPath(xpath);
            }
            
            res.json({
                valid: validation.valid,
                error: validation.error || null,
                original: xpath,
                optimized: optimizedXPath
            });
            
            xpathHelper.cleanup();
            
        } catch (error) {
            Logger.error('Ошибка при валидации XPath', {
                error: error.message,
                xpath: req.body.xpath
            });
            next(error);
        }
    }
    
    async convertCSSToXPath(req, res, next) {
        try {
            const { cssSelector } = req.body;
            
            if (!cssSelector) {
                return res.status(400).json({
                    error: 'CSS селектор является обязательным параметром',
                    success: false
                });
            }
            
            const XPathHelper = require('../utils/XPathHelper');
            const xpathHelper = new XPathHelper();
            
            const xpath = xpathHelper.convertCSSToXPath(cssSelector);
            const validation = xpathHelper.validateXPath(xpath);
            
            res.json({
                success: true,
                cssSelector: cssSelector,
                xpath: xpath,
                valid: validation.valid,
                error: validation.error || null
            });
            
            xpathHelper.cleanup();
            
        } catch (error) {
            Logger.error('Ошибка при конвертации CSS в XPath', {
                error: error.message,
                cssSelector: req.body.cssSelector
            });
            next(error);
        }
    }
    
    async getParsingPreview(req, res, next) {
        try {
            const { url, itemSelector, maxItems = 5 } = req.body;
            
            if (!url || !itemSelector) {
                return res.status(400).json({
                    error: 'URL и itemSelector являются обязательными параметрами',
                    success: false
                });
            }
            
            Logger.info('Запрос на предварительный просмотр парсинга', {
                url,
                itemSelector,
                maxItems
            });
            
            // Создаем ограниченную конфигурацию для предварительного просмотра
            const previewConfig = {
                ...req.body,
                maxPages: 1,
                delay: 0,
                enableDataValidation: false // Отключаем валидацию для превью, чтобы показать данные как есть
            };
            
            const result = await this.parsingService.parse(previewConfig);
            
            // Ограничиваем количество элементов для превью
            const previewItems = result.items.slice(0, maxItems);
            
            // Форматируем данные для читаемого отображения
            const formattedItems = previewItems.map(item => this.formatPreviewItem(item));
            
            res.json({
                success: true,
                preview: {
                    items: formattedItems,
                    totalFound: result.metadata.totalItems,
                    structure: this.analyzePreviewStructure(previewItems),
                    recommendations: this.generatePreviewRecommendations(result)
                }
            });
            
        } catch (error) {
            Logger.error('Ошибка при получении предварительного просмотра', {
                error: error.message,
                url: req.body.url
            });
            next(error);
        }
    }
    
    formatPreviewItem(item) {
        const formatted = {};
        
        for (const [key, value] of Object.entries(item)) {
            if (key === 'links' && Array.isArray(value)) {
                // Форматируем ссылки как читаемый текст
                formatted[key] = value.map(link => 
                    typeof link === 'object' && link.href && link.text 
                        ? `${link.text} → ${link.href}`
                        : link
                ).join('; ') || 'Нет ссылок';
            } else if (key === 'images' && Array.isArray(value)) {
                // Форматируем изображения как читаемый текст
                formatted[key] = value.map(img => 
                    typeof img === 'object' && img.src 
                        ? `${img.alt || 'Изображение'} → ${img.src}`
                        : img
                ).join('; ') || 'Нет изображений';
            } else if (Array.isArray(value)) {
                // Другие массивы просто объединяем
                formatted[key] = value.map(v => 
                    typeof v === 'object' ? JSON.stringify(v) : v
                ).join('; ');
            } else if (typeof value === 'object' && value !== null) {
                // Объекты преобразуем в JSON
                formatted[key] = JSON.stringify(value, null, 2);
            } else {
                // Остальные значения оставляем как есть
                formatted[key] = value;
            }
        }
        
        return formatted;
    }
    
    analyzePreviewStructure(items) {
        if (!items || items.length === 0) {
            return { fieldCount: 0, fields: [] };
        }
        
        const allFields = new Set();
        const fieldTypes = {};
        
        items.forEach(item => {
            Object.keys(item).forEach(key => {
                allFields.add(key);
                
                const value = item[key];
                const type = this.inferFieldType(value);
                
                if (!fieldTypes[key]) {
                    fieldTypes[key] = { types: new Set(), samples: [] };
                }
                
                fieldTypes[key].types.add(type);
                if (fieldTypes[key].samples.length < 3) {
                    fieldTypes[key].samples.push(value);
                }
            });
        });
        
        const fields = Array.from(allFields).map(field => ({
            name: field,
            types: Array.from(fieldTypes[field].types),
            samples: fieldTypes[field].samples
        }));
        
        return {
            fieldCount: allFields.size,
            fields
        };
    }
    
    inferFieldType(value) {
        if (value === null || value === undefined) return 'null';
        if (typeof value === 'string') {
            if (value.includes('<') && value.includes('>')) return 'html';
            if (value.match(/^\d+$/)) return 'number';
            if (value.match(/^https?:\/\//)) return 'url';
            if (value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return 'email';
            return 'text';
        }
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        if (Array.isArray(value)) return 'array';
        if (typeof value === 'object') return 'object';
        return 'unknown';
    }
    
    generatePreviewRecommendations(result) {
        const recommendations = [];
        
        if (result.metadata.totalItems === 0) {
            recommendations.push({
                type: 'warning',
                message: 'Элементы не найдены. Проверьте селектор.'
            });
        } else if (result.metadata.totalItems < 5) {
            recommendations.push({
                type: 'info',
                message: 'Найдено мало элементов. Возможно, стоит проверить селектор.'
            });
        } else if (result.metadata.totalItems > 100) {
            recommendations.push({
                type: 'tip',
                message: 'Найдено много элементов. Рассмотрите возможность более точного селектора.'
            });
        }
        
        if (result.metadata.errors.length > 0) {
            // Анализируем типы ошибок
            const errorTypes = result.metadata.errors.reduce((acc, error) => {
                const type = error.type || 'unknown';
                acc[type] = (acc[type] || 0) + 1;
                return acc;
            }, {});
            
            // Формируем детальное сообщение об ошибках
            const errorDetails = Object.entries(errorTypes)
                .map(([type, count]) => `${type}: ${count}`)
                .join(', ');
                
            recommendations.push({
                type: 'error',
                message: `Обнаружены ошибки валидации (${result.metadata.errors.length}): ${errorDetails}`,
                details: result.metadata.errors.slice(0, 3) // Показываем первые 3 ошибки как примеры
            });
        }
        
        return recommendations;
    }
    
    formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}ч ${minutes % 60}м ${seconds % 60}с`;
        } else if (minutes > 0) {
            return `${minutes}м ${seconds % 60}с`;
        } else {
            return `${seconds}с`;
        }
    }
}

module.exports = ParsingController; 