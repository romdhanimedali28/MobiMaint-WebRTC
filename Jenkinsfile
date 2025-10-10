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
        SONAR_HOST_URL = 'http://localhost:9000'
        SONAR_TOKEN = credentials('sonarcube-token')
        scannerHome = tool 'SonarQube'
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
        
        stage('Secret Scanning') {
          steps {
            script {
                echo "🔍 Scanning for exposed secrets..."

              def secretsFound = sh(
                script: '''
                    # Ensure jq is installed
                    if ! command -v jq >/dev/null 2>&1; then
                        if command -v apk >/dev/null 2>&1; then
                            apk add --no-cache jq
                        elif command -v apt-get >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
                            apt-get update && apt-get install -y jq
                        else
                            echo "WARNING: jq not installed and cannot be installed."
                        fi
                    fi

                    # Install Gitleaks if not present
                    if ! command -v gitleaks >/dev/null 2>&1; then
                        curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v8.18.0/gitleaks_8.18.0_linux_x64.tar.gz | tar -xz
                        chmod +x gitleaks
                    fi

                    # Run Gitleaks
                    ./gitleaks detect --source . \
                        --report-format json \
                        --report-path gitleaks-report.json \
                        --exit-code 0

                    SECRETS_FOUND=0
                    if [ -f gitleaks-report.json ] && [ -s gitleaks-report.json ]; then
                        if command -v jq >/dev/null 2>&1; then
                            SECRETS_FOUND=$(jq '[.[] | select(.Description != null)] | length' gitleaks-report.json 2>/dev/null || echo "0")
                        else
                            SECRETS_FOUND=$(grep -c '"Description"' gitleaks-report.json 2>/dev/null || echo "0")
                        fi
                    fi

                    echo "Found $SECRETS_FOUND potential secrets"
                    if [ "$SECRETS_FOUND" -gt 0 ]; then
                        echo "ERROR: $SECRETS_FOUND secrets detected. Review report."
                    else
                        echo "✅ No secrets found."
                    fi

                    # Rename report for uniqueness
                    if [ -f gitleaks-report.json ]; then
                        mv gitleaks-report.json gitleaks-report-$BUILD_NUMBER.json
                    fi

                    # Final clean output for Groovy (numeric only)
                    echo "$SECRETS_FOUND" > /tmp/secrets_count.txt
                ''',
                returnStatus: false
            )

            // Read the numeric value safely
            def secretsCount = readFile("/tmp/secrets_count.txt").trim().toInteger()

            // Archive report
            archiveArtifacts artifacts: "gitleaks-report-${env.BUILD_NUMBER}.json",
                fingerprint: true,
                allowEmptyArchive: true

            // Send Slack notification
            slackSend(
                botUser: true,
                tokenCredentialId: 'slack-bot-token',
                channel: '#jenkins-alerts',
                message: "🔐 *Secret Scanning Completed*",
                attachments: [[
                    color: (secretsCount > 0) ? 'danger' : 'good',
                    title: "${env.JOB_NAME} - Build #${env.BUILD_NUMBER}",
                    fields: [
                        [title: 'Secrets Found', value: secretsCount.toString(), short: true],
                        [title: 'Status', value: secretsCount > 0 ? '⚠️ ACTION REQUIRED' : '✅ No secrets detected', short: true],
                        [title: 'Report', value: "[View Report](${env.BUILD_URL}artifact/gitleaks-report-${env.BUILD_NUMBER}.json)", short: false]
                    ]
                ]]
            )

            // Fail build if secrets found
            if (secretsCount > 0) {
                error "❌ Secrets detected! Remove them before proceeding."
            }

            echo "✅ Secret scanning completed successfully with $secretsCount leaks."
                }
            }
}



            stage('SonarQube Analysis') {
                steps {
                    script {
                        echo "Running SonarQube analysis..."
                        withSonarQubeEnv('SonarQube') {
                            sh """
                                npm install
                                npm run test:coverage || true
                                # Run SonarScanner with project-specific parameters
                                ${scannerHome}/bin/sonar-scanner \
                                    -Dsonar.projectKey=webrtc-pipeline \
                                    -Dsonar.projectName=webrtc-pipeline \
                                    -Dsonar.projectVersion=${BUILD_NUMBER} \
                                    -Dsonar.sources=. \
                                    -Dsonar.tests=. \
                                    -Dsonar.language=js \
                                    -Dsonar.sourceEncoding=UTF-8 \
                                    -Dsonar.exclusions=node_modules/**,coverage/** \
                                    -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info \
                                    -Dsonar.gitlab.commit_sha=${GIT_COMMIT_SHORT}
                            """
                        }
                        timeout(time: 10, unit: 'MINUTES') {
                            def qg = waitForQualityGate()
                            if (qg.status != 'OK') {
                                error "Pipeline aborted due to SonarQube quality gate failure: ${qg.status}"
                            }
                        }
                    }
                }
            }



       stage('Code Security Scanning') {
            steps {
               script {
                echo "Running code security scans..."
            
                        // NPM Audit for Node.js projects (keep this part)
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
                        if (fileExists('npm-audit-results.json') && sh(script: '[ -s npm-audit-results.json ]', returnStatus: true) == 0) {
                            def npmContent = readFile('npm-audit-results.json').trim()
                            if (npmContent) {
                                try {
                                    def npmAuditJson = readJSON text: npmContent
                                    def vulnCount = npmAuditJson.metadata?.vulnerabilities?.total ?: 0
                                    npmVulns = "${vulnCount} vulnerabilities found (moderate or higher)"
                                } catch (Exception e) {
                                    echo "Warning: Failed to parse npm-audit-results.json: ${e.message}. Using fallback count."
                                    npmVulns = "Parse error - check report manually"
                                }
                            } else {
                                npmVulns = "0 vulnerabilities (empty report)"
                            }
                        }
                        
                        // REPLACE OWASP SECTION WITH GRYPE
                        sh '''
                            echo "Installing and running Grype vulnerability scanner..."
                            
                            # Install Grype if not available
                            if ! command -v grype &> /dev/null; then
                                echo "Installing Grype..."
                                curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b ./grype-bin
                                export PATH="./grype-bin:$PATH"
                            fi
                            
                            # Scan for vulnerabilities in the current directory
                            echo "Running Grype vulnerability scan..."
                            grype dir:. -o json > grype-report.json 2>/dev/null || true
                            grype dir:. -o table || true
                            
                            echo "✅ Grype vulnerability scan completed"
                        '''
                        
                        // Parse Grype results instead of OWASP results
                        def depCheckVulns = "No vulnerabilities found"
                        if (fileExists('grype-report.json')) {
                            def grypeContent = readFile('grype-report.json').trim()
                            if (grypeContent) {
                                try {
                                    def grypeJson = readJSON text: grypeContent
                                    def vulnCount = grypeJson.matches?.size() ?: 0
                                    def highCriticalCount = grypeJson.matches?.count { match -> 
                                        match.vulnerability?.severity in ['High', 'Critical'] 
                                    } ?: 0
                                    depCheckVulns = "${vulnCount} total vulnerabilities (${highCriticalCount} high/critical)"
                                } catch (Exception e) {
                                    echo "Warning: Failed to parse grype-report.json: ${e.message}. Using fallback count."
                                    def vulnCount = sh(script: "grep -c '\"severity\"' grype-report.json || echo '0'", returnStdout: true).trim()
                                    depCheckVulns = "${vulnCount} vulnerabilities found"
                                }
                            } else {
                                depCheckVulns = "0 vulnerabilities (empty report)"
                            }
                        }
                        
                        // Archive security reports
                        archiveArtifacts artifacts: 'grype-report.json', fingerprint: true, allowEmptyArchive: true
                        archiveArtifacts artifacts: 'npm-audit-results.json', fingerprint: true, allowEmptyArchive: true
                        
                        // Send Slack notification (update report links)
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
                                        [title: 'Grype Scan', value: depCheckVulns, short: false],
                                        [title: 'Reports', value: "• [NPM Audit](${env.BUILD_URL}artifact/npm-audit-results.json)\n• [Grype Report](${env.BUILD_URL}artifact/grype-report.json)", short: false]
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
       


           stage('SBOM Generation') {
              steps {
               script {
            echo "📦 Generating Software Bill of Materials..."
            
            sh '''
                # Install Syft if not present
                if ! command -v syft &> /dev/null; then
                    curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b ./syft-bin
                    export PATH="./syft-bin:$PATH"
                fi
                
                # Generate SBOM in multiple formats
                syft ${DOCKERHUB_REPO}:${BUILD_NUMBER} -o spdx-json > sbom-spdx.json
                syft ${DOCKERHUB_REPO}:${BUILD_NUMBER} -o cyclonedx-json > sbom-cyclonedx.json
                syft ${DOCKERHUB_REPO}:${BUILD_NUMBER} -o table > sbom-readable.txt
                
                # Count components
                COMPONENT_COUNT=$(grep -c '"name"' sbom-spdx.json || echo "0")
                echo "Total components: $COMPONENT_COUNT"
            '''
            
            // Parse component count
            def componentCount = sh(
                script: "grep -c '\"name\"' sbom-spdx.json || echo '0'",
                returnStdout: true
            ).trim()
            
            // Archive SBOM
            archiveArtifacts artifacts: 'sbom-*.json,sbom-readable.txt', 
                fingerprint: true
            
            // Notification
            slackSend(
                botUser: true,
                tokenCredentialId: 'slack-bot-token',
                channel: '#jenkins-alerts',
                message: "📦 *SBOM Generated Successfully*",
                attachments: [[
                    color: 'good',
                    title: "${env.JOB_NAME} - Build #${env.BUILD_NUMBER}",
                    fields: [
                        [title: 'Total Components', value: componentCount, short: true],
                        [title: 'Image', value: "${DOCKERHUB_REPO}:${BUILD_NUMBER}", short: true],
                        [title: 'SBOM Formats', value: 'SPDX, CycloneDX, Human-readable', short: false],
                        [title: 'Downloads', value: "[SPDX](${env.BUILD_URL}artifact/sbom-spdx.json) | [CycloneDX](${env.BUILD_URL}artifact/sbom-cyclonedx.json)", short: false]
                    ]
                ]]
            )
            
            echo "✅ SBOM generation completed - ${componentCount} components catalogued"
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

        stage('Infrastructure Security Scan') {
                steps {
                    script {
                        echo "Scanning Terraform configuration with Checkov..."
                        
                        sh '''

                                    # Install Checkov if not installed
                            if ! command -v checkov &> /dev/null; then
                                echo "Installing Checkov..."
                                pip install --user checkov
                                export PATH=$PATH:/home/jenkins/.local/bin
                            fi 
                            export PATH=$HOME/.local/bin:$PATH
                            cd external-k8s-manifests/terraform
                            # Run Checkov scan
                             checkov -d . --framework terraform --output json > checkov-report.json || true
                            checkov -d . --framework terraform --output cli || true
                

                            echo "✅ Checkov scan completed"
                        '''
                        
                        // Parse Checkov results
                        def criticalCount = "0"
                        def highCount = "0"
                        def totalFailed = "0"
                        
                        if (fileExists('external-k8s-manifests/terraform/checkov-report.json')) {
                            try {
                                criticalCount = sh(
                                    script: "grep -o '\"severity\":\"CRITICAL\"' external-k8s-manifests/terraform/checkov-report.json | wc -l || echo '0'",
                                    returnStdout: true
                                ).trim()
                                
                                highCount = sh(
                                    script: "grep -o '\"severity\":\"HIGH\"' external-k8s-manifests/terraform/checkov-report.json | wc -l || echo '0'",
                                    returnStdout: true
                                ).trim()
                                
                                totalFailed = sh(
                                    script: "grep -o '\"check_result\":{\"result\":\"failed\"' external-k8s-manifests/terraform/checkov-report.json | wc -l || echo '0'",
                                    returnStdout: true
                                ).trim()
                            } catch (Exception e) {
                                echo "Warning: Failed to parse Checkov results: ${e.message}"
                            }
                        }
                        
                        // Archive the report
                        archiveArtifacts artifacts: 'external-k8s-manifests/terraform/checkov-report.json', 
                            fingerprint: true, 
                            allowEmptyArchive: true
                        
                        // Send Slack notification
                        slackSend(
                            botUser: true,
                            tokenCredentialId: 'slack-bot-token',
                            channel: '#jenkins-alerts',
                            message: "🔒 *Infrastructure Security Scan Completed*",
                            attachments: [
                                [
                                    color: (criticalCount.toInteger() > 0) ? 'danger' : ((highCount.toInteger() > 0) ? 'warning' : 'good'),
                                    title: "${env.JOB_NAME} - Build #${env.BUILD_NUMBER} - Terraform Security Scan",
                                    title_link: "${env.BUILD_URL}",
                                    fields: [
                                        [title: 'Stage', value: 'Infrastructure Security Scan', short: true],
                                        [title: 'Tool', value: 'Checkov', short: true],
                                        [title: 'Critical Issues', value: criticalCount, short: true],
                                        [title: 'High Issues', value: highCount, short: true],
                                        [title: 'Total Failed Checks', value: totalFailed, short: true],
                                        [title: 'Git Commit', value: "${env.GIT_COMMIT_SHORT}", short: true],
                                        [title: 'Report', value: "[View Checkov Report](${env.BUILD_URL}artifact/external-k8s-manifests/terraform/checkov-report.json)", short: false]
                                    ],
                                    footer: 'Jenkins CI/CD Pipeline with DevSecOps',
                                    ts: sh(script: 'date +%s', returnStdout: true).trim()
                                ]
                            ]
                        )
                        
                        echo "✅ Infrastructure security scanning completed"
                    }
                }
    }

    stage('K8s Manifest Security') {
            steps {
                script {
                    echo "☸️ Scanning Kubernetes manifests for security issues..."

                    sh '''
                        cd external-k8s-manifests

                        # Run Kubesec analysis
                        echo "Running Kubesec analysis..."
                        docker run --rm -v $(pwd):/project kubesec/kubesec scan /project/overlays/dev/*.yaml \
                            > kubesec-report.json || true

                        # Compute average score
                        if command -v jq &> /dev/null; then
                            AVG_SCORE=$(jq '[.[].score] | add / length' kubesec-report.json 2>/dev/null || echo "0")
                        else
                            AVG_SCORE=0
                        fi
                        echo "Average Kubesec score: $AVG_SCORE/10"

                        # Run Datree validation
                        echo "Running Datree policy validation..."
                        if ! command -v datree &> /dev/null; then
                            echo "Installing Datree..."
                            curl -s https://get.datree.io | /bin/bash
                            export PATH=$HOME/.datree/bin:$PATH
                        fi

                        if command -v datree &> /dev/null; then
                            datree test overlays/dev/*.yaml --output json > datree-report.json || true
                        else
                            echo "[]" > datree-report.json
                            echo "⚠️ Datree installation failed, creating empty report"
                        fi

                        # Count failed rules
                        FAILED_RULES=$(grep -c '"status":"failed"' datree-report.json 2>/dev/null || echo "0")
                        echo "Datree: $FAILED_RULES policy violations found"

                        # Write clean numeric result for Groovy
                        echo "$FAILED_RULES" > /tmp/failed_rules_count.txt

                        # Summary file
                        cat > k8s-security-summary.txt <<EOF
                        === Kubernetes Security Scan Summary ===
                        Kubesec Average Score: $AVG_SCORE/10
                        Datree Policy Violations: $FAILED_RULES

                        Common Issues to Check:
                        - Containers running as root
                        - Missing resource limits
                        - Privileged containers
                        - Exposed secrets in env vars
                        - Missing security contexts
                        EOF
                    '''

                    // Read clean numeric value - fix the parsing issue
                    def failedRules = 0
                    try {
                        def countFile = readFile("/tmp/failed_rules_count.txt").trim()
                        // Extract only the first number if there are multiple lines
                        failedRules = (countFile =~ /\d+/).find()?.toInteger() ?: 0
                    } catch (Exception e) {
                        echo "Warning: Failed to read failed rules count: ${e.message}"
                        failedRules = 0
                    }

                    // Archive all reports
                    archiveArtifacts artifacts: 'external-k8s-manifests/kubesec-report.json,external-k8s-manifests/datree-report.json,external-k8s-manifests/k8s-security-summary.txt',
                        fingerprint: true,
                        allowEmptyArchive: true

                    // Slack notification
                    slackSend(
                        botUser: true,
                        tokenCredentialId: 'slack-bot-token',
                        channel: '#jenkins-alerts',
                        message: "☸️ *Kubernetes Manifest Security Scan*",
                        attachments: [[
                            color: (failedRules > 5) ? 'danger' : ((failedRules > 0) ? 'warning' : 'good'),
                            title: "${env.JOB_NAME} - Build #${env.BUILD_NUMBER}",
                            fields: [
                                [title: 'Policy Violations', value: failedRules.toString(), short: true],
                                [title: 'Tool', value: 'Kubesec + Datree', short: true],
                                [title: 'Status', value: failedRules == 0 ? '✅ Passed' : '⚠️ Review Required', short: false],
                                [title: 'Reports', value: "[Kubesec](${env.BUILD_URL}artifact/external-k8s-manifests/kubesec-report.json) | [Datree](${env.BUILD_URL}artifact/external-k8s-manifests/datree-report.json)", short: false]
                            ]
                        ]]
                    )

                    // Optional: Fail build on excessive violations
                    if (failedRules > 10) {
                        error "❌ Too many Kubernetes security violations (${failedRules}). Fix critical issues."
                    }

                    echo "✅ Kubernetes manifest security scan completed successfully (${failedRules} violations)."
                }
            }
}

        stage('Verify ArgoCD Sync') {
            steps {
                script {
                    echo "Waiting for ArgoCD to sync deployment..."
                    
                    // Wait for ArgoCD to detect and process changes
                    sleep(60)
                    
                    // Optional: Check ArgoCD application status
                    try {
                        withCredentials([file(credentialsId: 'k8s_config', variable: 'KUBECONFIG_FILE')]) {
                            sh '''
                                export KUBECONFIG=$KUBECONFIG_FILE
                                
                                # Check if ArgoCD application exists and is syncing
                                kubectl get application webrtc-dev -n argocd -o jsonpath='{.status.sync.status}' || echo "Application not found"
                                kubectl get application webrtc-dev -n argocd -o jsonpath='{.status.health.status}' || echo "Health status unknown"
                            '''
                        }
                    } catch (Exception e) {
                        echo "Warning: Could not check ArgoCD status: ${e.message}"
                        echo "ArgoCD will continue deploying in the background"
                    }
                    
                    // Send notification
                    slackSend(
                        botUser: true,
                        tokenCredentialId: 'slack-bot-token',
                        channel: '#jenkins-alerts',
                        message: "🚀 *GitOps Update Complete* - ArgoCD is deploying build ${BUILD_NUMBER}"
                    )
                }
            }
        }
       
        stage('DAST Scan') {
            steps {
                script {
                    echo "🎯 Running Comprehensive DAST on WebRTC Signaling Server..."
                    
                    def BASE_URL = "http://webrtc-medali.japaneast.cloudapp.azure.com"
                    
                    sh """
                        # Wait for deployment to stabilize
                        echo "Waiting for deployment..."
                        sleep 45
                        
                        # Test API health
                        echo "Testing API health endpoint..."
                        curl -f ${BASE_URL}/health || {
                            echo "❌ Health check failed! API may not be ready."
                            exit 0  # Don't fail build, just skip DAST
                        }
                        
                        # Create comprehensive endpoint test log
                        cat > endpoint-analysis-log.txt <<LOGHEADER
                            ╔══════════════════════════════════════════════════════════════╗
                            ║           WebRTC API Endpoint Analysis Log                  ║
                            ║           Build: ${BUILD_NUMBER}                                     ║
                            ║           Date: \$(date)                                      ║
                            ╚══════════════════════════════════════════════════════════════╝

                            LOGHEADER

                                            # Create ZAP context
                                            cat > zap-webrtc-context.yaml <<'EOF'
                            env:
                            contexts:
                                - name: "webrtc-api"
                                urls:
                                    - "${BASE_URL}"
                                includePaths:
                                    - "${BASE_URL}/.*"
                                excludePaths:
                                    - "${BASE_URL}/socket.io/.*"
                                technology:
                                    include:
                                    - "NodeJS"
                                    - "Express"
                                    - "Socket.IO"
                            EOF

                                            echo "=========================================" | tee -a endpoint-analysis-log.txt
                                            echo "STEP 1: Testing Individual Endpoints" | tee -a endpoint-analysis-log.txt
                                            echo "=========================================" | tee -a endpoint-analysis-log.txt
                                            echo "" | tee -a endpoint-analysis-log.txt
                                            
                                            # 1. Health Endpoint
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            echo "1️⃣  Testing: GET /health" | tee -a endpoint-analysis-log.txt
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            HEALTH_STATUS=\$(curl -s -o /tmp/health-response.json -w "%{http_code}" ${BASE_URL}/health)
                                            echo "   Status Code: \$HEALTH_STATUS" | tee -a endpoint-analysis-log.txt
                                            if [ "\$HEALTH_STATUS" = "200" ]; then
                                                echo "   ✅ Endpoint accessible" | tee -a endpoint-analysis-log.txt
                                                echo "   Response: \$(cat /tmp/health-response.json)" | tee -a endpoint-analysis-log.txt
                                            else
                                                echo "   ❌ Endpoint returned error" | tee -a endpoint-analysis-log.txt
                                            fi
                                            echo "" | tee -a endpoint-analysis-log.txt
                                            
                                            # 2. Login - Invalid Credentials
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            echo "2️⃣  Testing: POST /login (Invalid Credentials)" | tee -a endpoint-analysis-log.txt
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            LOGIN_STATUS=\$(curl -s -X POST ${BASE_URL}/login \
                                            -H "Content-Type: application/json" \
                                            -d '{"username":"testinvalid","password":"wrongpass"}' \
                                            -o /tmp/login-response.json \
                                            -w "%{http_code}")
                                            echo "   Status Code: \$LOGIN_STATUS" | tee -a endpoint-analysis-log.txt
                                            echo "   Response: \$(cat /tmp/login-response.json)" | tee -a endpoint-analysis-log.txt
                                            if [ "\$LOGIN_STATUS" = "401" ]; then
                                                echo "   ✅ Correctly rejected invalid credentials" | tee -a endpoint-analysis-log.txt
                                            else
                                                echo "   ⚠️  Unexpected response (expected 401)" | tee -a endpoint-analysis-log.txt
                                            fi
                                            echo "" | tee -a endpoint-analysis-log.txt
                                            
                                            # 3. SQL Injection Test
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            echo "3️⃣  Testing: POST /login (SQL Injection)" | tee -a endpoint-analysis-log.txt
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            SQLI_STATUS=\$(curl -s -X POST ${BASE_URL}/login \
                                            -H "Content-Type: application/json" \
                                            -d '{"username":"admin'\'' OR '\''1'\''='\''1","password":"anything"}' \
                                            -o /tmp/sqli-response.json \
                                            -w "%{http_code}")
                                            echo "   Status Code: \$SQLI_STATUS" | tee -a endpoint-analysis-log.txt
                                            echo "   Response: \$(cat /tmp/sqli-response.json)" | tee -a endpoint-analysis-log.txt
                                            if [ "\$SQLI_STATUS" = "401" ] || [ "\$SQLI_STATUS" = "400" ]; then
                                                echo "   ✅ SQL injection attempt rejected" | tee -a endpoint-analysis-log.txt
                                            else
                                                echo "   🚨 Possible vulnerability detected" | tee -a endpoint-analysis-log.txt
                                            fi
                                            echo "" | tee -a endpoint-analysis-log.txt
                                            
                                            # 4. Experts Endpoint
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            echo "4️⃣  Testing: GET /api/experts (No Auth)" | tee -a endpoint-analysis-log.txt
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            EXPERTS_STATUS=\$(curl -s -o /tmp/experts-response.json -w "%{http_code}" ${BASE_URL}/api/experts)
                                            echo "   Status Code: \$EXPERTS_STATUS" | tee -a endpoint-analysis-log.txt
                                            if [ "\$EXPERTS_STATUS" = "200" ]; then
                                                echo "   Response: \$(cat /tmp/experts-response.json | head -c 300)..." | tee -a endpoint-analysis-log.txt
                                                echo "   ⚠️  Endpoint accessible without authentication" | tee -a endpoint-analysis-log.txt
                                            else
                                                echo "   ✅ Authentication required (Status: \$EXPERTS_STATUS)" | tee -a endpoint-analysis-log.txt
                                            fi
                                            echo "" | tee -a endpoint-analysis-log.txt
                                            
                                            # 5. Calls Endpoint
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            echo "5️⃣  Testing: GET /api/calls (No Auth)" | tee -a endpoint-analysis-log.txt
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            CALLS_STATUS=\$(curl -s -o /tmp/calls-response.json -w "%{http_code}" ${BASE_URL}/api/calls)
                                            echo "   Status Code: \$CALLS_STATUS" | tee -a endpoint-analysis-log.txt
                                            if [ "\$CALLS_STATUS" = "200" ]; then
                                                echo "   Response: \$(cat /tmp/calls-response.json | head -c 300)..." | tee -a endpoint-analysis-log.txt
                                                echo "   ⚠️  Call data accessible without authentication" | tee -a endpoint-analysis-log.txt
                                            else
                                                echo "   ✅ Authentication required (Status: \$CALLS_STATUS)" | tee -a endpoint-analysis-log.txt
                                            fi
                                            echo "" | tee -a endpoint-analysis-log.txt
                                            
                                            # 6. Users Status
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            echo "6️⃣  Testing: GET /api/users/status (No Auth)" | tee -a endpoint-analysis-log.txt
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            USERS_STATUS=\$(curl -s -o /tmp/users-response.json -w "%{http_code}" ${BASE_URL}/api/users/status)
                                            echo "   Status Code: \$USERS_STATUS" | tee -a endpoint-analysis-log.txt
                                            if [ "\$USERS_STATUS" = "200" ]; then
                                                echo "   Response: \$(cat /tmp/users-response.json | head -c 300)..." | tee -a endpoint-analysis-log.txt
                                                echo "   ⚠️  User data accessible without authentication" | tee -a endpoint-analysis-log.txt
                                            else
                                                echo "   ✅ Authentication required (Status: \$USERS_STATUS)" | tee -a endpoint-analysis-log.txt
                                            fi
                                            echo "" | tee -a endpoint-analysis-log.txt
                                            
                                            # 7. Create Call
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            echo "7️⃣  Testing: POST /api/create-call (No Auth)" | tee -a endpoint-analysis-log.txt
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            CREATE_CALL_STATUS=\$(curl -s -X POST ${BASE_URL}/api/create-call \
                                            -H "Content-Type: application/json" \
                                            -d '{"userId":"testuser"}' \
                                            -o /tmp/create-call-response.json \
                                            -w "%{http_code}")
                                            echo "   Status Code: \$CREATE_CALL_STATUS" | tee -a endpoint-analysis-log.txt
                                            echo "   Response: \$(cat /tmp/create-call-response.json)" | tee -a endpoint-analysis-log.txt
                                            if [ "\$CREATE_CALL_STATUS" = "200" ]; then
                                                echo "   🚨 Unauthorized call creation possible" | tee -a endpoint-analysis-log.txt
                                            else
                                                echo "   ✅ Authentication/Authorization enforced" | tee -a endpoint-analysis-log.txt
                                            fi
                                            echo "" | tee -a endpoint-analysis-log.txt
                                            
                                            # 8. CORS Test
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            echo "8️⃣  Testing: CORS Configuration" | tee -a endpoint-analysis-log.txt
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            CORS_RESPONSE=\$(curl -s -H "Origin: https://malicious-site.com" -I ${BASE_URL}/health)
                                            CORS_HEADER=\$(echo "\$CORS_RESPONSE" | grep -i "access-control-allow-origin" || echo "Not found")
                                            echo "   CORS Header: \$CORS_HEADER" | tee -a endpoint-analysis-log.txt
                                            if echo "\$CORS_HEADER" | grep -q "\\*"; then
                                                echo "   ⚠️  CORS allows all origins" | tee -a endpoint-analysis-log.txt
                                            elif [ "\$CORS_HEADER" = "Not found" ]; then
                                                echo "   ✅ CORS not configured (restrictive)" | tee -a endpoint-analysis-log.txt
                                            else
                                                echo "   ✅ CORS properly restricted" | tee -a endpoint-analysis-log.txt
                                            fi
                                            echo "" | tee -a endpoint-analysis-log.txt
                                            
                                            # 9. Security Headers
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            echo "9️⃣  Testing: Security Headers" | tee -a endpoint-analysis-log.txt
                                            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                            
                                            HEADERS=\$(curl -s -I ${BASE_URL}/health)
                                            
                                            HAS_XFRAME=\$(echo "\$HEADERS" | grep -qi "X-Frame-Options" && echo "YES" || echo "NO")
                                            HAS_XCONTENT=\$(echo "\$HEADERS" | grep -qi "X-Content-Type-Options" && echo "YES" || echo "NO")
                                            HAS_HSTS=\$(echo "\$HEADERS" | grep -qi "Strict-Transport-Security" && echo "YES" || echo "NO")
                                            HAS_CSP=\$(echo "\$HEADERS" | grep -qi "Content-Security-Policy" && echo "YES" || echo "NO")
                                            
                                            echo "   X-Frame-Options:        \$HAS_XFRAME" | tee -a endpoint-analysis-log.txt
                                            echo "   X-Content-Type-Options: \$HAS_XCONTENT" | tee -a endpoint-analysis-log.txt
                                            echo "   HSTS:                   \$HAS_HSTS" | tee -a endpoint-analysis-log.txt
                                            echo "   CSP:                    \$HAS_CSP" | tee -a endpoint-analysis-log.txt
                                            echo "" | tee -a endpoint-analysis-log.txt
                                            
                                            # Count issues
                                            MANUAL_ISSUES=0
                                            if [ "\$EXPERTS_STATUS" = "200" ]; then MANUAL_ISSUES=\$((MANUAL_ISSUES + 1)); fi
                                            if [ "\$CALLS_STATUS" = "200" ]; then MANUAL_ISSUES=\$((MANUAL_ISSUES + 1)); fi
                                            if [ "\$USERS_STATUS" = "200" ]; then MANUAL_ISSUES=\$((MANUAL_ISSUES + 1)); fi
                                            if [ "\$CREATE_CALL_STATUS" = "200" ]; then MANUAL_ISSUES=\$((MANUAL_ISSUES + 1)); fi
                                            if echo "\$CORS_HEADER" | grep -q "\\*"; then MANUAL_ISSUES=\$((MANUAL_ISSUES + 1)); fi
                                            if [ "\$HAS_XFRAME" = "NO" ]; then MANUAL_ISSUES=\$((MANUAL_ISSUES + 1)); fi
                                            if [ "\$HAS_CSP" = "NO" ]; then MANUAL_ISSUES=\$((MANUAL_ISSUES + 1)); fi
                                            
                                            echo "=========================================" | tee -a endpoint-analysis-log.txt
                                            echo "Manual Testing Results: \$MANUAL_ISSUES issues found" | tee -a endpoint-analysis-log.txt
                                            echo "=========================================" | tee -a endpoint-analysis-log.txt
                                            echo "" | tee -a endpoint-analysis-log.txt
                                            
                                            # Run ZAP scan
                                            echo "=========================================" | tee -a endpoint-analysis-log.txt
                                            echo "STEP 2: Running ZAP Automated Scan" | tee -a endpoint-analysis-log.txt
                                            echo "=========================================" | tee -a endpoint-analysis-log.txt
                                            echo "" | tee -a endpoint-analysis-log.txt
                                            
                                            docker run --rm \
                                                -v \$(pwd):/zap/wrk:rw \
                                                --network host \
                                                -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
                                                -t ${BASE_URL} \
                                                -n /zap/wrk/zap-webrtc-context.yaml \
                                                -J zap-report.json \
                                                -r zap-report.html \
                                                -w zap-report.md \
                                                -I \
                                                -d 2>&1 | tee zap-scan-output.log || true
                                            
                                            # Analyze ZAP results
                                            if [ -f zap-report.json ]; then
                                                echo "" | tee -a endpoint-analysis-log.txt
                                                echo "=========================================" | tee -a endpoint-analysis-log.txt
                                                echo "STEP 3: ZAP Scan Results" | tee -a endpoint-analysis-log.txt
                                                echo "=========================================" | tee -a endpoint-analysis-log.txt
                                                echo "" | tee -a endpoint-analysis-log.txt
                                                
                                                HIGH_ALERTS=\$(grep -c '"risk":"High"' zap-report.json 2>/dev/null || echo "0")
                                                MEDIUM_ALERTS=\$(grep -c '"risk":"Medium"' zap-report.json 2>/dev/null || echo "0")
                                                LOW_ALERTS=\$(grep -c '"risk":"Low"' zap-report.json 2>/dev/null || echo "0")
                                                INFO_ALERTS=\$(grep -c '"risk":"Informational"' zap-report.json 2>/dev/null || echo "0")
                                                
                                                echo "Vulnerability Count:" | tee -a endpoint-analysis-log.txt
                                                echo "  🔴 High:          \$HIGH_ALERTS" | tee -a endpoint-analysis-log.txt
                                                echo "  🟡 Medium:        \$MEDIUM_ALERTS" | tee -a endpoint-analysis-log.txt
                                                echo "  🔵 Low:           \$LOW_ALERTS" | tee -a endpoint-analysis-log.txt
                                                echo "  ⚪ Informational: \$INFO_ALERTS" | tee -a endpoint-analysis-log.txt
                                                echo "" | tee -a endpoint-analysis-log.txt
                                                
                                                # Extract actual vulnerability names found
                                                echo "Vulnerabilities Detected:" | tee -a endpoint-analysis-log.txt
                                                grep -o '"name":"[^"]*"' zap-report.json | cut -d'"' -f4 | sort -u | while read vuln; do
                                                    COUNT=\$(grep -c "\\"name\\":\\"\$vuln\\"" zap-report.json || echo "0")
                                                    echo "  • \$vuln (found \$COUNT times)" | tee -a endpoint-analysis-log.txt
                                                done
                                                echo "" | tee -a endpoint-analysis-log.txt
                                                
                                                # Extract high-risk findings details
                                                if [ "\$HIGH_ALERTS" -gt "0" ]; then
                                                    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                                    echo "🔴 HIGH RISK FINDINGS:" | tee -a endpoint-analysis-log.txt
                                                    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" | tee -a endpoint-analysis-log.txt
                                                    grep -A 10 '"risk":"High"' zap-report.json | grep -o '"name":"[^"]*"\\|"url":"[^"]*"\\|"description":"[^"]*"' | head -30 | tee -a endpoint-analysis-log.txt
                                                    echo "" | tee -a endpoint-analysis-log.txt
                                                fi
                                            else
                                                echo "⚠️  ZAP report not generated" | tee -a endpoint-analysis-log.txt
                                            fi
                                            
                                            # Generate final summary
                                            cat > dast-final-summary.txt <<SUMMARY
                            ╔══════════════════════════════════════════════════════════════╗
                            ║         WebRTC DAST Scan Results - Build ${BUILD_NUMBER}            ║
                            ╚══════════════════════════════════════════════════════════════╝

                            🎯 Target: ${BASE_URL}
                            📅 Date: \$(date '+%Y-%m-%d %H:%M:%S')
                            🔗 Commit: ${GIT_COMMIT_SHORT}

                            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                            📊 SCAN RESULTS
                            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                            Manual Endpoint Testing:
                            Issues Found: \$MANUAL_ISSUES

                            ZAP Automated Scan:
                            🔴 High Risk:     \${HIGH_ALERTS:-0}
                            🟡 Medium Risk:   \${MEDIUM_ALERTS:-0}
                            🔵 Low Risk:      \${LOW_ALERTS:-0}
                            ⚪ Info:          \${INFO_ALERTS:-0}

                            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                            🔍 ENDPOINT TEST RESULTS
                            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                            GET  /health              → \$HEALTH_STATUS
                            POST /login               → \$LOGIN_STATUS
                            GET  /api/experts         → \$EXPERTS_STATUS
                            GET  /api/calls           → \$CALLS_STATUS
                            GET  /api/users/status    → \$USERS_STATUS
                            POST /api/create-call     → \$CREATE_CALL_STATUS

                            CORS Configuration:       \$(echo "\$CORS_HEADER" | grep -q "\\*" && echo "⚠️  Allows all origins" || echo "✅ Restricted")

                            Security Headers:
                            X-Frame-Options:        \$HAS_XFRAME
                            X-Content-Type-Options: \$HAS_XCONTENT
                            HSTS:                   \$HAS_HSTS
                            CSP:                    \$HAS_CSP

                            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                            📎 DETAILED REPORTS
                            ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

                            📄 Endpoint Analysis:  endpoint-analysis-log.txt
                            🔍 ZAP Scan Log:       zap-scan-output.log
                            📊 ZAP HTML Report:    zap-report.html
                            📋 ZAP JSON Report:    zap-report.json

                            Jenkins Build: ${env.BUILD_URL}
                            SUMMARY

                                            cat dast-final-summary.txt
                                        """
                    
                    // Parse results for Slack
                    def healthStatus = sh(script: "grep 'GET /health' dast-final-summary.txt | awk '{print \$NF}'", returnStdout: true).trim()
                    def expertsStatus = sh(script: "grep 'GET  /api/experts' dast-final-summary.txt | awk '{print \$NF}'", returnStdout: true).trim()
                    def callsStatus = sh(script: "grep 'GET  /api/calls' dast-final-summary.txt | awk '{print \$NF}'", returnStdout: true).trim()
                    def usersStatus = sh(script: "grep 'GET  /api/users/status' dast-final-summary.txt | awk '{print \$NF}'", returnStdout: true).trim()
                    def createCallStatus = sh(script: "grep 'POST /api/create-call' dast-final-summary.txt | awk '{print \$NF}'", returnStdout: true).trim()
                    
                    def highAlerts = sh(script: "grep 'High Risk:' dast-final-summary.txt | awk '{print \$NF}' | head -1", returnStdout: true).trim()
                    def mediumAlerts = sh(script: "grep 'Medium Risk:' dast-final-summary.txt | awk '{print \$NF}' | head -1", returnStdout: true).trim()
                    def lowAlerts = sh(script: "grep 'Low Risk:' dast-final-summary.txt | awk '{print \$NF}' | head -1", returnStdout: true).trim()
                    def manualIssues = sh(script: "grep 'Issues Found:' dast-final-summary.txt | awk '{print \$NF}'", returnStdout: true).trim()
                    
                    // Archive all reports
                    archiveArtifacts artifacts: '''
                        endpoint-analysis-log.txt,
                        zap-scan-output.log,
                        dast-final-summary.txt,
                        zap-report.json,
                        zap-report.html,
                        zap-report.md
                    ''', fingerprint: true, allowEmptyArchive: true
                    
                    // Publish HTML report
                    publishHTML([
                        allowMissing: false,
                        alwaysLinkToLastBuild: true,
                        keepAll: true,
                        reportDir: '.',
                        reportFiles: 'zap-report.html',
                        reportName: 'ZAP DAST Report'
                    ])
                    
                    // Determine overall status
                    def totalIssues = (highAlerts.toInteger() + manualIssues.toInteger())
                    def alertColor = (highAlerts.toInteger() > 0) ? 'danger' : ((mediumAlerts.toInteger() > 5) ? 'warning' : 'good')
                    def statusEmoji = (totalIssues > 0) ? '⚠️' : '✅'
                    def statusText = (totalIssues > 0) ? 'Issues Found' : 'No Critical Issues'
                    
                    // Send comprehensive Slack notification
                    slackSend(
                        botUser: true,
                        tokenCredentialId: 'slack-bot-token',
                        channel: '#jenkins-alerts',
                        message: "${statusEmoji} *DAST Scan Completed - ${statusText}*",
                        attachments: [[
                            color: alertColor,
                            title: "${env.JOB_NAME} - Build #${env.BUILD_NUMBER} - DAST Results",
                            title_link: "${env.BUILD_URL}",
                            fields: [
                                [
                                    title: '📊 Scan Summary',
                                    value: "Manual Issues: *${manualIssues}* | ZAP High: *${highAlerts}* | Medium: *${mediumAlerts}* | Low: *${lowAlerts}*",
                                    short: false
                                ],
                                [
                                    title: '🔍 Endpoint Results',
                                    value: """
                                    `/health` → ${healthStatus}
                                    `/api/experts` → ${expertsStatus}
                                    `/api/calls` → ${callsStatus}
                                    `/api/users/status` → ${usersStatus}
                                    `/api/create-call` → ${createCallStatus}
                                    """.stripIndent(),
                                    short: true
                                ],
                                [
                                    title: '🌐 Target',
                                    value: 'http://webrtc-medali.japaneast.cloudapp.azure.com',
                                    short: true
                                ],
                                [
                                    title: '📎 Reports & Logs',
                                    value: """
                                    • [📊 ZAP HTML Report](${env.BUILD_URL}ZAP_20DAST_20Report/)
                                    • [📄 Endpoint Analysis](${env.BUILD_URL}artifact/endpoint-analysis-log.txt)
                                    • [🔍 ZAP Scan Log](${env.BUILD_URL}artifact/zap-scan-output.log)
                                    • [📋 Final Summary](${env.BUILD_URL}artifact/dast-final-summary.txt)
                                    • [📥 JSON Report](${env.BUILD_URL}artifact/zap-report.json)
                                    """.stripIndent(),
                                    short: false
                                ],
                                [
                                    title: '🔗 Build Info',
                                    value: "Commit: `${env.GIT_COMMIT_SHORT}` | Build: #${env.BUILD_NUMBER}",
                                    short: false
                                ]
                            ],
                            footer: 'DevSecOps Pipeline - DAST Analysis',
                            footer_icon: 'https://www.zaproxy.org/img/zap-by-checkmarx.svg',
                            ts: sh(script: 'date +%s', returnStdout: true).trim()
                        ]]
                    )
                    
                    // Quality gate
                    if (highAlerts.toInteger() > 0) {
                        unstable("⚠️  DAST found ${highAlerts} high-risk vulnerabilities. Review required!")
                    }
                    
                    echo "✅ DAST scan completed - ${totalIssues} total issues found"
                    echo "📊 View detailed reports in Jenkins artifacts"
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
                            [title: 'Deployment', value: '✅ Successfully updated GitOps manifests - ArgoCD will deploy', short: false]                        ],
                        footer: 'Jenkins CI/CD Pipeline with DevSecOps',
                        ts: sh(script: 'date +%s', returnStdout: true).trim()
                    ]
                ]
            )
        }
       
        failure {
            echo "❌ Pipeline failed!"
            echo "Check the logs above for error details"
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