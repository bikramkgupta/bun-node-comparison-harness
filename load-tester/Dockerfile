# Build hey tool
FROM golang:1.21-alpine AS hey-builder
RUN go install github.com/rakyll/hey@latest

# Main image using Bun
FROM oven/bun:1.1-alpine

# Install required packages
RUN apk add --no-cache \
    curl \
    jq \
    bash \
    coreutils \
    wget \
    bc

# Copy hey binary from builder
COPY --from=hey-builder /go/bin/hey /usr/local/bin/hey

# Set working directory
WORKDIR /app

# Copy application files
COPY server.js runner.js ./
COPY public ./public

# Keep legacy benchmark script for CLI usage
COPY benchmark.sh /benchmark.sh
RUN chmod +x /benchmark.sh

# Set default environment variables
ENV PORT=8080
ENV RESULTS_DIR=/results
ENV BUN_HOST=bun-app
ENV NODEJS_HOST=nodejs-app

# Expose dashboard port
EXPOSE 8080

# Run the dashboard server
CMD ["bun", "run", "server.js"]
