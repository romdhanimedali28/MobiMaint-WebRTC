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
            echo "Testing Docker image..."
            
            // Test that the container starts and health check passes
            sh """
                set -e
                echo "Starting container for testing..."
                
                # Start container with better error handling
                CONTAINER_ID=\$(docker run -d --name test-container-${BUILD_NUMBER} \
                    -p 3001:3000 \
                    ${DOCKERHUB_REPO}:${BUILD_NUMBER})
                
                echo "Container ID: \$CONTAINER_ID"
                echo "Waiting for container to be ready..."
                sleep 15
                
                # Check if container is still running
                if ! docker ps --format "table {{.Names}}" | grep -q "test-container-${BUILD_NUMBER}"; then
                    echo "❌ Container stopped unexpectedly. Checking logs..."
                    docker logs test-container-${BUILD_NUMBER} || true
                    docker rm test-container-${BUILD_NUMBER} || true
                    exit 1
                fi
                
                echo "Container is running. Testing health endpoint..."
                
                # Test health endpoint with retry
                for i in {1..5}; do
                    echo "Health check attempt \$i..."
                    if docker exec test-container-${BUILD_NUMBER} wget --spider -q http://localhost:3000/health; then
                        echo "✅ Health check passed!"
                        break
                    else
                        if [ \$i -eq 5 ]; then
                            echo "❌ Health check failed after 5 attempts"
                            docker logs test-container-${BUILD_NUMBER}
                            exit 1
                        fi
                        echo "Health check failed, retrying in 5 seconds..."
                        sleep 5
                    fi
                done
            """
        }
    }
    post {
        always {
            script {
                // Clean up test container regardless of success/failure
                sh """
                    echo "Cleaning up test container..."
                    docker stop test-container-${BUILD_NUMBER} || true
                    docker rm test-container-${BUILD_NUMBER} || true
                """
            }
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