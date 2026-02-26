pipeline {
    agent any 

    tools {
        nodejs 'NodeJS' 
    }

    environment {
        // Говорим Playwright, что он запускается на сервере
        CI = 'true'
        // Забираем пароль от тестов из хранилища Jenkins
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
                // Устанавливаем Chromium и Safari (webkit) с системными зависимостями
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
            // 1. Сохраняем папку с отчетом как артефакт (чтобы скачать ZIP)
            archiveArtifacts artifacts: 'playwright-report/**/*', allowEmptyArchive: true

            // 2. Генерируем красивую HTML вкладку прямо в интерфейсе Jenkins
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
            echo '✅ Тесты прошли успешно! Отправляем уведомление в Telegram...'
            withCredentials([
                string(credentialsId: 'telegram-bot-token', variable: 'BOT_TOKEN'),
                string(credentialsId: 'telegram-chat-id', variable: 'CHAT_ID')
            ]) {
                // Используем JSON для 100% гарантии, что HTML-ссылка отрендерится в Телеграме
                sh """
                curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
                -H "Content-Type: application/json" \
                -d '{
                  "chat_id": "${CHAT_ID}",
                  "parse_mode": "HTML",
                  "text": "✅ <b>Smoke Tests PASSED</b>\\n\\n🌐 Проект: ByNex\\n🕒 Сборка: #${BUILD_NUMBER}\\n📊 <a href=\\"${BUILD_URL}Playwright_20Report/\\">Посмотреть отчет в Jenkins</a>"
                }'
                """
            }
        }
        failure {
            echo '❌ Тесты упали! Отправляем уведомление в Telegram...'
            withCredentials([
                string(credentialsId: 'telegram-bot-token', variable: 'BOT_TOKEN'),
                string(credentialsId: 'telegram-chat-id', variable: 'CHAT_ID')
            ]) {
                sh """
                curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
                -H "Content-Type: application/json" \
                -d '{
                  "chat_id": "${CHAT_ID}",
                  "parse_mode": "HTML",
                  "text": "❌ <b>Smoke Tests FAILED</b>\\n\\n🌐 Проект: ByNex\\n🕒 Сборка: #${BUILD_NUMBER}\\n⚠️ Требуется внимание!\\n📊 <a href=\\"${BUILD_URL}Playwright_20Report/\\">Посмотреть причину падения (Скриншоты и Видео)</a>"
                }'
                """
            }
        }
    }
}