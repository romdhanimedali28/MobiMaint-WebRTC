# Switch to Node.js Slim (Debian-based) - much more reliable
FROM node:18-slim

# Set working directory
WORKDIR /app

# Install dumb-init and clean up
RUN apt-get update && apt-get install -y dumb-init && \
    rm -rf /var/lib/apt/lists/*

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy server code
COPY server.js ./

# Create non-root user and group
RUN groupadd -r -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs webrtc

# Change ownership of the app directory
RUN chown -R webrtc:nodejs /app

# Switch to non-root user
USER webrtc

# Expose port 3000
EXPOSE 3000

# Health check with Node.js (adjusted start period for app startup)
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]