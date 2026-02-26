pipeline {
    // Запускаем тесты напрямую на сервере Jenkins
    agent any 

    // Загружаем NodeJS, который мы настроили в Jenkins Tools
    tools {
        nodejs 'NodeJS' 
    }

    environment {
        // Флаг CI сообщает Playwright, что нужно работать в фоновом режиме (headless: true)
        CI = 'true'
        // Забираем пароль от тестового аккаунта из секретов Jenkins
        TEST_USER_PASSWORD = credentials('bynex-test-password')
    }

    stages {
        stage('Install Dependencies') {
            steps {
                echo '📦 Установка NPM зависимостей...'
                sh 'npm ci'
            }
        }

        stage('Install Playwright Browsers') {
            steps {
                echo '🌐 Установка браузеров Playwright (Chrome & Safari)...'
                // Устанавливаем браузеры и их системные зависимости
                sh 'npx playwright install --with-deps chromium webkit'
            }
        }

        stage('Run Tests') {
            steps {
                echo '🚀 Запуск E2E тестов...'
                // Запускаем тесты в 1 поток для стабильности
                sh 'npx playwright test --workers=1'
            }
        }
    }

    post {
        always {
            echo '📁 Сохранение отчетов...'
            // 1. Сохраняем папку с отчетом как артефакт (чтобы скачивать ZIP)
            archiveArtifacts artifacts: 'playwright-report/**/*', allowEmptyArchive: true

            // 2. Публикуем красивый HTML отчет прямо в интерфейсе Jenkins (HTML Publisher Plugin)
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
            echo '❌ Тесты упали. Проверьте Playwright Report для деталей.'
        }
    }
}
