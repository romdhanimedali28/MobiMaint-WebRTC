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

        stage('Setup SSH Tunnel to K8s Cluster') {
            steps {
                script {
                    echo "Setting up SSH tunnel to Kubernetes cluster..."
                    withCredentials([sshUserPrivateKey(credentialsId: 'azure-ssh-key', keyFileVariable: 'SSH_KEY')]) {
                        sh '''
                            # Kill any existing tunnel
                            pkill -f "ssh.*6443:10.0.1.10:6443" || true
                            
                            # Start SSH tunnel in background
                            ssh -i $SSH_KEY -f -N -L 6443:10.0.1.10:6443 \
                                -o StrictHostKeyChecking=no \
                                azureuser@172.192.57.220
                            
                            # Wait for tunnel to be established
                            sleep 5
                            
                            # Verify tunnel is working
                            netstat -tuln | grep 6443 || echo "Tunnel setup verification"
                        '''
                    }
                }
            }
        }
        
        stage('Prepare Kubeconfig for Local Access') {
            steps {
                script {
                    echo "Preparing kubeconfig for local access through SSH tunnel..."
                    withCredentials([file(credentialsId: 'k8s_config', variable: 'KUBECONFIG_FILE')]) {
                        sh '''
                            # Create a modified kubeconfig that uses localhost
                            cp "$KUBECONFIG_FILE" ./kubeconfig-local.yml
                            
                            # Replace the server URL to use localhost (SSH tunnel)
                            sed -i 's|https://10.0.1.10:6443|https://localhost:6443|g' ./kubeconfig-local.yml
                            
                            # Verify the modification
                            grep "server:" ./kubeconfig-local.yml
                            
                            # Set the kubeconfig environment variable
                            export KUBECONFIG="$(pwd)/kubeconfig-local.yml"
                            
                            # Test connection
                            kubectl version --client
                        '''
                    }
                }
            }
        }
        
        stage('Deploy to Kubernetes') {
            steps {
                script {
                    echo "Deploying to Kubernetes cluster..."
                    sh """
                        export KUBECONFIG="\$(pwd)/kubeconfig-local.yml"
                        
                        echo "Testing connection to cluster..."
                        kubectl get nodes
                        
                        echo "Applying Kubernetes manifests..."
                        kubectl apply -f external-k8s-manifests/kubernetes/manifests/webrtc-signaling/
                        
                        echo "Waiting for deployment to complete..."
                        kubectl rollout status deployment/webrtc-signaling-server -n default --timeout=300s
                        
                        echo "✅ Deployment completed successfully!"
                    """
                }
            }
        }
        
        stage('Verify Deployment') {
            steps {
                script {
                    echo "Verifying deployment..."
                    sh '''
                        export KUBECONFIG="$(pwd)/kubeconfig-local.yml"
                        
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