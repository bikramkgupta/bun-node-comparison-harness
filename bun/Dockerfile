# Bun Dockerfile with Timing Instrumentation
FROM oven/bun:1.1-alpine

WORKDIR /app

# Record install start time
RUN echo "INSTALL_START_MS=$(date +%s%3N)" > /tmp/timing.txt && \
    echo "INSTALL_START_ISO=$(date -Iseconds)" >> /tmp/timing.txt

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies (this is what we're measuring)
RUN bun install --production 2>&1 | tee /tmp/bun-install.log

# Record install end time and calculate duration
RUN echo "INSTALL_END_MS=$(date +%s%3N)" >> /tmp/timing.txt && \
    echo "INSTALL_END_ISO=$(date -Iseconds)" >> /tmp/timing.txt && \
    INSTALL_START=$(grep INSTALL_START_MS /tmp/timing.txt | cut -d= -f2) && \
    INSTALL_END=$(grep INSTALL_END_MS /tmp/timing.txt | cut -d= -f2) && \
    INSTALL_TIME=$((INSTALL_END - INSTALL_START)) && \
    echo "INSTALL_TIME_MS=$INSTALL_TIME" >> /tmp/timing.txt && \
    echo "" && \
    echo "============================================" && \
    echo "[DOCKER BUILD] INSTALL TIMING" && \
    echo "============================================" && \
    echo "[TIMING] Install start: $(grep INSTALL_START_ISO /tmp/timing.txt | cut -d= -f2)" && \
    echo "[TIMING] Install end: $(grep INSTALL_END_ISO /tmp/timing.txt | cut -d= -f2)" && \
    echo "[TIMING] Install duration: ${INSTALL_TIME}ms" && \
    echo "============================================" && \
    echo ""

# Copy application files
COPY . .

# Move timing file to app directory
RUN cp /tmp/timing.txt /app/install-timing.txt

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start command
CMD ["bun", "run", "server.js"]
