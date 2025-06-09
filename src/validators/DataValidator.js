const natural = require('natural');
const Logger = require('../utils/logger');

class DataValidator {
    constructor() {
        this.patterns = {
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            phone: /^[\+]?[\d\s\-\(\)]{7,15}$/,
            url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
            price: /^[\$€£¥₽]?\s*\d+([.,]\d+)*$/,
            date: /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$|^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/,
            number: /^\d+([.,]\d+)?$/,
            text: /^[a-zA-Zа-яА-ЯёЁ\s\-.,!?]+$/,
            html: /<[^>]*>/,
            coordinate: /^-?\d+\.\d+$/
        };
        
        this.cleaningRules = {
            text: [
                { pattern: /\s+/g, replacement: ' ' },
                { pattern: /^\s+|\s+$/g, replacement: '' },
                { pattern: /[^\w\sа-яА-ЯёЁ\-.,!?]/g, replacement: '' }
            ],
            html: [
                { pattern: /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, replacement: '' },
                { pattern: /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, replacement: '' },
                { pattern: /<[^>]*>/g, replacement: '' },
                { pattern: /&nbsp;/g, replacement: ' ' },
                { pattern: /&amp;/g, replacement: '&' },
                { pattern: /&lt;/g, replacement: '<' },
                { pattern: /&gt;/g, replacement: '>' },
                { pattern: /&quot;/g, replacement: '"' }
            ],
            price: [
                { pattern: /[^\d.,\$€£¥₽]/g, replacement: '' },
                { pattern: /,/g, replacement: '.' }
            ],
            phone: [
                { pattern: /[^\d\+\-\(\)\s]/g, replacement: '' },
                { pattern: /\s+/g, replacement: ' ' }
            ],
            email: [
                { pattern: /\s/g, replacement: '' }
            ]
        };
        
        this.validationRules = {
            minLength: 1,
            maxLength: 10000,
            allowEmpty: false,
            trimWhitespace: true,
            validateFormat: true
        };
    }
    
    validateData(data, schema = {}) {
        Logger.debug('Начинаем валидацию данных', { 
            itemsCount: Array.isArray(data) ? data.length : 1,
            schemaKeys: Object.keys(schema)
        });
        
        const result = {
            isValid: true,
            errors: [],
            warnings: [],
            cleanedData: null,
            statistics: {
                totalItems: 0,
                validItems: 0,
                invalidItems: 0,
                cleanedItems: 0
            }
        };
        
        try {
            if (Array.isArray(data)) {
                result.cleanedData = [];
                result.statistics.totalItems = data.length;
                
                for (let i = 0; i < data.length; i++) {
                    const itemResult = this.validateItem(data[i], schema, i);
                    
                    if (itemResult.isValid) {
                        result.cleanedData.push(itemResult.cleanedData);
                        result.statistics.validItems++;
                        
                        if (itemResult.wasCleaned) {
                            result.statistics.cleanedItems++;
                        }
                    } else {
                        result.statistics.invalidItems++;
                        result.errors.push(...itemResult.errors);
                        
                        // Решаем, включать ли невалидные данные
                        if (schema.includeInvalid) {
                            result.cleanedData.push(itemResult.cleanedData);
                        }
                    }
                    
                    result.warnings.push(...itemResult.warnings);
                }
                
                // Проверяем общую валидность
                const validRatio = result.statistics.validItems / result.statistics.totalItems;
                if (validRatio < 0.5) {
                    result.isValid = false;
                    result.errors.unshift({
                        type: 'critical',
                        message: `Слишком много невалидных данных: ${Math.round((1 - validRatio) * 100)}%`
                    });
                }
                
            } else {
                const itemResult = this.validateItem(data, schema);
                result.cleanedData = itemResult.cleanedData;
                result.isValid = itemResult.isValid;
                result.errors = itemResult.errors;
                result.warnings = itemResult.warnings;
                result.statistics.totalItems = 1;
                result.statistics.validItems = itemResult.isValid ? 1 : 0;
                result.statistics.invalidItems = itemResult.isValid ? 0 : 1;
            }
            
            Logger.info('Валидация данных завершена', {
                isValid: result.isValid,
                validItems: result.statistics.validItems,
                invalidItems: result.statistics.invalidItems,
                errorsCount: result.errors.length
            });
            
            // Добавляем детальное логирование ошибок если есть проблемы
            if (!result.isValid && result.errors.length > 0) {
                Logger.warn('Детали ошибок валидации', {
                    errorsCount: result.errors.length,
                    errorSample: result.errors.slice(0, 5), // Первые 5 ошибок для анализа
                    errorTypes: result.errors.reduce((acc, error) => {
                        acc[error.type] = (acc[error.type] || 0) + 1;
                        return acc;
                    }, {})
                });
            }
            
            return result;
            
        } catch (error) {
            Logger.error('Ошибка при валидации данных', { error: error.message });
            result.isValid = false;
            result.errors.push({
                type: 'critical',
                message: `Критическая ошибка валидации: ${error.message}`
            });
            return result;
        }
    }
    
