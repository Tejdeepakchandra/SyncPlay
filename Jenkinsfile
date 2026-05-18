// ============================================
// SyncPlay CD Pipeline - Jenkinsfile
// ============================================
// This runs on your Jenkins server (port 9090).
// It pulls the latest Docker images and deploys
// them to your AWS EC2 instance.
//
// HOW IT WORKS:
//   1. Jenkins pulls latest images from Docker Hub
//   2. Connects to EC2 via SSH
//   3. Stops old containers
//   4. Starts new containers
//   5. Checks if everything is healthy
// ============================================

pipeline {
    agent any

    // Environment variables used in the pipeline
    environment {
        DOCKER_HUB_USER = 'tejdeepakchandra'
        SERVER_IMAGE = "${DOCKER_HUB_USER}/syncplay-server:latest"
        CLIENT_IMAGE = "${DOCKER_HUB_USER}/syncplay-client:latest"

        // These are set in Jenkins credentials (Manage Jenkins > Credentials)
        EC2_HOST = credentials('ec2-host')          // Your EC2 public IP
        EC2_USER = credentials('ec2-user')          // Usually 'ubuntu'
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

        // Stage 3: Deploy to EC2
        stage('Deploy to EC2') {
            steps {
                echo '🚀 Deploying to AWS EC2...'

                // Use the SSH key stored in Jenkins credentials
                sshagent(credentials: ['ec2-ssh-key']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_HOST} << 'DEPLOY_SCRIPT'

                        echo '--- Pulling latest images on EC2 ---'
                        docker pull ${SERVER_IMAGE}
                        docker pull ${CLIENT_IMAGE}

                        echo '--- Stopping old containers ---'
                        cd /home/ubuntu/syncplay
                        docker compose down || true

                        echo '--- Starting new containers ---'
                        docker compose up -d

                        echo '--- Cleaning up old images ---'
                        docker image prune -f

                        echo '✅ Deployment complete!'

DEPLOY_SCRIPT
                    """
                }
            }
        }

        // Stage 4: Health Check
        stage('Health Check') {
            steps {
                echo '🏥 Running health checks...'

                // Wait 15 seconds for containers to start
                sleep(time: 15, unit: 'SECONDS')

                sshagent(credentials: ['ec2-ssh-key']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ${EC2_USER}@${EC2_HOST} << 'HEALTH_SCRIPT'

                        echo '--- Checking backend health ---'
                        curl -f http://localhost:3001/api/health || exit 1
                        echo ''

                        echo '--- Checking frontend ---'
                        curl -f http://localhost:80 || exit 1
                        echo ''

                        echo '--- Container status ---'
                        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

                        echo '✅ All health checks passed!'

HEALTH_SCRIPT
                    """
                }
            }
        }
    }

    // What happens after the pipeline finishes
    post {
        success {
            echo '🎉 =========================================='
            echo '🎉 SyncPlay deployed successfully to EC2!'
            echo '🎉 =========================================='
        }
        failure {
            echo '❌ =========================================='
            echo '❌ Deployment FAILED! Check the logs above.'
            echo '❌ =========================================='
        }
        always {
            echo "Pipeline finished at: ${new Date()}"
        }
    }
}
