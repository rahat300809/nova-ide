FROM ubuntu:22.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Update system and install required compilers/runtimes
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    g++ \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (v20)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (only production)
RUN npm ci --only=production

# Copy application code
COPY server.ts ./
COPY tsconfig*.json ./

# Install TypeScript globally to compile the server if needed, or use tsx
RUN npm install -g tsx typescript

# Create a temporary directory for code execution
RUN mkdir -p /app/temp && chmod 777 /app/temp

# Expose port
EXPOSE 3000

# Start the server
CMD ["tsx", "server.ts"]
