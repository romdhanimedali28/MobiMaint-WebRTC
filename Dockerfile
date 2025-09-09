# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install wget for health checks (needed for Alpine)
RUN apk add --no-cache wget

# Copy package files first for better layer caching
COPY package*.json ./

# Install dependencies (use --omit=dev instead of --only=production)
RUN npm ci --omit=dev && npm cache clean --force

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

# Start the application with Node.js built-in init process
CMD ["node", "--init", "server.js"]