// ============================================
// SyncPlay CD Pipeline - Jenkinsfile
// ============================================
// Jenkins runs on the SAME EC2 instance as
// the app, so we deploy LOCALLY (no SSH needed).
//
// HOW IT WORKS:
//   1. Pulls latest images from Docker Hub
//   2. Stops old containers
//   3. Starts new containers
//   4. Checks if everything is healthy
// ============================================

pipeline {
    agent any

    environment {
        DOCKER_HUB_USER = 'tejdeepakchandra'
        SERVER_IMAGE = "${DOCKER_HUB_USER}/syncplay-server:latest"
        CLIENT_IMAGE = "${DOCKER_HUB_USER}/syncplay-client:latest"
        DEPLOY_DIR = '/home/ubuntu/syncplay'
    }

    stages {

        // Stage 1: Check out the code from GitHub
        stage('Checkout') {
            steps {
                echo '📥 Checking out code from GitHub...'
                checkout scm
            }
        }

        // Stage 2: Pull latest Docker images
        stage('Pull Docker Images') {
            steps {
                echo '🐳 Pulling latest Docker images from Docker Hub...'
                sh "docker pull ${SERVER_IMAGE}"
                sh "docker pull ${CLIENT_IMAGE}"
                echo '✅ Images pulled successfully!'
            }
        }

        // Stage 3: Deploy locally (same server)
        stage('Deploy') {
            steps {
                echo '🚀 Deploying containers...'
                sh """
                    cd ${DEPLOY_DIR}
                    docker compose down || true
                    docker compose up -d
                    docker image prune -f
                """
                echo '✅ Containers started!'
            }
        }

        // Stage 4: Health Check
        stage('Health Check') {
            steps {
                echo '🏥 Waiting for containers to start...'
                sleep(time: 15, unit: 'SECONDS')

                echo '🏥 Running health checks...'
                sh '''
                    echo "--- Checking backend health ---"
                    curl -f http://localhost:3001/api/health || exit 1
                    echo ""
                    echo "--- Checking frontend ---"
                    curl -f http://localhost:80 || exit 1
                    echo ""
                    echo "--- Container status ---"
                    docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"
                '''
                echo '✅ All health checks passed!'
            }
        }
    }

    post {
        success {
            echo '🎉 =========================================='
            echo '🎉 SyncPlay deployed successfully!'
            echo '🎉 =========================================='
        }
        failure {
            echo '❌ =========================================='
            echo '❌ Deployment FAILED! Check the logs above.'
            echo '❌ =========================================='
        }
    }
}
