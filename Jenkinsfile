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
                        def npmAuditJson = readFile('npm-audit-results.json')
                        def npmAudit = readJSON text: npmAuditJson
                        def vulnCount = npmAudit.metadata.vulnerabilities.total ?: 0
                        npmVulns = "${vulnCount} vulnerabilities found (moderate or higher)"
                    }
                    
                    // OWASP Dependency Check
                    sh '''
                        echo "Running OWASP Dependency Check..."
                        
                        # Download OWASP Dependency Check if not exists
                        if [ ! -d "/opt/dependency-check" ]; then
                            echo "Installing OWASP Dependency Check..."
                            sudo mkdir -p /opt/dependency-check
                            cd /opt/dependency-check
                            sudo wget https://github.com/jeremylong/DependencyCheck/releases/download/v8.4.0/dependency-check-8.4.0-release.zip
                            sudo unzip dependency-check-8.4.0-release.zip
                            sudo chmod +x dependency-check/bin/dependency-check.sh
                        fi
                        
                        # Run OWASP Dependency Check
                        /opt/dependency-check/dependency-check/bin/dependency-check.sh \
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
                        def depCheckJson = readFile('dependency-check-report/dependency-check-report.json')
                        def depCheck = readJSON text: depCheckJson
                        def vulnCount = depCheck.dependencies?.sum { it.vulnerabilities?.size() ?: 0 } ?: 0
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
                    
                    // Install Trivy if not exists
                    sh '''
                        if ! command -v trivy &> /dev/null; then
                            echo "Installing Trivy..."
                            sudo apt-get update
                            sudo apt-get install -y wget apt-transport-https gnupg lsb-release
                            wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | sudo apt-key add -
                            echo "deb https://aquasecurity.github.io/trivy-repo/deb $(lsb_release -sc) main" | sudo tee -a /etc/apt/sources.list.d/trivy.list
                            sudo apt-get update
                            sudo apt-get install -y trivy
                        fi
                    '''
                    
                    // Scan with Trivy
                    def highVulns = "0"
                    sh """
                        echo "Running Trivy security scan on ${DOCKERHUB_REPO}:${BUILD_NUMBER}..."
                        
                        # Scan and generate reports
                        trivy image --format json --output trivy-report.json ${DOCKERHUB_REPO}:${BUILD_NUMBER} || true
                        trivy image --format table ${DOCKERHUB_REPO}:${BUILD_NUMBER} || true
                        
                        # Check for HIGH and CRITICAL vulnerabilities
                        if [ -f trivy-report.json ]; then
                            HIGH_VULNS=\$(cat trivy-report.json | jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH" or .Severity == "CRITICAL")] | length' || echo "0")
                            echo "Found \$HIGH_VULNS high/critical vulnerabilities"
                            
                            # Warning if many critical vulnerabilities (don't fail build)
                            if [ "\$HIGH_VULNS" -gt 10 ]; then
                                echo "⚠️ Warning: Found \$HIGH_VULNS high/critical vulnerabilities"
                                echo "Consider updating base image or dependencies"
                            fi
                        fi
                    """
                    if (fileExists('trivy-report.json')) {
                        def trivyJson = readFile('trivy-report.json')
                        highVulns = sh(script: "cat trivy-report.json | jq '[.Results[]?.Vulnerabilities[]? | select(.Severity == \"HIGH\" or .Severity == \"CRITICAL\")] | length' || echo '0'", returnStdout: true).trim()
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
                            [title: 'Docker Images', value: "• ${DOCKERHUB_REPO}:${BUILD_NUMBER}\n• ${DOCKERHUB_REPO}:latest\n• ${DOCKERHUB_REPO}:${env.GIT_COMMIT_SHORT}", short: false],
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
                
                // Install jq if not available
                sh '''
                    if ! command -v jq &> /dev/null; then
                        echo "Installing jq..."
                        sudo apt-get update && sudo apt-get install -y jq
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
                            https://hub.docker.com/v2/users/login/ | jq -r .token)
                        
                        if [ "\$TOKEN" != "null" ] && [ -n "\$TOKEN" ]; then
                            echo "✅ Successfully authenticated with DockerHub"
                            
                            # Get all tags sorted by date (newest first)
                            echo "Fetching repository tags..."
                            TAGS_JSON=\$(curl -s -H "Authorization: JWT \$TOKEN" \
                                "https://hub.docker.com/v2/repositories/\$REPO/tags/?page_size=100")
                            
                            # Get tags to delete (older than KEEP_LAST, excluding 'latest')
                            TAGS_TO_DELETE=\$(echo "\$TAGS_JSON" | jq -r --arg keep "\$KEEP_LAST" \
                                '.results | sort_by(.last_updated) | reverse | .[(\$keep|tonumber):] | .[] | select(.name != "latest") | .name')
                            
                            if [ -n "\$TAGS_TO_DELETE" ]; then
                                echo "Tags to delete:"
                                echo "\$TAGS_TO_DELETE"
                                
                                # Delete old tags
                                for tag in \$TAGS_TO_DELETE; do
                                    echo "Deleting tag: \$tag"
                                    DELETE_RESPONSE=\$(curl -s -w "%{http_code}" -X DELETE \
                                        -H "Authorization: JWT \$TOKEN" \
                                        "https://hub.docker.com/v2/repositories/\$REPO/tags/\$tag/")
                                    
                                    if [[ "\$DELETE_RESPONSE" == *"204"* ]]; then
                                        echo "✅ Successfully deleted \$tag"
                                    else
                                        echo "⚠️ Failed to delete \$tag (HTTP code: \$DELETE_RESPONSE)"
                                    fi
                                done
                                
                                echo "✅ DockerHub cleanup completed - keeping last \$KEEP_LAST images"
                            else
                                echo "No old images to delete (total images <= \$KEEP_LAST)"
                            fi
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