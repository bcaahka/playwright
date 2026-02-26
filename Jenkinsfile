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
                sh 'npm ci'
            }
        }

        stage('Install Playwright Browsers') {
            steps {
                echo '🌐 Установка браузеров Playwright...'
                sh 'npx playwright install --with-deps chromium webkit'
            }
        }

        stage('Run Tests') {
            steps {
                echo '🚀 Запуск E2E тестов...'
                sh 'npx playwright test --workers=1'
            }
        }
    }

    post {
        always {
            echo '📁 Сохранение отчетов...'
            archiveArtifacts artifacts: 'playwright-report/**/*', allowEmptyArchive: true

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
