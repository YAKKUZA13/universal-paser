// Universal Web Parser v2.0 - Frontend JavaScript
class ParserUI {
    constructor() {
        this.currentTab = 'basic';
        this.analysisResults = null;
        this.previewResults = null;
        this.isLoading = false;
        this.init();
    }

    init() {
        this.setupTabs();
        this.setupFormHandlers();
        this.setupValidation();
        this.setupXPathTools();
        this.setupModals();
        this.loadStrategies();
        this.setupPaginationConfig();
        this.setupMonitoring();
    }

    // Tab Management
    setupTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                this.switchTab(tab);
            });
        });
    }

    switchTab(tabName) {
        // Remove active class from all tabs and content
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // Add active class to clicked tab and corresponding content
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(tabName).classList.add('active');

        this.currentTab = tabName;
    }

    // Form Handlers
    setupFormHandlers() {
        const form = document.getElementById('parserForm');
        form.addEventListener('submit', (e) => this.handleParsing(e));

        // Strategy selection
        document.getElementById('strategy').addEventListener('change', (e) => {
            this.updateStrategyInfo(e.target.value);
        });

        // URL validation
        document.getElementById('validateUrlBtn').addEventListener('click', () => {
            this.validateUrl();
        });

        // AI Analysis
        document.getElementById('analyzeBtn').addEventListener('click', () => {
            this.runAnalysis();
        });

        // Preview
        document.getElementById('previewBtn').addEventListener('click', () => {
            this.runPreview();
        });

        // Time estimation
        document.getElementById('estimateBtn').addEventListener('click', () => {
            this.estimateTime();
        });

        // Tool buttons
        document.getElementById('testSelectorBtn').addEventListener('click', () => {
            this.testSelector();
        });

        document.getElementById('generateSchemaBtn').addEventListener('click', () => {
            this.generateSchema();
        });

        document.getElementById('exportConfigBtn').addEventListener('click', () => {
            this.exportConfig();
        });

        document.getElementById('importConfigBtn').addEventListener('click', () => {
            this.importConfig();
        });

        // AI Analysis tab
        document.getElementById('runAnalysisBtn').addEventListener('click', () => {
            this.runStructureAnalysis();
        });

        // Preview tab
        document.getElementById('runPreviewBtn').addEventListener('click', () => {
            this.runPreviewAnalysis();
        });
    }

    // Form Validation
    setupValidation() {
        const urlInput = document.getElementById('url');
        urlInput.addEventListener('blur', () => {
            if (urlInput.value) {
                this.validateUrlFormat(urlInput.value);
            }
        });

        const itemSelector = document.getElementById('itemSelector');
        itemSelector.addEventListener('blur', () => {
            if (itemSelector.value) {
                this.validateSelector(itemSelector.value);
            }
        });
    }

    // XPath Tools
    setupXPathTools() {
        document.getElementById('addXPathBtn').addEventListener('click', () => {
            this.addXPathSelector();
        });

        document.getElementById('convertCSSBtn').addEventListener('click', () => {
            this.showCSSToXPathModal();
        });

        document.getElementById('validateXPathBtn').addEventListener('click', () => {
            this.validateXPathSelectors();
        });

        // XPath type change handler
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('xpath-type')) {
                const attributeInput = e.target.parentElement.querySelector('.xpath-attribute');
                if (e.target.value === 'attribute') {
                    attributeInput.style.display = 'block';
                    attributeInput.required = true;
                } else {
                    attributeInput.style.display = 'none';
                    attributeInput.required = false;
                }
            }
        });

        // Remove XPath selector
        document.addEventListener('click', (e) => {
            if (e.target.closest('.remove-xpath')) {
                e.target.closest('.selector-item').remove();
            }
        });
    }

    // Modal Management
    setupModals() {
        // CSS to XPath modal
        const modal = document.getElementById('cssToXPathModal');
        const closeButtons = modal.querySelectorAll('.modal-close');
        
        closeButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                modal.classList.remove('active');
            });
        });

        // Convert button
        document.getElementById('convertBtn').addEventListener('click', () => {
            this.convertCSSToXPath();
        });

        // Close modal on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    }

    // Pagination Configuration
    setupPaginationConfig() {
        const paginationType = document.getElementById('paginationType');
        paginationType.addEventListener('change', () => {
            this.updatePaginationConfig(paginationType.value);
        });
    }

    updatePaginationConfig(type) {
        // Hide all config sections
        document.querySelectorAll('.config-section').forEach(section => {
            section.classList.remove('active');
        });

        // Show relevant config section
        if (type !== 'none') {
            const configId = type + 'Config';
            const configSection = document.getElementById(configId);
            if (configSection) {
                configSection.classList.add('active');
            }
        }
    }

    // Load Available Strategies
    async loadStrategies() {
        try {
            const response = await fetch('/strategies');
            const data = await response.json();
            
            const strategySelect = document.getElementById('strategy');
            
            // Clear existing options (except auto)
            const autoOption = strategySelect.querySelector('option[value=""]');
            strategySelect.innerHTML = '';
            strategySelect.appendChild(autoOption);
            
            // Add strategy options
            data.strategies.forEach(strategy => {
                const option = document.createElement('option');
                option.value = strategy.name;
                option.textContent = strategy.displayName;
                strategySelect.appendChild(option);
            });
            
        } catch (error) {
            this.showNotification('Ошибка загрузки стратегий: ' + error.message, 'error');
        }
    }

    updateStrategyInfo(strategyName) {
        const descriptions = {
            '': 'Автоматический выбор наилучшей стратегии на основе параметров',
            'cheerio': 'Быстрый парсинг статических HTML страниц без JavaScript поддержки',
            'puppeteer': 'Полная поддержка JavaScript, медленнее но подходит для динамических сайтов',
            'xpath': 'Продвинутые XPath селекторы для точной навигации по DOM структуре',
            'smart-puppeteer': 'ИИ анализ + SPA поддержка + infinite scrolling + fallback стратегии'
        };

        const description = descriptions[strategyName] || '';
        document.getElementById('strategyDescription').textContent = description;
    }

    // URL Validation
    async validateUrl() {
        const url = document.getElementById('url').value;
        if (!url) {
            this.showNotification('Введите URL для проверки', 'warning');
            return;
        }

        this.showLoading();
        
        try {
            const response = await fetch('/validate-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const result = await response.json();
            const validationDiv = document.getElementById('urlValidation');
            
            if (result.valid && result.accessible) {
                validationDiv.className = 'validation-result success';
                validationDiv.innerHTML = '<i class="fas fa-check"></i> URL доступен';
            } else {
                validationDiv.className = 'validation-result error';
                validationDiv.innerHTML = `<i class="fas fa-times"></i> ${result.error || 'URL недоступен'}`;
            }
            
        } catch (error) {
            this.showNotification('Ошибка проверки URL: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    validateUrlFormat(url) {
        try {
            new URL(url);
            return true;
        } catch {
            this.showNotification('Неверный формат URL', 'warning');
            return false;
        }
    }

    validateSelector(selector) {
        // Basic CSS selector validation
        try {
            document.querySelector(selector);
            return true;
        } catch {
            this.showNotification('Неверный CSS селектор', 'warning');
            return false;
        }
    }

    // AI Analysis
    async runAnalysis() {
        const url = document.getElementById('url').value;
        if (!url) {
            this.showNotification('Введите URL для анализа', 'warning');
            return;
        }

        // Switch to AI tab and run analysis
        this.switchTab('ai');
        document.getElementById('analyzeUrl').value = url;
        this.runStructureAnalysis();
    }

    async runStructureAnalysis() {
        const url = document.getElementById('analyzeUrl').value;
        if (!url) {
            this.showNotification('Введите URL для анализа', 'warning');
            return;
        }

        this.showLoading();
        
        try {
            const response = await fetch('/analyze-structure', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const result = await response.json();
            
            if (result.success) {
                this.analysisResults = result.analysis;
                this.displayAnalysisResults(result.analysis);
                this.showNotification('Анализ структуры завершен', 'success');
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            this.showNotification('Ошибка анализа: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    displayAnalysisResults(analysis) {
        const container = document.getElementById('analysisResults');
        
        const confidenceClass = analysis.confidence >= 0.7 ? 'confidence-high' : 
                               analysis.confidence >= 0.4 ? 'confidence-medium' : 'confidence-low';
        
        container.innerHTML = `
            <div class="analysis-card">
                <div class="analysis-header">
                    <h3><i class="fas fa-chart-line"></i> Результаты анализа</h3>
                    <span class="confidence-badge ${confidenceClass}">
                        Уверенность: ${Math.round(analysis.confidence * 100)}%
                    </span>
                </div>
                
                <div class="analysis-content">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Тип страницы:</label>
                            <strong>${this.getPageTypeLabel(analysis.pageType)}</strong>
                        </div>
                        <div class="form-group">
                            <label>Найдено паттернов:</label>
                            <strong>${analysis.dataPatterns.length}</strong>
                        </div>
                    </div>
                    
                    ${this.renderSuggestedSelectors(analysis.suggestedSelectors)}
                    ${this.renderRecommendations(analysis.recommendations)}
                </div>
                
                <div class="action-buttons">
                    <button type="button" class="btn-primary" onclick="parserUI.applySuggestedSelectors()">
                        <i class="fas fa-magic"></i> Применить предложения
                    </button>
                </div>
            </div>
        `;
    }

    renderSuggestedSelectors(selectors) {
        if (!selectors || Object.keys(selectors).length === 0) {
            return '<p>Селекторы не найдены</p>';
        }

        const selectorsHTML = Object.entries(selectors).map(([key, selector]) => {
            if (!selector) return '';
            
            return `
                <div class="selector-suggestion">
                    <h4>${this.getSelectorLabel(key)}</h4>
                    <code>${selector.selector}</code>
                    <p>Найдено: ${selector.count} элементов</p>
                    ${selector.samples ? `<small>Примеры: ${selector.samples.join(', ')}</small>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div class="suggested-selectors">
                <h4><i class="fas fa-lightbulb"></i> Предложенные селекторы</h4>
                ${selectorsHTML}
            </div>
        `;
    }

    renderRecommendations(recommendations) {
        if (!recommendations || recommendations.length === 0) {
            return '';
        }

        const recsHTML = recommendations.map(rec => {
            const iconClass = rec.type === 'success' ? 'fa-check' : 
                             rec.type === 'warning' ? 'fa-exclamation-triangle' : 
                             rec.type === 'error' ? 'fa-times' : 'fa-info';
            
            return `<li><i class="fas ${iconClass}"></i> ${rec.message}</li>`;
        }).join('');

        return `
            <div class="recommendations">
                <h4><i class="fas fa-clipboard-list"></i> Рекомендации</h4>
                <ul>${recsHTML}</ul>
            </div>
        `;
    }

    applySuggestedSelectors() {
        if (!this.analysisResults || !this.analysisResults.suggestedSelectors) {
            this.showNotification('Нет предложенных селекторов', 'warning');
            return;
        }

        const selectors = this.analysisResults.suggestedSelectors;
        let applied = false;
        
        // Apply main selector
        if (selectors.products && selectors.products.selector) {
            document.getElementById('itemSelector').value = selectors.products.selector;
            applied = true;
        } else if (selectors.articles && selectors.articles.selector) {
            document.getElementById('itemSelector').value = selectors.articles.selector;
            applied = true;
        } else if (selectors.content && selectors.content.selector) {
            document.getElementById('itemSelector').value = selectors.content.selector;
            applied = true;
        } else if (selectors.posts && selectors.posts.selector) {
            document.getElementById('itemSelector').value = selectors.posts.selector;
            applied = true;
        }

        // Apply recommended strategy based on page type
        if (this.analysisResults.pageType) {
            const strategySelect = document.getElementById('strategy');
            
            switch (this.analysisResults.pageType) {
                case 'ecommerce':
                case 'social':
                    // Use smart-puppeteer for dynamic sites
                    strategySelect.value = 'smart-puppeteer';
                    break;
                case 'news':
                case 'blog':
                    // Use cheerio for static content
                    strategySelect.value = 'cheerio';
                    break;
                default:
                    // Auto detection
                    strategySelect.value = '';
            }
            
            this.updateStrategyInfo(strategySelect.value);
            applied = true;
        }

        // Enable smart analysis if high confidence
        if (this.analysisResults.confidence >= 0.7) {
            document.getElementById('enableSmartAnalysis').checked = true;
            applied = true;
        }

        // Apply recommended settings from analysis
        if (this.analysisResults.recommendations) {
            this.analysisResults.recommendations.forEach(rec => {
                if (rec.type === 'spa') {
                    document.getElementById('spa').checked = true;
                    applied = true;
                }
                if (rec.type === 'infinite-scroll') {
                    document.getElementById('infiniteScrolling').checked = true;
                    applied = true;
                }
                if (rec.type === 'delay' && rec.value) {
                    document.getElementById('delay').value = rec.value;
                    applied = true;
                }
                if (rec.type === 'max-pages' && rec.value) {
                    document.getElementById('maxPages').value = rec.value;
                    applied = true;
                }
            });
        }

        // Create XPath selectors if available
        if (selectors.xpath && Array.isArray(selectors.xpath)) {
            // Clear existing XPath selectors
            document.getElementById('xpathSelectors').innerHTML = '';
            
            selectors.xpath.forEach(xpathConfig => {
                this.addXPathSelector();
                const lastItem = document.querySelector('#xpathSelectors .selector-item:last-child');
                lastItem.querySelector('.xpath-input').value = xpathConfig.xpath;
                lastItem.querySelector('.xpath-name').value = xpathConfig.name;
                lastItem.querySelector('.xpath-type').value = xpathConfig.type || 'text';
                if (xpathConfig.attribute) {
                    const typeSelect = lastItem.querySelector('.xpath-type');
                    typeSelect.value = 'attribute';
                    typeSelect.dispatchEvent(new Event('change'));
                    lastItem.querySelector('.xpath-attribute').value = xpathConfig.attribute;
                }
            });
            applied = true;
        }

        // Switch to basic tab to show applied settings
        if (applied) {
            this.switchTab('basic');
            this.showNotification('Настройки из ИИ анализа применены успешно', 'success');
            
            // Log applied settings for debugging
            console.log('Applied AI analysis settings:', {
                mainSelector: document.getElementById('itemSelector').value,
                strategy: document.getElementById('strategy').value,
                spa: document.getElementById('spa').checked,
                smartAnalysis: document.getElementById('enableSmartAnalysis').checked,
                infiniteScrolling: document.getElementById('infiniteScrolling').checked
            });
        } else {
            this.showNotification('Не удалось применить настройки из анализа', 'warning');
        }
    }

    // Preview Functionality
    async runPreview() {
        const formData = this.getFormData();
        if (!formData.url) {
            this.showNotification('Введите URL для превью', 'warning');
            return;
        }

        this.switchTab('preview');
        this.runPreviewAnalysis();
    }

    async runPreviewAnalysis() {
        const formData = this.getFormData();
        if (!formData.url || !formData.itemSelector) {
            this.showNotification('Введите URL и селектор', 'warning');
            return;
        }

        this.showLoading();
        
        try {
            const response = await fetch('/parsing-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, maxItems: 5 })
            });

            const result = await response.json();
            
            if (result.success) {
                this.previewResults = result.preview;
                this.displayPreviewResults(result.preview);
                this.showNotification('Превью готово', 'success');
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            this.showNotification('Ошибка превью: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    displayPreviewResults(preview) {
        const container = document.getElementById('previewResults');
        
        if (!preview.items || preview.items.length === 0) {
            container.innerHTML = `
                <div class="preview-item">
                    <h3>Элементы не найдены</h3>
                    <p>Попробуйте изменить селектор или проверить URL</p>
                </div>
            `;
            return;
        }

        const itemsHTML = preview.items.map((item, index) => {
            const itemData = Object.entries(item).map(([key, value]) => {
                const displayValue = typeof value === 'string' && value.length > 100 ? 
                                  value.substring(0, 100) + '...' : value;
                return `<div><strong>${key}:</strong> ${displayValue}</div>`;
            }).join('');

            return `
                <div class="preview-item">
                    <h4>Элемент ${index + 1}</h4>
                    ${itemData}
                </div>
            `;
        }).join('');

        const structureHTML = this.renderPreviewStructure(preview.structure);
        const recommendationsHTML = this.renderPreviewRecommendations(preview.recommendations);

        container.innerHTML = `
            <div class="preview-summary">
                <h3>Найдено: ${preview.totalFound} элементов</h3>
                <p>Показано первых ${preview.items.length}</p>
            </div>
            
            ${itemsHTML}
            
            ${structureHTML}
            ${recommendationsHTML}
        `;
    }

    renderPreviewStructure(structure) {
        if (!structure || structure.fieldCount === 0) {
            return '';
        }

        const fieldsHTML = structure.fields.map(field => `
            <div class="field-info">
                <strong>${field.name}</strong>
                <span>Типы: ${field.types.join(', ')}</span>
            </div>
        `).join('');

        return `
            <div class="preview-structure">
                <h4><i class="fas fa-sitemap"></i> Структура данных</h4>
                <p>Полей: ${structure.fieldCount}</p>
                ${fieldsHTML}
            </div>
        `;
    }

    renderPreviewRecommendations(recommendations) {
        if (!recommendations || recommendations.length === 0) {
            return '';
        }

        const recsHTML = recommendations.map(rec => {
            const iconClass = rec.type === 'success' ? 'fa-check' : 
                             rec.type === 'warning' ? 'fa-exclamation-triangle' : 
                             rec.type === 'error' ? 'fa-times' : 'fa-info';
            
            return `<li class="log-level-${rec.type}"><i class="fas ${iconClass}"></i> ${rec.message}</li>`;
        }).join('');

        return `
            <div class="preview-recommendations">
                <h4><i class="fas fa-lightbulb"></i> Рекомендации</h4>
                <ul>${recsHTML}</ul>
            </div>
        `;
    }

    // Time Estimation
    async estimateTime() {
        const formData = this.getFormData();
        
        try {
            const response = await fetch('/estimate-time', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();
            
            this.showNotification(
                `Оценочное время: ${result.estimatedTimeFormatted} (${result.strategy})`, 
                'info'
            );
            
        } catch (error) {
            this.showNotification('Ошибка оценки времени: ' + error.message, 'error');
        }
    }

    // XPath Tools
    addXPathSelector() {
        const container = document.getElementById('xpathSelectors');
        const selectorItem = document.createElement('div');
        selectorItem.className = 'selector-item';
        
        selectorItem.innerHTML = `
            <input type="text" placeholder="//div[@class='title']" class="xpath-input">
            <input type="text" placeholder="title" class="xpath-name">
            <select class="xpath-type">
                <option value="text">Текст</option>
                <option value="html">HTML</option>
                <option value="attribute">Атрибут</option>
            </select>
            <input type="text" placeholder="href" class="xpath-attribute" style="display:none;">
            <button type="button" class="btn-icon remove-xpath">
                <i class="fas fa-trash"></i>
            </button>
        `;
        
        container.appendChild(selectorItem);
    }

    showCSSToXPathModal() {
        document.getElementById('cssToXPathModal').classList.add('active');
    }

    async convertCSSToXPath() {
        const cssSelector = document.getElementById('cssInput').value;
        if (!cssSelector) {
            this.showNotification('Введите CSS селектор', 'warning');
            return;
        }

        try {
            const response = await fetch('/convert-css-to-xpath', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cssSelector })
            });

            const result = await response.json();
            
            if (result.success) {
                document.getElementById('xpathOutput').value = result.xpath;
                if (!result.valid) {
                    this.showNotification('XPath сгенерирован, но может содержать ошибки', 'warning');
                }
            } else {
                throw new Error(result.error);
            }
            
        } catch (error) {
            this.showNotification('Ошибка конвертации: ' + error.message, 'error');
        }
    }

    async validateXPathSelectors() {
        const xpathInputs = document.querySelectorAll('.xpath-input');
        let hasErrors = false;

        for (const input of xpathInputs) {
            if (!input.value) continue;

            try {
                const response = await fetch('/validate-xpath', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ xpath: input.value })
                });

                const result = await response.json();
                
                if (!result.valid) {
                    input.style.borderColor = 'var(--error-color)';
                    hasErrors = true;
                } else {
                    input.style.borderColor = 'var(--success-color)';
                }
                
            } catch (error) {
                input.style.borderColor = 'var(--error-color)';
                hasErrors = true;
            }
        }

        if (hasErrors) {
            this.showNotification('Найдены ошибки в XPath селекторах', 'error');
        } else {
            this.showNotification('Все XPath селекторы валидны', 'success');
        }
    }

    // Main Parsing Function
    async handleParsing(e) {
        e.preventDefault();
        
        if (this.isLoading) {
            this.showNotification('Парсинг уже выполняется', 'warning');
            return;
        }

        const formData = this.getFormData();
        
        if (!this.validateFormData(formData)) {
            return;
        }

        this.isLoading = true;
        this.showLoading();
        this.switchTab('monitor');
        this.resetMonitoring();

        try {
            const response = await fetch('/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Ошибка при парсинге');
            }

            // Download file
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `parsed-data.${formData.fileExtension}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            this.showNotification('Парсинг завершен успешно!', 'success');
            this.updateMonitoringStats('success');

        } catch (error) {
            this.showNotification('Ошибка парсинга: ' + error.message, 'error');
            this.updateMonitoringStats('error');
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }

    getFormData() {
        // Get XPath selectors
        const xpathSelectors = [];
        document.querySelectorAll('#xpathSelectors .selector-item').forEach(item => {
            const xpath = item.querySelector('.xpath-input').value;
            const name = item.querySelector('.xpath-name').value;
            const type = item.querySelector('.xpath-type').value;
            const attribute = item.querySelector('.xpath-attribute').value;

            if (xpath && name) {
                const selector = { xpath, name, type };
                if (type === 'attribute' && attribute) {
                    selector.attribute = attribute;
                }
                xpathSelectors.push(selector);
            }
        });

        // Get pagination config
        const paginationType = document.getElementById('paginationType').value;
        const paginationConfig = {};

        if (paginationType === 'query') {
            paginationConfig.queryParam = document.getElementById('queryParam').value;
        } else if (paginationType === 'path') {
            paginationConfig.pathPrefix = document.getElementById('pathPrefix').value;
        } else if (paginationType === 'button') {
            paginationConfig.nextPageSelector = document.getElementById('nextPageSelector').value;
        } else if (paginationType === 'infinite') {
            paginationConfig.loadMoreSelector = document.getElementById('loadMoreSelector').value;
        }

        return {
            url: document.getElementById('url').value,
            itemSelector: document.getElementById('itemSelector').value,
            strategy: document.getElementById('strategy').value || undefined,
            maxPages: parseInt(document.getElementById('maxPages').value),
            delay: parseInt(document.getElementById('delay').value),
            fileExtension: document.getElementById('fileExtension').value,
            paginationType: paginationType,
            paginationConfig: paginationConfig,
            xpathSelectors: xpathSelectors,
            spa: document.getElementById('spa').checked,
            infiniteScrolling: document.getElementById('infiniteScrolling').checked,
            enableSmartAnalysis: document.getElementById('enableSmartAnalysis').checked,
            waitStrategy: document.getElementById('waitStrategy').value,
            customWaitSelector: document.getElementById('customWaitSelector').value || undefined,
            enableDataValidation: true,
            includeMetadata: true
        };
    }

    validateFormData(formData) {
        if (!formData.url) {
            this.showNotification('Введите URL', 'error');
            return false;
        }

        if (!formData.itemSelector) {
            this.showNotification('Введите селектор элементов', 'error');
            return false;
        }

        if (formData.maxPages < 1 || formData.maxPages > 100) {
            this.showNotification('Количество страниц должно быть от 1 до 100', 'error');
            return false;
        }

        return true;
    }

    // Monitoring
    setupMonitoring() {
        this.monitoringData = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0
        };
    }

    resetMonitoring() {
        this.monitoringData = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0
        };
        this.updateMonitoringDisplay();
        this.updateProgress(0);
        this.clearLogs();
    }

    updateMonitoringStats(type) {
        this.monitoringData.totalRequests++;
        if (type === 'success') {
            this.monitoringData.successfulRequests++;
        } else if (type === 'error') {
            this.monitoringData.failedRequests++;
        }
        this.updateMonitoringDisplay();
    }

    updateMonitoringDisplay() {
        document.getElementById('totalRequests').textContent = this.monitoringData.totalRequests;
        document.getElementById('successfulRequests').textContent = this.monitoringData.successfulRequests;
        document.getElementById('failedRequests').textContent = this.monitoringData.failedRequests;
    }

    updateProgress(percentage) {
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.getElementById('progressText');
        
        progressFill.style.width = percentage + '%';
        progressText.textContent = Math.round(percentage) + '%';
    }

    addLog(message, level = 'info') {
        const logsContainer = document.getElementById('logsContainer');
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        
        const time = new Date().toLocaleTimeString();
        logEntry.innerHTML = `
            <span class="log-time">${time}</span>
            <span class="log-level-${level}">[${level.toUpperCase()}]</span>
            ${message}
        `;
        
        logsContainer.appendChild(logEntry);
        logsContainer.scrollTop = logsContainer.scrollHeight;
    }

    clearLogs() {
        document.getElementById('logsContainer').innerHTML = '';
    }

    // Tool Functions
    async testSelector() {
        const selector = document.getElementById('itemSelector').value;
        const url = document.getElementById('url').value;

        if (!selector || !url) {
            this.showNotification('Введите URL и селектор для тестирования', 'warning');
            return;
        }

        // Use preview functionality for testing
        this.runPreview();
    }

    generateSchema() {
        if (!this.previewResults || !this.previewResults.items) {
            this.showNotification('Сначала запустите превью для генерации схемы', 'warning');
            return;
        }

        // Generate basic schema from preview data
        const schema = {};
        const items = this.previewResults.items;

        if (items.length > 0) {
            const sampleItem = items[0];
            Object.keys(sampleItem).forEach(key => {
                const value = sampleItem[key];
                schema[key] = {
                    type: this.inferFieldType(value),
                    required: false
                };
            });
        }

        // Download schema
        const schemaBlob = new Blob([JSON.stringify(schema, null, 2)], { 
            type: 'application/json' 
        });
        const url = window.URL.createObjectURL(schemaBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'validation-schema.json';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        this.showNotification('Схема валидации сгенерирована', 'success');
    }

    exportConfig() {
        const config = this.getFormData();
        const configBlob = new Blob([JSON.stringify(config, null, 2)], { 
            type: 'application/json' 
        });
        const url = window.URL.createObjectURL(configBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'parser-config.json';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        this.showNotification('Конфигурация экспортирована', 'success');
    }

    importConfig() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const config = JSON.parse(e.target.result);
                    this.loadConfig(config);
                    this.showNotification('Конфигурация загружена', 'success');
                } catch (error) {
                    this.showNotification('Ошибка загрузки конфигурации: ' + error.message, 'error');
                }
            };
            reader.readAsText(file);
        };
        
        input.click();
    }

    loadConfig(config) {
        // Load basic settings
        if (config.url) document.getElementById('url').value = config.url;
        if (config.itemSelector) document.getElementById('itemSelector').value = config.itemSelector;
        if (config.strategy) document.getElementById('strategy').value = config.strategy;
        if (config.maxPages) document.getElementById('maxPages').value = config.maxPages;
        if (config.delay) document.getElementById('delay').value = config.delay;
        if (config.fileExtension) document.getElementById('fileExtension').value = config.fileExtension;

        // Load advanced settings
        if (config.paginationType) {
            document.getElementById('paginationType').value = config.paginationType;
            this.updatePaginationConfig(config.paginationType);
        }

        // Load checkboxes
        if (config.spa !== undefined) document.getElementById('spa').checked = config.spa;
        if (config.infiniteScrolling !== undefined) document.getElementById('infiniteScrolling').checked = config.infiniteScrolling;
        if (config.enableSmartAnalysis !== undefined) document.getElementById('enableSmartAnalysis').checked = config.enableSmartAnalysis;

        // Load XPath selectors
        if (config.xpathSelectors && config.xpathSelectors.length > 0) {
            // Clear existing selectors
            document.getElementById('xpathSelectors').innerHTML = '';
            
            // Add loaded selectors
            config.xpathSelectors.forEach(selector => {
                this.addXPathSelector();
                const lastItem = document.querySelector('#xpathSelectors .selector-item:last-child');
                lastItem.querySelector('.xpath-input').value = selector.xpath;
                lastItem.querySelector('.xpath-name').value = selector.name;
                lastItem.querySelector('.xpath-type').value = selector.type;
                if (selector.attribute) {
                    lastItem.querySelector('.xpath-attribute').value = selector.attribute;
                }
            });
        }
    }

    // Utility Functions
    inferFieldType(value) {
        if (value === null || value === undefined) return 'text';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'string') {
            if (value.match(/^https?:\/\//)) return 'url';
            if (value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return 'email';
            if (value.includes('<') && value.includes('>')) return 'html';
            return 'text';
        }
        return 'text';
    }

    getPageTypeLabel(type) {
        const labels = {
            'ecommerce': 'Электронная коммерция',
            'news': 'Новостной сайт',
            'blog': 'Блог',
            'social': 'Социальная сеть',
            'forum': 'Форум',
            'general': 'Общий'
        };
        return labels[type] || type;
    }

    getSelectorLabel(key) {
        const labels = {
            'products': 'Товары',
            'articles': 'Статьи',
            'posts': 'Посты',
            'titles': 'Заголовки',
            'prices': 'Цены',
            'content': 'Контент',
            'links': 'Ссылки',
            'headings': 'Заголовки'
        };
        return labels[key] || key;
    }

    // UI Utilities
    showLoading() {
        document.getElementById('loadingOverlay').classList.add('active');
    }

    hideLoading() {
        document.getElementById('loadingOverlay').classList.remove('active');
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notifications');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        notification.innerHTML = `
            ${message}
            <button class="notification-close">&times;</button>
        `;
        
        container.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
        
        // Manual close
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.parentNode.removeChild(notification);
        });
    }
}

// Initialize the application
let parserUI;
document.addEventListener('DOMContentLoaded', () => {
    parserUI = new ParserUI();
}); 