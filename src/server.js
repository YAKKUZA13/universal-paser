const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const UniversalParser = require('./index');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/parse', async (req, res) => {
    try {
        const {
            url,
            itemSelector,
            paginationType,
            paginationConfig,
            fileExtension,
            maxPages,
            delay,
            tagSelectors
        } = req.body;

        const selector = itemSelector && itemSelector.trim() ? itemSelector.trim() : 'body';
        console.log('Используемый селектор:', selector);

        console.log('Получены данные для парсинга:', {
            url,
            itemSelector: selector,
            tagSelectors: JSON.stringify(tagSelectors, null, 2)
        });

        const parser = new UniversalParser({
            maxPages: parseInt(maxPages) || 1,
            delay: parseInt(delay) || 1000
        });

        const config = {
            paginationType,
            paginationConfig,
            itemSelector: selector,
            tagSelectors: tagSelectors || [],
            extractData: ($element, $) => {
                console.log('Начало извлечения данных');
                console.log('HTML элемента:', $element.html());
                
                function extractElementData($el) {
                    const result = {};
                    
                    const attributes = $el.attr();
                    if (attributes) {
                        result.attributes = attributes;
                    }
                    
                    const text = $el.clone().children().remove().end().text().trim();
                    if (text) {
                        result.text = text;
                    }
                    
                    const html = $el.html();
                    if (html) {
                        result.html = html;
                    }
                    
                    const children = $el.children();
                    if (children.length > 0) {
                        result.children = {};
                        
                        children.each((index, child) => {
                            const $child = $(child);
                            const tagName = $child.prop('tagName').toLowerCase();
                            const className = $child.attr('class');
                            const id = $child.attr('id');
                            
                            let childKey = tagName;
                            if (className) {
                                childKey += `.${className.replace(/\s+/g, '.')}`;
                            }
                            if (id) {
                                childKey += `#${id}`;
                            }
                            
                            if (result.children[childKey]) {
                                childKey = `${childKey}_${index}`;
                            }
                            
                            result.children[childKey] = extractElementData($child);
                        });
                    }
                    
                    return result;
                }
                
                const data = extractElementData($element);
                
                console.log('Итоговые извлеченные данные:', JSON.stringify(data, null, 2));
                return data;
            }
        };

        let items = await parser.parse(url, config);

        function cleanStringForCSV(str) {
            if (typeof str !== 'string') {
                return str;
            }
            return str.replace(/[^\wа-яА-ЯёЁ\s]/g, ' ')
                     .replace(/\s+/g, ' ')
                     .trim();
        }

        function cleanObjectForCSV(obj) {
            if (Array.isArray(obj)) {
                return obj.map(item => cleanObjectForCSV(item));
            }
            if (obj !== null && typeof obj === 'object') {
                const cleaned = {};
                for (const [key, value] of Object.entries(obj)) {
                    cleaned[key] = cleanObjectForCSV(value);
                }
                return cleaned;
            }
            return cleanStringForCSV(obj);
        }

        function flattenObject(obj, prefix = '') {
            let flattened = {};
            
            for (const [key, value] of Object.entries(obj)) {
                const newKey = prefix ? `${prefix}.${key}` : key;
                
                if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                    Object.assign(flattened, flattenObject(value, newKey));
                } else if (Array.isArray(value)) {
                    flattened[newKey] = value.join('; ');
                } else {
                    flattened[newKey] = value;
                }
            }
            
            return flattened;
        }

        function convertToCSV(data) {
            if (!Array.isArray(data)) {
                data = [data];
            }

            const flattenedData = data.map(item => flattenObject(item));

            const headers = [...new Set(
                flattenedData.reduce((acc, item) => [...acc, ...Object.keys(item)], [])
            )];

            const csvRows = [
                headers.join(','),
                ...flattenedData.map(item =>
                    headers.map(header => {
                        const value = item[header] || '';
                        const escapedValue = String(value).replace(/"/g, '""');
                        return escapedValue.includes(',') ? `"${escapedValue}"` : escapedValue;
                    }).join(',')
                )
            ];

            return csvRows.join('\n');
        }

        if (fileExtension === 'csv') {
            console.log('Очистка данных для CSV формата...');
            items = cleanObjectForCSV(items);
        }

        const contentType = fileExtension === 'json' ? 'application/json' : 'text/csv';
        const fileName = `parsed-data.${fileExtension}`;

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        if (fileExtension === 'json') {
            res.json(items);
        } else {
            const csv = convertToCSV(items);
            res.send(csv);
        }

    } catch (error) {
        console.error('Ошибка при парсинге:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Сервер запущен на порту ${port}`);
}); 