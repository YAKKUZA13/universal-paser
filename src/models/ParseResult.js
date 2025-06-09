class ParseResult {
    constructor() {
        this.items = [];
        this.metadata = {
            totalItems: 0,
            pagesProcessed: 0,
            startTime: new Date(),
            endTime: null,
            duration: 0,
            errors: [],
            warnings: []
        };
        this.statistics = {
            successfulRequests: 0,
            failedRequests: 0,
            retryAttempts: 0,
            bytesProcessed: 0
        };
    }
    
    addItem(item) {
        this.items.push(item);
        this.metadata.totalItems = this.items.length;
    }
    
    addItems(items) {
        this.items.push(...items);
        this.metadata.totalItems = this.items.length;
    }
    
    addError(error) {
        this.metadata.errors.push({
            message: error.message,
            timestamp: new Date(),
            stack: error.stack
        });
    }
    
    addWarning(warning) {
        this.metadata.warnings.push({
            message: warning,
            timestamp: new Date()
        });
    }
    
    incrementPageCount() {
        this.metadata.pagesProcessed++;
    }
    
    incrementSuccessfulRequests() {
        this.statistics.successfulRequests++;
    }
    
    incrementFailedRequests() {
        this.statistics.failedRequests++;
    }
    
    incrementRetryAttempts() {
        this.statistics.retryAttempts++;
    }
    
    addBytesProcessed(bytes) {
        this.statistics.bytesProcessed += bytes;
    }
    
    finalize() {
        this.metadata.endTime = new Date();
        this.metadata.duration = this.metadata.endTime - this.metadata.startTime;
    }
    
    getSuccessRate() {
        const total = this.statistics.successfulRequests + this.statistics.failedRequests;
        return total > 0 ? (this.statistics.successfulRequests / total) * 100 : 0;
    }
    
    toJSON() {
        return {
            items: this.items,
            metadata: this.metadata,
            statistics: {
                ...this.statistics,
                successRate: this.getSuccessRate()
            }
        };
    }
    
    toExportFormat(format = 'json') {
        switch (format.toLowerCase()) {
            case 'json':
                return JSON.stringify(this.items, null, 2);
            case 'csv':
                return this.toCSV();
            default:
                throw new Error(`Неподдерживаемый формат экспорта: ${format}`);
        }
    }
    
    toCSV() {
        if (this.items.length === 0) {
            return '';
        }
        
        // Получаем все возможные ключи из всех объектов
        const allKeys = new Set();
        this.items.forEach(item => {
            this.collectKeys(item, '', allKeys);
        });
        
        const headers = Array.from(allKeys);
        const csvRows = [headers.join(',')];
        
        this.items.forEach(item => {
            const flattened = this.flattenObject(item);
            const row = headers.map(header => {
                const value = flattened[header] || '';
                const escapedValue = String(value).replace(/"/g, '""');
                return escapedValue.includes(',') ? `"${escapedValue}"` : escapedValue;
            });
            csvRows.push(row.join(','));
        });
        
        return csvRows.join('\n');
    }
    
    collectKeys(obj, prefix = '', keys = new Set()) {
        if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
            Object.keys(obj).forEach(key => {
                const newKey = prefix ? `${prefix}.${key}` : key;
                this.collectKeys(obj[key], newKey, keys);
            });
        } else {
            keys.add(prefix);
        }
        return keys;
    }
    
    flattenObject(obj, prefix = '') {
        let flattened = {};
        
        for (const [key, value] of Object.entries(obj)) {
            const newKey = prefix ? `${prefix}.${key}` : key;
            
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                Object.assign(flattened, this.flattenObject(value, newKey));
            } else if (Array.isArray(value)) {
                flattened[newKey] = value.join('; ');
            } else {
                flattened[newKey] = value;
            }
        }
        
        return flattened;
    }
}

module.exports = ParseResult; 