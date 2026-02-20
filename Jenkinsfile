pipeline {
    // Запускаем напрямую на сервере Jenkins (без Docker)
    agent any 

    // Говорим Jenkins использовать Node.js (нужно будет настроить плагин на Шаге 2)
    tools {
        nodejs 'NodeJS' // Имя должно совпадать с настройками в Jenkins
    }

    environment {
        // Флаг CI, чтобы Playwright понимал, что он на сервере (запуск в headless, без UI)
        CI = 'true'
        // Секретный пароль из хранилища Jenkins
        TEST_USER_PASSWORD = credentials('bynex-test-password')
    }

    stages {
        stage('Install Dependencies') {
            steps {
                echo '📦 Установка NPM зависимостей...'
                // npm ci работает быстрее и надежнее, чем npm install, так как строго следует package-lock.json
                sh 'npm ci'
            }
        }

        stage('Install Playwright Browsers') {
            steps {
                echo '🌐 Установка браузеров Playwright...'
                // Устанавливаем ТОЛЬКО Chromium (т.к. у нас Mobile Chrome) и системные зависимости (--with-deps)
                // Это сэкономит кучу времени и места на сервере
                sh 'npx playwright install --with-deps chromium'
            }
        }

        stage('Run Tests') {
            steps {
                echo '🚀 Запуск E2E тестов...'
                // Запускаем тесты с 1 воркером для стабильности
                sh 'npx playwright test --workers=1'
            }
        }
    }

    post {
        always {
            echo '📁 Сохранение отчетов...'
            // 1. Сохраняем папку как артефакт (можно будет скачать zip-архив)
            archiveArtifacts artifacts: 'playwright-report/**/*', allowEmptyArchive: true

            // 2. Генерируем HTML вкладку прямо в Jenkins
            publishHTML([
                allowMissing: false,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'playwright-report',
                reportFiles: 'index.html',
                reportName: 'Playwright Report',
                reportTitles: 'E2E Test Results'
            ])
        }
        success {
            echo '✅ Тесты прошли успешно!'
        }
        failure {
            echo '❌ Тесты упали. Смотри отчет Playwright Report.'
        }
    }
}
