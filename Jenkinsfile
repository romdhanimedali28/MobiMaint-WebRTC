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
        
        // DockerHub cleanup configuration
        KEEP_LAST_IMAGES = '10'
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
        
        stage('Code Security Scanning') {
            steps {
                script {
                    echo "Running code security scans..."
                    
                    // NPM Audit for Node.js projects
                    def npmVulns = "No package.json found"
                    sh '''
                        if [ -f "package.json" ]; then
                            echo "Running npm audit..."
                            npm audit --audit-level moderate || true
                            npm audit --json > npm-audit-results.json || true
                        else
                            echo "No package.json found, skipping npm audit"
                        fi
                    '''
                    if (fileExists('npm-audit-results.json')) {
                        def npmAuditJson = readJSON file: 'npm-audit-results.json'
                        def vulnCount = npmAuditJson.metadata?.vulnerabilities?.total ?: 0
                        npmVulns = "${vulnCount} vulnerabilities found (moderate or higher)"
                    }
                    
                    // OWASP Dependency Check
                    sh '''
                        echo "Running OWASP Dependency Check..."
                        
                        # Create local dependency-check directory if not exists
                        if [ ! -d "./dependency-check" ]; then
                            echo "Installing OWASP Dependency Check locally..."
                            mkdir -p ./dependency-check
                            cd ./dependency-check
                            wget -q https://github.com/jeremylong/DependencyCheck/releases/download/v8.4.0/dependency-check-8.4.0-release.zip
                            unzip -q dependency-check-8.4.0-release.zip
                            chmod +x dependency-check/bin/dependency-check.sh
                            cd ..
                        fi
                        
                        # Run OWASP Dependency Check
                        ./dependency-check/dependency-check/bin/dependency-check.sh \
                            --project "WebRTC-SignalingServer" \
                            --scan . \
                            --format JSON \
                            --format HTML \
                            --out ./dependency-check-report \
                            --prettyPrint || true
                    '''
                    
                    // Parse OWASP Dependency-Check results
                    def depCheckVulns = "No vulnerabilities found"
                    if (fileExists('dependency-check-report/dependency-check-report.json')) {
                        def depCheckJson = readJSON file: 'dependency-check-report/dependency-check-report.json'
                        def vulnCount = depCheckJson.dependencies?.sum { it.vulnerabilities?.size() ?: 0 } ?: 0
                        depCheckVulns = "${vulnCount} vulnerabilities found"
                    }
                    
                    // Archive security reports
                    archiveArtifacts artifacts: 'dependency-check-report/**/*', fingerprint: true, allowEmptyArchive: true
                    archiveArtifacts artifacts: 'npm-audit-results.json', fingerprint: true, allowEmptyArchive: true
                    
                    // Send Slack notification for Code Security Scanning
                    slackSend(
                        botUser: true,
                        tokenCredentialId: 'slack-bot-token',
                        channel: '#jenkins-alerts',
                        message: "🔍 *Code Security Scan Completed*",
                        attachments: [
                            [
                                color: (npmVulns.contains('vulnerabilities found') || depCheckVulns.contains('vulnerabilities found')) ? 'warning' : 'good',
                                title: "${env.JOB_NAME} - Build #${env.BUILD_NUMBER} - Code Security Scan",
                                title_link: "${env.BUILD_URL}",
                                fields: [
                                    [title: 'Stage', value: 'Code Security Scanning', short: true],
                                    [title: 'Git Commit', value: "${env.GIT_COMMIT_SHORT}", short: true],
                                    [title: 'NPM Audit', value: npmVulns, short: false],
                                    [title: 'OWASP Dependency-Check', value: depCheckVulns, short: false],
                                    [title: 'Reports', value: "• [NPM Audit](${env.BUILD_URL}artifact/npm-audit-results.json)\n• [Dependency-Check](${env.BUILD_URL}artifact/dependency-check-report/dependency-check-report.html)", short: false]
                                ],
                                footer: 'Jenkins CI/CD Pipeline with DevSecOps',
                                ts: sh(script: 'date +%s', returnStdout: true).trim()
                            ]
                        ]
                    )
                    
                    echo "✅ Code security scanning completed"
                }
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
        
        stage('Docker Security Scan') {
            steps {
                script {
                    echo "Scanning Docker image for vulnerabilities..."
                    
                    // Check if Trivy is installed, if not download it locally
                    sh '''
                        if ! command -v trivy &> /dev/null; then
                            echo "Installing Trivy locally..."
                            wget -qO trivy.tar.gz https://github.com/aquasecurity/trivy/releases/download/v0.45.0/trivy_0.45.0_Linux-64bit.tar.gz
                            tar -xzf trivy.tar.gz
                            chmod +x trivy
                            TRIVY_CMD="./trivy"
                        else
                            TRIVY_CMD="trivy"
                        fi
                        
                        echo "Running Trivy security scan on ${DOCKERHUB_REPO}:${BUILD_NUMBER}..."
                        
                        # Scan and generate reports
                        $TRIVY_CMD image --format json --output trivy-report.json ${DOCKERHUB_REPO}:${BUILD_NUMBER} || true
                        $TRIVY_CMD image --format table ${DOCKERHUB_REPO}:${BUILD_NUMBER} || true
                        
                        # Check for HIGH and CRITICAL vulnerabilities
                        if [ -f trivy-report.json ]; then
                            HIGH_VULNS=$(grep -o '"Severity":"HIGH"\\|"Severity":"CRITICAL"' trivy-report.json | wc -l || echo "0")
                            echo "Found $HIGH_VULNS high/critical vulnerabilities"
                            
                            # Warning if many critical vulnerabilities (don't fail build)
                            if [ "$HIGH_VULNS" -gt 10 ]; then
                                echo "⚠️ Warning: Found $HIGH_VULNS high/critical vulnerabilities"
                                echo "Consider updating base image or dependencies"
                            fi
                        fi
                    '''
                    
                    // Get vulnerability count for reporting
                    def highVulns = "0"
                    if (fileExists('trivy-report.json')) {
                        highVulns = sh(script: "grep -o '\"Severity\":\"HIGH\"\\|\"Severity\":\"CRITICAL\"' trivy-report.json | wc -l || echo '0'", returnStdout: true).trim()
                    }
                    
                    // Archive scan results
                    archiveArtifacts artifacts: 'trivy-report.json', fingerprint: true, allowEmptyArchive: true
                    
                    // Send Slack notification for Docker Security Scan
                    slackSend(
                        botUser: true,
                        tokenCredentialId: 'slack-bot-token',
                        channel: '#jenkins-alerts',
                        message: "🔍 *Docker Security Scan Completed*",
                        attachments: [
                            [
                                color: (highVulns.toInteger() > 10) ? 'warning' : 'good',
                                title: "${env.JOB_NAME} - Build #${env.BUILD_NUMBER} - Docker Security Scan",
                                title_link: "${env.BUILD_URL}",
                                fields: [
                                    [title: 'Stage', value: 'Docker Security Scan', short: true],
                                    [title: 'Git Commit', value: "${env.GIT_COMMIT_SHORT}", short: true],
                                    [title: 'High/Critical Vulnerabilities', value: "${highVulns} found", short: false],
                                    [title: 'Report', value: "[Trivy Report](${env.BUILD_URL}artifact/trivy-report.json)", short: false],
                                    [title: 'Action', value: highVulns.toInteger() > 10 ? '⚠️ Consider updating base image or dependencies' : 'No action needed', short: false]
                                ],
                                footer: 'Jenkins CI/CD Pipeline with DevSecOps',
                                ts: sh(script: 'date +%s', returnStdout: true).trim()
                            ]
                        ]
                    )
                    
                    echo "✅ Docker security scanning completed"
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
            
            // Slack notification for success using slackSend
            slackSend(
                botUser: true,
                tokenCredentialId: 'slack-bot-token',
                channel: '#jenkins-alerts',
                message: "✅ *BUILD SUCCESSFUL*",
                attachments: [
                    [
                        color: 'good',
                        title: "${env.JOB_NAME} - Build #${env.BUILD_NUMBER}",
                        title_link: "${env.BUILD_URL}",
                        fields: [
                            [title: 'Status', value: '✅ SUCCESS', short: true],
                            [title: 'Duration', value: "${currentBuild.durationString}", short: true],
                            [title: 'Git Commit', value: "${env.GIT_COMMIT_SHORT}", short: true],
                            [title: 'Branch', value: "${env.BRANCH_NAME ?: 'main'}", short: true],
                            [title: 'Docker Images', value: "• ${DOCKERHUB_REPO}:${BUILD_NUMBER}\n• ${DOCKERHUB_REPO}:latest\n• ${DOCKERHUB_REPO}:${GIT_COMMIT_SHORT}", short: false],
                            [title: 'Security', value: '✅ Code & Docker scans completed', short: false],
                            [title: 'Deployment', value: '✅ Successfully deployed to Kubernetes cluster', short: false]
                        ],
                        footer: 'Jenkins CI/CD Pipeline with DevSecOps',
                        ts: sh(script: 'date +%s', returnStdout: true).trim()
                    ]
                ]
            )
        }
       
        failure {
            echo "❌ Pipeline failed!"
            echo "Check the logs above for error details"
            
            // Slack notification for failure using slackSend
            slackSend(
                botUser: true,
                tokenCredentialId: 'slack-bot-token',
                channel: '#jenkins-alerts',
                message: "❌ *BUILD FAILED*",
                attachments: [
                    [
                        color: 'danger',
                        title: "${env.JOB_NAME} - Build #${env.BUILD_NUMBER}",
                        title_link: "${env.BUILD_URL}",
                        fields: [
                            [title: 'Status', value: '❌ FAILED', short: true],
                            [title: 'Duration', value: "${currentBuild.durationString}", short: true],
                            [title: 'Git Commit', value: "${env.GIT_COMMIT_SHORT}", short: true],
                            [title: 'Failed Stage', value: "${env.STAGE_NAME ?: 'Unknown'}", short: true],
                            [title: 'Actions Required', value: '• Check console output\n• Review failed stage logs\n• Fix issues and retry', short: false]
                        ],
                        footer: 'Jenkins CI/CD Pipeline with DevSecOps',
                        ts: sh(script: 'date +%s', returnStdout: true).trim()
                    ]
                ]
            )
        }
       
        unstable {
            echo "⚠️ Pipeline is unstable!"
            
            // Slack notification for unstable build using slackSend
            slackSend(
                botUser: true,
                tokenCredentialId: 'slack-bot-token',
                channel: '#jenkins-alerts',
                message: "⚠️ *BUILD UNSTABLE*",
                attachments: [
                    [
                        color: 'warning',
                        title: "${env.JOB_NAME} - Build #${env.BUILD_NUMBER}",
                        title_link: "${env.BUILD_URL}",
                        fields: [
                            [title: 'Status', value: '⚠️ UNSTABLE', short: true],
                            [title: 'Duration', value: "${currentBuild.durationString}", short: true],
                            [title: 'Git Commit', value: "${env.GIT_COMMIT_SHORT}", short: true],
                            [title: 'Issue', value: 'Build completed but some tests failed or warnings detected', short: false]
                        ],
                        footer: 'Jenkins CI/CD Pipeline with DevSecOps',
                        ts: sh(script: 'date +%s', returnStdout: true).trim()
                    ]
                ]
            )
        }
       
        always {
            script {
                echo "Starting cleanup and DockerHub maintenance..."
                
                // Check if jq is available, if not use basic tools
                sh '''
                    if ! command -v jq &> /dev/null; then
                        echo "jq not available, will use alternative parsing methods"
                    fi
                '''
                
                // DockerHub cleanup - keep last N images
                withCredentials([usernamePassword(credentialsId: 'dockerhub-credentials', usernameVariable: 'DOCKERHUB_USER', passwordVariable: 'DOCKERHUB_PASS')]) {
                    sh """
                        echo "Starting DockerHub cleanup - keeping last ${KEEP_LAST_IMAGES} images..."
                        
                        REPO="${DOCKERHUB_REPO}"
                        KEEP_LAST=${KEEP_LAST_IMAGES}
                        
                        # Get DockerHub token
                        echo "Authenticating with DockerHub..."
                        TOKEN=\$(curl -s -X POST \
                            -H "Content-Type: application/json" \
                            -d "{\\"username\\": \\"\$DOCKERHUB_USER\\", \\"password\\": \\"\$DOCKERHUB_PASS\\"}" \
                            https://hub.docker.com/v2/users/login/ | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
                        
                        if [ -n "\$TOKEN" ] && [ "\$TOKEN" != "null" ]; then
                            echo "✅ Successfully authenticated with DockerHub"
                            
                            # Get all tags (simplified without jq dependency)
                            echo "Fetching repository tags..."
                            TAGS_RESPONSE=\$(curl -s -H "Authorization: JWT \$TOKEN" \
                                "https://hub.docker.com/v2/repositories/\$REPO/tags/?page_size=100")
                            
                            # Simple cleanup: delete tags that match build numbers older than current
                            CURRENT_BUILD=${BUILD_NUMBER}
                            
                            # Delete tags for builds older than (current - KEEP_LAST)
                            if [ \$CURRENT_BUILD -gt \$KEEP_LAST ]; then
                                DELETE_BEFORE=\$((CURRENT_BUILD - KEEP_LAST))
                                echo "Will attempt to delete build tags older than \$DELETE_BEFORE"
                                
                                for i in \$(seq 1 \$DELETE_BEFORE); do
                                    echo "Attempting to delete tag: \$i"
                                    DELETE_RESPONSE=\$(curl -s -w "%{http_code}" -o /dev/null -X DELETE \
                                        -H "Authorization: JWT \$TOKEN" \
                                        "https://hub.docker.com/v2/repositories/\$REPO/tags/\$i/")
                                    
                                    if [ "\$DELETE_RESPONSE" = "204" ]; then
                                        echo "✅ Successfully deleted tag \$i"
                                    else
                                        echo "ℹ️ Tag \$i not found or already deleted"
                                    fi
                                done
                            else
                                echo "Not enough builds to clean up (current: \$CURRENT_BUILD, keep: \$KEEP_LAST)"
                            fi
                            
                            echo "✅ DockerHub cleanup completed"
                        else
                            echo "❌ Failed to authenticate with DockerHub"
                        fi
                    """
                }
                
                // Clean up SSH tunnel
                sh '''
                    echo "Cleaning up SSH tunnel..."
                    pkill -f "ssh.*6443:10.0.1.10:6443" || true
                '''
                
                // Local Docker cleanup
                sh """
                    echo "Cleaning up local Docker images..."
                    docker rmi ${DOCKERHUB_REPO}:${BUILD_NUMBER} || true
                    docker rmi ${DOCKERHUB_REPO}:latest || true
                    docker rmi ${DOCKERHUB_REPO}:${GIT_COMMIT_SHORT} || true
                    
                    # Clean up any test containers
                    docker rm -f test-container-${BUILD_NUMBER} || true
                    
                    # Clean up unused Docker resources
                    docker system prune -f || true
                    
                    echo "✅ Local Docker cleanup completed"
                """
                
                echo "✅ All cleanup operations completed"
            }
            
            // Clean workspace
            cleanWs()
        }
    }
}