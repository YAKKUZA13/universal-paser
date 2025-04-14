const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function checkChrome() {
    const chromePaths = {
        win32: [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
        ],
        linux: [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable'
        ],
        darwin: [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        ]
    };

    const platform = process.platform;
    const paths = chromePaths[platform] || [];

    for (const chromePath of paths) {
        if (fs.existsSync(chromePath)) {
            console.log(`Chrome найден: ${chromePath}`);
            return chromePath;
        }
    }

    console.error('Chrome не найден! Пожалуйста, установите Google Chrome.');
    console.error('Скачать Chrome можно здесь: https://www.google.com/chrome/');
    process.exit(1);
}

function installDependencies() {
    try {
        console.log('Установка зависимостей...');
        execSync('npm install', { stdio: 'inherit' });
        console.log('Зависимости успешно установлены!');
    } catch (error) {
        console.error('Ошибка при установке зависимостей:', error.message);
        process.exit(1);
    }
}

function createDirectories() {
    const dirs = ['src/public'];
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Создана директория: ${dir}`);
        }
    });
}

console.log('Начало настройки проекта...');
checkChrome();
createDirectories();
installDependencies();
console.log('Настройка проекта завершена!'); 