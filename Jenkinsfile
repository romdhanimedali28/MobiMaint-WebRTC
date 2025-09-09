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

        stage('workspace debug') {
    steps {
        script {
            echo "Deploying to Kubernetes cluster using Ansible..."
            
            // Debug: Show current workspace
            sh '''
                echo "=== WORKSPACE DEBUG ==="
                echo "Current working directory: $(pwd)"
                echo "Workspace contents:"
                ls -la
                echo ""
                
                echo "=== EXTERNAL-K8S-MANIFESTS DEBUG ==="
                if [ -d "external-k8s-manifests" ]; then
                    echo "external-k8s-manifests directory exists"
                    echo "Contents of external-k8s-manifests:"
                    ls -la external-k8s-manifests/
                    echo ""
                    
                    echo "Contents of external-k8s-manifests/kubernetes/:"
                    ls -la external-k8s-manifests/kubernetes/ || echo "kubernetes directory not found"
                    echo ""
                    
                    echo "Contents of external-k8s-manifests/kubernetes/manifests/:"
                    ls -la external-k8s-manifests/kubernetes/manifests/ || echo "manifests directory not found"
                    echo ""
                    
                    echo "Contents of external-k8s-manifests/kubernetes/manifests/webrtc-signaling/:"
                    ls -la external-k8s-manifests/kubernetes/manifests/webrtc-signaling/ || echo "webrtc-signaling directory not found"
                    echo ""
                    
                    echo "Checking for playbook files:"
                    find external-k8s-manifests/ -name "k8s-deploy.yml" -type f || echo "k8s-deploy.yml not found"
                    echo ""
                else
                    echo "ERROR: external-k8s-manifests directory does not exist!"
                    echo "Available directories:"
                    ls -la
                fi
                echo "========================"
            '''
            
            withCredentials([file(credentialsId: 'k8s_config', variable: 'KUBECONFIG_FILE')]) {
                sh '''
                    # Try both possible locations for the playbook
                    if [ -f "external-k8s-manifests/kubernetes/manifests/webrtc-signaling/k8s-deploy.yml" ]; then
                        echo "Using playbook from webrtc-signaling directory"
                        PLAYBOOK_PATH="external-k8s-manifests/kubernetes/manifests/webrtc-signaling/k8s-deploy.yml"
                    elif [ -f "external-k8s-manifests/kubernetes/manifests/k8s-deploy.yml" ]; then
                        echo "Using playbook from manifests directory"
                        PLAYBOOK_PATH="external-k8s-manifests/kubernetes/manifests/k8s-deploy.yml"
                    else
                        echo "ERROR: k8s-deploy.yml not found in either location!"
                        exit 1
                    fi
                    
                    echo "Running ansible-playbook with: $PLAYBOOK_PATH"
                    ansible-playbook -i external-k8s-manifests/ansible/inventory.ini \
                        "$PLAYBOOK_PATH" \
                        -e "KUBECONFIG_CONTENT=$(cat $KUBECONFIG_FILE | python3 -c 'import sys,json; print(json.dumps(sys.stdin.read()))')"
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
                                -e "KUBECONFIG_CONTENT=$(cat $KUBECONFIG_FILE | python -c 'import sys,json; print(json.dumps(sys.stdin.read()))')"
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