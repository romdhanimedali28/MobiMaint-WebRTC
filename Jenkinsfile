pipeline {
    agent any
   
    environment {
        DOCKERHUB_REPO = 'medaliromdhani/webrtc-signaling-server'
        DOCKERHUB_CREDENTIALS = credentials('dockerhub-credentials')
        BUILD_NUMBER = "${env.BUILD_NUMBER}"
        GIT_COMMIT_SHORT = sh(
            script: "git rev-parse --short HEAD",
            returnStdout: true
        ).trim()
        
        // Email configuration
        EMAIL_RECIPIENTS = 'romdhanimohamedali.28@gmail.com'
    }
   
    stages {
        stage('Cleanup Workspace') {
            steps {
                cleanWs()
            }
        }
       
        stage('Checkout Code') {
            steps {
                checkout scm
                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: "git rev-parse --short HEAD",
                        returnStdout: true
                    ).trim()
                }
                echo "Building commit: ${env.GIT_COMMIT_SHORT}"
            }
        }
       
        stage('Build Docker Image') {
            steps {
                script {
                    echo "Building Docker image: ${DOCKERHUB_REPO}:${BUILD_NUMBER}"
                   
                    // Build the Docker image with --network host
                    sh """
                        docker build --network host -t ${DOCKERHUB_REPO}:${BUILD_NUMBER} .
                    """
                   
                    // Tag with additional tags
                    sh "docker tag ${DOCKERHUB_REPO}:${BUILD_NUMBER} ${DOCKERHUB_REPO}:latest"
                    sh "docker tag ${DOCKERHUB_REPO}:${BUILD_NUMBER} ${DOCKERHUB_REPO}:${GIT_COMMIT_SHORT}"
                   
                    echo "✅ Docker image built successfully"
                }
            }
        }
       
        stage('Test Docker Image') {
            steps {
                script {
                    echo "Testing Docker image... "
                   
                    // Test that the container starts and health check passes
                    sh """
                        echo "Starting container for testing..."
                        docker run -d --name test-container-${BUILD_NUMBER} \
                            -p 3001:3000 \
                            ${DOCKERHUB_REPO}:${BUILD_NUMBER}
                       
                        echo "Waiting for container to be ready..."
                        sleep 10
                       
                        echo "Testing health endpoint..."
                        docker exec test-container-${BUILD_NUMBER} wget --spider -q http://localhost:3000/health
                       
                        echo "✅ Health check passed!"
                       
                        echo "Cleaning up test container..."
                        docker stop test-container-${BUILD_NUMBER}
                        docker rm test-container-${BUILD_NUMBER}
                    """
                }
            }
        }
       
        stage('Push to DockerHub') {
            steps {
                script {
                    echo "Logging into DockerHub..."
                   
                    // Login to DockerHub using credentials
                    docker.withRegistry('https://index.docker.io/v1/', 'dockerhub-credentials') {
                        echo "Pushing images to DockerHub..."
                       
                        // Push all tags
                        sh "docker push ${DOCKERHUB_REPO}:${BUILD_NUMBER}"
                        sh "docker push ${DOCKERHUB_REPO}:latest"
                        sh "docker push ${DOCKERHUB_REPO}:${GIT_COMMIT_SHORT}"
                       
                        echo "✅ Successfully pushed to DockerHub:"
                        echo "   - ${DOCKERHUB_REPO}:${BUILD_NUMBER}"
                        echo "   - ${DOCKERHUB_REPO}:latest"
                        echo "   - ${DOCKERHUB_REPO}:${GIT_COMMIT_SHORT}"
                    }
                }
            }
        }
       
        stage('Fetch K8s Manifests') {
            steps {
                script {
                    echo "Cloning external repo for Kubernetes manifests..."
                    withCredentials([sshUserPrivateKey(credentialsId: 'github-ssh-key', keyFileVariable: 'GIT_SSH_KEY')]) {
                        sh '''
                            rm -rf external-k8s-manifests
                            export GIT_SSH_COMMAND="ssh -i $GIT_SSH_KEY -o StrictHostKeyChecking=no"
                            git clone git@github.com:romdhanimedali28/webrtc-k8s-devsecops.git external-k8s-manifests
                        '''
                    }
                }
            }
        }
       
        stage('Deploy to Kubernetes with Ansible') {
            steps {
                script {
                    echo "Deploying to Kubernetes cluster using Ansible..."
                    withCredentials([file(credentialsId: 'k8s_config', variable: 'KUBECONFIG_FILE')]) {
                        sh '''
                            ansible-playbook -i external-k8s-manifests/ansible/inventory.ini \
                                external-k8s-manifests/kubernetes/manifests/k8s-deploy.yml \
                                -e "KUBECONFIG_CONTENT=$(cat $KUBECONFIG_FILE | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')"
                        '''
                    }
                }
            }
        }
       
        stage('Verifying Deploy to Kubernetes with Ansible') {
            steps {
                script {
                    echo "Verifying deployment to Kubernetes cluster using Ansible..."
                    withCredentials([file(credentialsId: 'k8s_config', variable: 'KUBECONFIG_FILE')]) {
                        sh '''
                            ansible-playbook -i external-k8s-manifests/ansible/inventory.ini \
                                external-k8s-manifests/kubernetes/manifests/k8s-verify.yml \
                                -e "KUBECONFIG_CONTENT=$(cat $KUBECONFIG_FILE | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')"
                        '''
                    }
                }
            }
        }
    }
   
    post {
        success {
            echo "🎉 Pipeline completed successfully!"
            echo "🐳 Docker Image: ${DOCKERHUB_REPO}:${BUILD_NUMBER}"
            echo "📋 Build: ${env.BUILD_NUMBER}"
            echo "🔗 Commit: ${env.GIT_COMMIT_SHORT}"
            
            // Slack notification for success using curl (reliable method)
            script {
                withCredentials([string(credentialsId: 'slack-bot-token', variable: 'SLACK_TOKEN')]) {
                    sh """
                    curl -X POST -H 'Authorization: Bearer ${SLACK_TOKEN}' \
                    -H 'Content-type: application/json' \
                    --data '{
                        "channel": "jenkins-alerts",
                        "text": "✅ *BUILD SUCCESSFUL*",
                        "attachments": [
                            {
                                "color": "good",
                                "title": "${env.JOB_NAME} - Build #${env.BUILD_NUMBER}",
                                "title_link": "${env.BUILD_URL}",
                                "fields": [
                                    {
                                        "title": "Status",
                                        "value": "✅ SUCCESS",
                                        "short": true
                                    },
                                    {
                                        "title": "Duration",
                                        "value": "${currentBuild.durationString}",
                                        "short": true
                                    },
                                    {
                                        "title": "Git Commit",
                                        "value": "${env.GIT_COMMIT_SHORT}",
                                        "short": true
                                    },
                                    {
                                        "title": "Branch",
                                        "value": "${env.BRANCH_NAME ?: 'main'}",
                                        "short": true
                                    },
                                    {
                                        "title": "Docker Images",
                                        "value": "• ${DOCKERHUB_REPO}:${BUILD_NUMBER}\\n• ${DOCKERHUB_REPO}:latest\\n• ${DOCKERHUB_REPO}:${env.GIT_COMMIT_SHORT}",
                                        "short": false
                                    },
                                    {
                                        "title": "Deployment",
                                        "value": "✅ Successfully deployed to Kubernetes cluster",
                                        "short": false
                                    }
                                ],
                                "footer": "Jenkins CI/CD Pipeline",
                                "ts": \$(date +%s)
                            }
                        ]
                    }' \
                    https://slack.com/api/chat.postMessage
                    """
                }
            }
           
            // Email notification for success
            emailext (
                subject: "✅ SUCCESS: ${env.JOB_NAME} - Build #${env.BUILD_NUMBER}",
                body: """
                <h2 style="color: green;">Build Successful! 🎉</h2>
               
                <h3>Build Details:</h3>
                <ul>
                    <li><b>Job:</b> ${env.JOB_NAME}</li>
                    <li><b>Build Number:</b> ${env.BUILD_NUMBER}</li>
                    <li><b>Git Commit:</b> ${env.GIT_COMMIT_SHORT}</li>
                    <li><b>Branch:</b> ${env.BRANCH_NAME ?: 'main'}</li>
                    <li><b>Duration:</b> ${currentBuild.durationString}</li>
                    <li><b>Build URL:</b> <a href="${env.BUILD_URL}">${env.BUILD_URL}</a></li>
                </ul>
               
                <h3>Docker Images Pushed:</h3>
                <ul>
                    <li>${DOCKERHUB_REPO}:${BUILD_NUMBER}</li>
                    <li>${DOCKERHUB_REPO}:latest</li>
                    <li>${DOCKERHUB_REPO}:${GIT_COMMIT_SHORT}</li>
                </ul>
               
                <h3>Deployment Status:</h3>
                <p>✅ Successfully deployed to Kubernetes cluster</p>
               
                <p><i>Build completed at: ${new Date()}</i></p>
                """,
                mimeType: 'text/html',
                to: "${EMAIL_RECIPIENTS}"
            )
        }
       
        failure {
            echo "❌ Pipeline failed!"
            echo "Check the logs above for error details"
            
            // Slack notification for failure using curl
            script {
                withCredentials([string(credentialsId: 'slack-bot-token', variable: 'SLACK_TOKEN')]) {
                    sh """
                    curl -X POST -H 'Authorization: Bearer ${SLACK_TOKEN}' \
                    -H 'Content-type: application/json' \
                    --data '{
                        "channel": "jenkins-alerts",
                        "text": "❌ *BUILD FAILED*",
                        "attachments": [
                            {
                                "color": "danger",
                                "title": "${env.JOB_NAME} - Build #${env.BUILD_NUMBER}",
                                "title_link": "${env.BUILD_URL}",
                                "fields": [
                                    {
                                        "title": "Status",
                                        "value": "❌ FAILED",
                                        "short": true
                                    },
                                    {
                                        "title": "Duration",
                                        "value": "${currentBuild.durationString}",
                                        "short": true
                                    },
                                    {
                                        "title": "Git Commit",
                                        "value": "${env.GIT_COMMIT_SHORT}",
                                        "short": true
                                    },
                                    {
                                        "title": "Failed Stage",
                                        "value": "${env.STAGE_NAME ?: 'Unknown'}",
                                        "short": true
                                    },
                                    {
                                        "title": "Actions Required",
                                        "value": "• Check console output\\n• Review failed stage logs\\n• Fix issues and retry",
                                        "short": false
                                    }
                                ],
                                "footer": "Jenkins CI/CD Pipeline",
                                "ts": \$(date +%s)
                            }
                        ]
                    }' \
                    https://slack.com/api/chat.postMessage
                    """
                }
            }
           
            // Email notification for failure
            emailext (
                subject: "❌ FAILED: ${env.JOB_NAME} - Build #${env.BUILD_NUMBER}",
                body: """
                <h2 style="color: red;">Build Failed! ❌</h2>
               
                <h3>Build Details:</h3>
                <ul>
                    <li><b>Job:</b> ${env.JOB_NAME}</li>
                    <li><b>Build Number:</b> ${env.BUILD_NUMBER}</li>
                    <li><b>Git Commit:</b> ${env.GIT_COMMIT_SHORT}</li>
                    <li><b>Duration:</b> ${currentBuild.durationString}</li>
                    <li><b>Failed Stage:</b> ${env.STAGE_NAME ?: 'Unknown'}</li>
                </ul>
               
                <h3>Actions Required:</h3>
                <ul>
                    <li>Check the <a href="${env.BUILD_URL}console">build console output</a></li>
                    <li>Review the failed stage logs</li>
                    <li>Fix the issues and retry the build</li>
                </ul>
               
                <p><i>Build failed at: ${new Date()}</i></p>
                """,
                mimeType: 'text/html',
                to: "${EMAIL_RECIPIENTS}"
            )
        }
       
        unstable {
            echo "⚠️ Pipeline is unstable!"
            
            // Slack notification for unstable build using curl
            script {
                withCredentials([string(credentialsId: 'slack-bot-token', variable: 'SLACK_TOKEN')]) {
                    sh """
                    curl -X POST -H 'Authorization: Bearer ${SLACK_TOKEN}' \
                    -H 'Content-type: application/json' \
                    --data '{
                        "channel": "jenkins-alerts",
                        "text": "⚠️ *BUILD UNSTABLE*",
                        "attachments": [
                            {
                                "color": "warning",
                                "title": "${env.JOB_NAME} - Build #${env.BUILD_NUMBER}",
                                "title_link": "${env.BUILD_URL}",
                                "fields": [
                                    {
                                        "title": "Status",
                                        "value": "⚠️ UNSTABLE",
                                        "short": true
                                    },
                                    {
                                        "title": "Duration",
                                        "value": "${currentBuild.durationString}",
                                        "short": true
                                    },
                                    {
                                        "title": "Git Commit",
                                        "value": "${env.GIT_COMMIT_SHORT}",
                                        "short": true
                                    },
                                    {
                                        "title": "Issue",
                                        "value": "Build completed but some tests failed or warnings detected",
                                        "short": false
                                    }
                                ],
                                "footer": "Jenkins CI/CD Pipeline",
                                "ts": \$(date +%s)
                            }
                        ]
                    }' \
                    https://slack.com/api/chat.postMessage
                    """
                }
            }
        }
       
        always {
            script {
                // Clean up SSH tunnel
                sh '''
                    echo "Cleaning up SSH tunnel..."
                    pkill -f "ssh.*6443:10.0.1.10:6443" || true
                '''
                // Clean up Docker images to save space on Jenkins server
                sh """
                    echo "Cleaning up Docker images..."
                    docker rmi ${DOCKERHUB_REPO}:${BUILD_NUMBER} || true
                    docker rmi ${DOCKERHUB_REPO}:latest || true
                    docker rmi ${DOCKERHUB_REPO}:${GIT_COMMIT_SHORT} || true
                    # Clean up any test containers
                    docker rm -f test-container-${BUILD_NUMBER} || true
                    # Clean up unused Docker resources
                    docker system prune -f || true
                    echo "✅ Cleanup completed"
                """
            }
            cleanWs()
        }
    }
}