    validateItem(item, schema = {}, index = null) {
        const result = {
            isValid: true,
            errors: [],
            warnings: [],
            cleanedData: {},
            wasCleaned: false
        };
        
        const itemPrefix = index !== null ? `[${index}]` : '';
        
        try {
            if (typeof item !== 'object' || item === null) {
                result.isValid = false;
                result.errors.push({
                    type: 'structure',
                    message: `${itemPrefix} Элемент должен быть объектом`,
                    field: itemPrefix
                });
                return result;
            }
            
            // Обрабатываем каждое поле
            for (const [key, value] of Object.entries(item)) {
                const fieldSchema = schema[key] || {};
                const fieldResult = this.validateField(value, fieldSchema, `${itemPrefix}.${key}`);
                
                if (fieldResult.isValid) {
                    result.cleanedData[key] = fieldResult.cleanedValue;
                    if (fieldResult.wasCleaned) {
                        result.wasCleaned = true;
                    }
                } else {
                    result.isValid = false;
                    result.errors.push(...fieldResult.errors);
                }
                
                result.warnings.push(...fieldResult.warnings);
            }
            
            // Добавляем обязательные поля если они отсутствуют
            for (const [key, fieldSchema] of Object.entries(schema)) {
                if (fieldSchema.required && !(key in item)) {
                    result.isValid = false;
                    result.errors.push({
                        type: 'missing',
                        message: `${itemPrefix}.${key} Обязательное поле отсутствует`,
                        field: `${itemPrefix}.${key}`
                    });
                }
            }
            
            // Дополнительная валидация целостности
            const integrityResult = this.validateItemIntegrity(result.cleanedData, schema, itemPrefix);
            if (!integrityResult.isValid) {
                result.isValid = false;
                result.errors.push(...integrityResult.errors);
            }
            result.warnings.push(...integrityResult.warnings);
            
        } catch (error) {
            result.isValid = false;
            result.errors.push({
                type: 'critical',
                message: `${itemPrefix} Ошибка валидации элемента: ${error.message}`,
                field: itemPrefix
            });
        }
        
        return result;
    }
    
    validateField(value, schema = {}, fieldPath = '') {
        const result = {
            isValid: true,
            errors: [],
            warnings: [],
            cleanedValue: value,
            wasCleaned: false
        };
        
        try {
            // Проверка на пустые значения
            if (value === null || value === undefined || value === '') {
                if (schema.required) {
                    result.isValid = false;
                    result.errors.push({
                        type: 'required',
                        message: `${fieldPath} Поле обязательно для заполнения`,
                        field: fieldPath
                    });
                }
                return result;
            }
            
            // Очистка данных
            if (schema.type && this.cleaningRules[schema.type]) {
                const originalValue = value;
                result.cleanedValue = this.cleanValue(value, schema.type);
                if (result.cleanedValue !== originalValue) {
                    result.wasCleaned = true;
                    result.warnings.push({
                        type: 'cleaned',
                        message: `${fieldPath} Значение было очищено`,
                        field: fieldPath,
                        original: originalValue,
                        cleaned: result.cleanedValue
                    });
                }
            }
            
            // Валидация типа
            if (schema.type) {
                const typeResult = this.validateType(result.cleanedValue, schema.type, fieldPath);
                if (!typeResult.isValid) {
                    result.isValid = false;
                    result.errors.push(...typeResult.errors);
                }
                result.warnings.push(...typeResult.warnings);
            }
            
            // Валидация длины
            if (typeof result.cleanedValue === 'string') {
                const lengthResult = this.validateLength(
                    result.cleanedValue, 
                    schema.minLength || this.validationRules.minLength,
                    schema.maxLength || this.validationRules.maxLength,
                    fieldPath
                );
                if (!lengthResult.isValid) {
                    result.isValid = false;
                    result.errors.push(...lengthResult.errors);
                }
            }
            
            // Кастомная валидация
            if (schema.validator && typeof schema.validator === 'function') {
                const customResult = schema.validator(result.cleanedValue, fieldPath);
                if (!customResult.isValid) {
                    result.isValid = false;
                    result.errors.push(...customResult.errors);
                }
                result.warnings.push(...(customResult.warnings || []));
            }
            
        } catch (error) {
            result.isValid = false;
            result.errors.push({
                type: 'critical',
                message: `${fieldPath} Критическая ошибка валидации поля: ${error.message}`,
                field: fieldPath
            });
        }
        
        return result;
    }
    
