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
        stage('Debug Kubernetes Configuration') {
    steps {
        script {
            echo "Debugging Kubernetes configuration file writing..."
            withCredentials([file(credentialsId: 'k8s_config', variable: 'KUBECONFIG_FILE')]) {
                sh '''
                    echo "=== Jenkins Credential File Information ==="
                    echo "KUBECONFIG_FILE path: $KUBECONFIG_FILE"
                    ls -la "$KUBECONFIG_FILE"
                    
                    echo ""
                    echo "=== File Size and Permissions ==="
                    stat "$KUBECONFIG_FILE"
                    
                    echo ""
                    echo "=== File Content Check ==="
                    echo "First 5 lines of the file:"
                    head -5 "$KUBECONFIG_FILE"
                    
                    echo ""
                    echo "=== Private Key Section ==="
                    echo "Looking for client-key-data:"
                    grep -A 2 -B 2 "client-key-data" "$KUBECONFIG_FILE" || echo "No client-key-data found"
                    
                    echo ""
                    echo "=== Testing File Validity ==="
                    export KUBECONFIG="$KUBECONFIG_FILE"
                    kubectl config view --minify || echo "Failed to parse kubeconfig"
                    
                    echo ""
                    echo "=== Copy to workspace for debugging ==="
                    cp "$KUBECONFIG_FILE" ./debug-kubeconfig.yml
                    echo "Copied kubeconfig to workspace as debug-kubeconfig.yml"
                '''
            }
        }
    }
}
        stage('Deploy to Kubernetes') {
            steps {
                script {
                    echo "Deploying to Kubernetes cluster..."
                    withKubeConfig([credentialsId: 'k8s_config']) {
                        sh """
                            # Apply Kubernetes manifests
                            kubectl apply -f external-k8s-manifests/kubernetes/manifests/webrtc-signaling/
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
                    echo "Verifying deployment with kubectl..."
                    withCredentials([file(credentialsId: 'k8s_config', variable: 'KUBECONFIG_FILE')]) {
                        sh '''
                            export KUBECONFIG=$KUBECONFIG_FILE
                            echo "=== Deployment Status ==="
                            kubectl get deployment webrtc-signaling-server -o wide
                            echo "=== Pod Status ==="
                            kubectl get pods -l app=webrtc-signaling-server -o wide
                            echo "=== Service Status ==="
                            kubectl get service webrtc-signaling-service -o wide
                            echo "=== Recent Pod Logs ==="
                            kubectl logs -l app=webrtc-signaling-server --tail=10
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