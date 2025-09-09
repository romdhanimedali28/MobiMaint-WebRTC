# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dumb-init for proper signal handling
ADD https://github.com/Yelp/dumb-init/releases/download/v1.2.5/dumb-init_1.2.5_amd64 /usr/local/bin/dumb-init
RUN chmod +x /usr/local/bin/dumb-init

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy server code
COPY server.js ./
# If you have other files/folders, add them here
# COPY src/ ./src/
# COPY public/ ./public/

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S webrtc -u 1001 -G nodejs

# Change ownership of the app directory
RUN chown -R webrtc:nodejs /app

# Switch to non-root user
USER webrtc

# Expose port 3000
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]