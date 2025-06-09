module.exports = {
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || 'localhost'
    },
    
    parsing: {
        defaultDelay: 1000,
        defaultMaxPages: 1,
        maxConcurrentRequests: 5,
        timeout: 30000,
        retryAttempts: 3,
        retryDelay: 2000
    },
    
    puppeteer: {
        headless: 'new',
        timeout: 30000,
        executablePath: {
            win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            linux: '/usr/bin/google-chrome',
            darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        }
    },
    
    export: {
        maxFileSize: 50 * 1024 * 1024, // 50MB
        allowedFormats: ['json', 'csv', 'xml'],
        csvOptions: {
            delimiter: ',',
            quote: '"',
            escape: '"'
        }
    },
    
    validation: {
        maxUrlLength: 2048,
        maxSelectorsCount: 50,
        maxPagesLimit: 1000
    }
}; 