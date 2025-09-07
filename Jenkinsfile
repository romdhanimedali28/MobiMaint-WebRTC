pipeline {
    agent any
    
    environment {
        DOCKERHUB_REPO = 'medaliromdhani/webrtc-signaling-server'
        DOCKERHUB_CREDENTIALS = credentials('dockerhub-credentials')
        KUBECONFIG_CREDENTIAL = 'k8s-config'
        BUILD_NUMBER = "${env.BUILD_NUMBER}"
        GIT_COMMIT_SHORT = sh(
            script: "git rev-parse --short HEAD",
            returnStdout: true
        ).trim()
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
                    
                    // Build the Docker image
                    def dockerImage = docker.build("${DOCKERHUB_REPO}:${BUILD_NUMBER}")
                    
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
                    echo "Testing Docker image..."
                    
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
        
        stage('Deploy to Kubernetes') {
            steps {
                script {
                    echo "Deploying to Kubernetes cluster..."
                    
                    withKubeConfig([credentialsId: 'k8s-config']) {
                        // Replace image tag in deployment file
                        sh """
                            # Update deployment with new image tag
                            sed -i 's|medaliromdhani/webrtc-signaling-server:.*|medaliromdhani/webrtc-signaling-server:${BUILD_NUMBER}|g' k8s/deployment.yaml
                            
                            # Apply Kubernetes manifests
                            kubectl apply -f k8s/
                            
                            # Wait for deployment to complete
                            kubectl rollout status deployment/webrtc-signaling-server -n default --timeout=300s
                            
                            echo "✅ Deployment completed successfully!"
                        """
                    }
                }
            }
        }
        
        stage('Verify Deployment') {
            steps {
                script {
                    echo "Verifying deployment..."
                    
                    withKubeConfig([credentialsId: 'k8s-config']) {
                        sh """
                            echo "=== Deployment Status ==="
                            kubectl get deployment webrtc-signaling-server -o wide
                            
                            echo "=== Pod Status ==="
                            kubectl get pods -l app=webrtc-signaling-server -o wide
                            
                            echo "=== Service Status ==="
                            kubectl get service webrtc-signaling-service -o wide
                            
                            echo "=== Recent Pod Logs ==="
                            kubectl logs -l app=webrtc-signaling-server --tail=10
                        """
                        
                        // Get external IP if available
                        script {
                            try {
                                def serviceIP = sh(
                                    script: "kubectl get service webrtc-signaling-service -o jsonpath='{.status.loadBalancer.ingress[0].ip}'",
                                    returnStdout: true
                                ).trim()
                                
                                if (serviceIP && serviceIP != "") {
                                    echo "🌐 Application available at: http://${serviceIP}:80"
                                } else {
                                    echo "📋 Service is running but external IP not yet assigned"
                                }
                            } catch (Exception e) {
                                echo "📋 External IP check skipped"
                            }
                        }
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
        }
        
        failure {
            echo "❌ Pipeline failed!"
            echo "Check the logs above for error details"
        }
        
        always {
            script {
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