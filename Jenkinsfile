pipeline {
    agent any

    tools {
        nodejs 'NodeJS'
    }

    environment {
        CI = 'true'
        TEST_USER_PASSWORD = credentials('bynex-test-password')
    }

    stages {
        stage('Install Dependencies') {
            steps {
                echo 'Installing npm dependencies...'
                sh 'npm ci'
            }
        }

        stage('Install Playwright Browsers') {
            steps {
                echo 'Installing Playwright browsers (Chromium and WebKit)...'
                sh 'npx playwright install --with-deps chromium webkit'
            }
        }

        stage('Clean Previous Reports') {
            steps {
                echo 'Cleaning previous reports...'
                sh 'rm -rf playwright-report blob-report-chromium blob-report-safari blob-report-android merged-blob-report'
            }
        }

        stage('Run Chromium Tests') {
            steps {
                echo 'Running Playwright tests for Mobile Chrome...'
                catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                    sh 'PLAYWRIGHT_BLOB_OUTPUT_DIR=blob-report-chromium npx playwright test --project="Mobile Chrome" --workers=1 --reporter=blob'
                }
            }
        }

        stage('Run Safari Tests') {
            steps {
                echo 'Running Playwright tests for Mobile Safari...'
                catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                    sh 'PLAYWRIGHT_BLOB_OUTPUT_DIR=blob-report-safari npx playwright test --project="Mobile Safari" --workers=1 --reporter=blob'
                }
            }
        }

        stage('Run Android APK Tests') {
            steps {
                echo 'Running Playwright tests for Android APK...'
                catchError(buildResult: 'FAILURE', stageResult: 'FAILURE') {
                    sh 'PLAYWRIGHT_BLOB_OUTPUT_DIR=blob-report-android npx playwright test --project="Android APK" --workers=1 --reporter=blob'
                }
            }
        }

        stage('Merge Playwright Reports') {
            steps {
                echo 'Merging Playwright reports...'
                sh 'mkdir -p merged-blob-report'
                sh 'cp -r blob-report-chromium/* merged-blob-report/ || true'
                sh 'cp -r blob-report-safari/* merged-blob-report/ || true'
                sh 'cp -r blob-report-android/* merged-blob-report/ || true'
                sh 'PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report npx playwright merge-reports --reporter html merged-blob-report'
            }
        }
    }

    post {
        always {
            echo 'Archiving reports...'
            archiveArtifacts artifacts: 'playwright-report/**/*', allowEmptyArchive: true
            publishHTML([
                allowMissing: true,
                alwaysLinkToLastBuild: true,
                keepAll: true,
                reportDir: 'playwright-report',
                reportFiles: 'index.html',
                reportName: 'Playwright Report',
                reportTitles: 'E2E Test Results'
            ])
        }
        success {
            echo 'Tests completed successfully.'
        }
        failure {
            echo 'Some tests failed. Check the Playwright report for details.'
        }
    }
}