    cleanValue(value, type) {
        if (typeof value !== 'string') {
            return value;
        }
        
        const rules = this.cleaningRules[type] || [];
        let cleaned = value;
        
        for (const rule of rules) {
            cleaned = cleaned.replace(rule.pattern, rule.replacement);
        }
        
        return cleaned.trim();
    }
    
    validateType(value, expectedType, fieldPath) {
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };
        
        const pattern = this.patterns[expectedType];
        if (!pattern) {
            result.warnings.push({
                type: 'unknown_type',
                message: `${fieldPath} Неизвестный тип валидации: ${expectedType}`,
                field: fieldPath
            });
            return result;
        }
        
        if (typeof value === 'string' && !pattern.test(value)) {
            result.isValid = false;
            result.errors.push({
                type: 'format',
                message: `${fieldPath} Неверный формат для типа ${expectedType}`,
                field: fieldPath,
                expectedType,
                value
            });
        }
        
        return result;
    }
    
    validateLength(value, minLength, maxLength, fieldPath) {
        const result = {
            isValid: true,
            errors: []
        };
        
        const length = value.length;
        
        if (length < minLength) {
            result.isValid = false;
            result.errors.push({
                type: 'min_length',
                message: `${fieldPath} Значение слишком короткое (${length} < ${minLength})`,
                field: fieldPath,
                actualLength: length,
                minLength
            });
        }
        
        if (length > maxLength) {
            result.isValid = false;
            result.errors.push({
                type: 'max_length',
                message: `${fieldPath} Значение слишком длинное (${length} > ${maxLength})`,
                field: fieldPath,
                actualLength: length,
                maxLength
            });
        }
        
        return result;
    }
    
    validateItemIntegrity(item, schema, itemPrefix) {
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };
        
        try {
            // Проверяем связанные поля
            if (schema.relationships) {
                for (const relationship of schema.relationships) {
                    const relResult = this.validateRelationship(item, relationship, itemPrefix);
                    if (!relResult.isValid) {
                        result.isValid = false;
                        result.errors.push(...relResult.errors);
                    }
                    result.warnings.push(...relResult.warnings);
                }
            }
            
            // Проверяем на дублирование ключевых полей
            if (schema.uniqueFields) {
                for (const field of schema.uniqueFields) {
                    if (item[field] && this.isDuplicateValue(item[field], field)) {
                        result.warnings.push({
                            type: 'duplicate',
                            message: `${itemPrefix}.${field} Возможно дублирующееся значение`,
                            field: `${itemPrefix}.${field}`,
                            value: item[field]
                        });
                    }
                }
            }
            
        } catch (error) {
            result.warnings.push({
                type: 'integrity_error',
                message: `${itemPrefix} Ошибка при проверке целостности: ${error.message}`,
                field: itemPrefix
            });
        }
        
        return result;
    }
    
    validateRelationship(item, relationship, itemPrefix) {
        const result = {
            isValid: true,
            errors: [],
            warnings: []
        };
        
        const { type, fields, condition } = relationship;
        
        switch (type) {
            case 'required_together':
                // Все поля должны быть заполнены одновременно
                const hasAny = fields.some(field => item[field]);
                const hasAll = fields.every(field => item[field]);
                
                if (hasAny && !hasAll) {
                    result.isValid = false;
                    result.errors.push({
                        type: 'required_together',
                        message: `${itemPrefix} Поля [${fields.join(', ')}] должны быть заполнены вместе`,
                        field: itemPrefix,
                        fields
                    });
                }
                break;
                
            case 'mutually_exclusive':
                // Только одно поле может быть заполнено
                const filledFields = fields.filter(field => item[field]);
                if (filledFields.length > 1) {
                    result.isValid = false;
                    result.errors.push({
                        type: 'mutually_exclusive',
                        message: `${itemPrefix} Поля [${fields.join(', ')}] взаимоисключающие`,
                        field: itemPrefix,
                        fields: filledFields
                    });
                }
                break;
                
            case 'conditional':
                // Проверяем условную зависимость
                if (condition && typeof condition === 'function') {
                    const conditionResult = condition(item);
                    if (!conditionResult.isValid) {
                        result.isValid = false;
                        result.errors.push({
                            type: 'conditional',
                            message: `${itemPrefix} ${conditionResult.message}`,
                            field: itemPrefix
                        });
                    }
                }
                break;
        }
        
        return result;
    }
    
    isDuplicateValue(value, field) {
        // Простая проверка на дублирование (можно расширить с использованием кэша)
        if (!this.seenValues) {
            this.seenValues = {};
        }
        
        if (!this.seenValues[field]) {
            this.seenValues[field] = new Set();
        }
        
        if (this.seenValues[field].has(value)) {
            return true;
        }
        
        this.seenValues[field].add(value);
        return false;
    }
    
    generateValidationSchema(sampleData) {
        Logger.info('Генерируем схему валидации на основе образца данных');
        
        const schema = {};
        
        if (Array.isArray(sampleData) && sampleData.length > 0) {
            const sample = sampleData[0];
            
            for (const [key, value] of Object.entries(sample)) {
                schema[key] = this.inferFieldType(value, key);
            }
        } else if (typeof sampleData === 'object' && sampleData !== null) {
            for (const [key, value] of Object.entries(sampleData)) {
                schema[key] = this.inferFieldType(value, key);
            }
        }
        
        Logger.debug('Схема валидации сгенерирована', { 
            fieldsCount: Object.keys(schema).length,
            fields: Object.keys(schema)
        });
        
        return schema;
    }
    
    inferFieldType(value, fieldName) {
        const field = {
            type: 'text',
            required: false
        };
        
        if (typeof value === 'string') {
            // Определяем тип на основе содержимого и имени поля
            const lowerFieldName = fieldName.toLowerCase();
            
            if (this.patterns.email.test(value) || lowerFieldName.includes('email')) {
                field.type = 'email';
                field.minLength = 5;
                field.maxLength = 254; // RFC стандарт для email
            } else if (this.patterns.phone.test(value) || lowerFieldName.includes('phone')) {
                field.type = 'phone';
                field.minLength = 7;
                field.maxLength = 20;
            } else if (this.patterns.url.test(value) || lowerFieldName.includes('url')) {
                field.type = 'url';
                field.minLength = 10;
                field.maxLength = 2048; // Стандартный лимит URL
            } else if (this.patterns.price.test(value) || lowerFieldName.includes('price')) {
                field.type = 'price';
                field.minLength = 1;
                field.maxLength = 20;
            } else if (this.patterns.date.test(value) || lowerFieldName.includes('date')) {
                field.type = 'date';
                field.minLength = 8;
                field.maxLength = 20;
            } else if (this.patterns.number.test(value)) {
                field.type = 'number';
                field.minLength = 1;
                field.maxLength = 50;
            } else if (this.patterns.html.test(value)) {
                field.type = 'html';
                field.minLength = 1;
                field.maxLength = 5000; // Для HTML контента
            } else {
                // Для обычного текста
                field.type = 'text';
                field.minLength = 1;
                field.maxLength = 1000; // Устанавливаем лимит в 1000 символов 
            }
        } else if (typeof value === 'number') {
            field.type = 'number';
            field.minLength = 1;
            field.maxLength = 50;
        } else if (typeof value === 'boolean') {
            field.type = 'boolean';
        } else if (Array.isArray(value)) {
            field.type = 'array';
            field.minLength = 0;
            field.maxLength = 200; // Максимум элементов в массиве
        } else if (typeof value === 'object') {
            field.type = 'object';
        }
        
        return field;
    }
    
    clearCache() {
        this.seenValues = {};
        Logger.debug('Кэш валидации очищен');
    }
}

module.exports = DataValidator; 