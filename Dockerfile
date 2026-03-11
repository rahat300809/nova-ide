FROM ubuntu:22.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install required compilers/runtimes + node-pty native build deps
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    g++ \
    python3 \
    python3-pip \
    make \
    libc6-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (v20)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (node-pty needs native build at install time)
RUN npm ci

# Copy server and config
COPY server.ts ./
COPY tsconfig*.json ./

# Copy all source files
COPY . ./

# Build the frontend assets so they exist in dist/
RUN npm run build

# Install tsx globally to run TypeScript server directly
RUN npm install -g tsx typescript

# Temp dir for code execution
RUN mkdir -p /app/temp && chmod 777 /app/temp

# Expose port
EXPOSE 3000

# Start the server in production mode
ENV NODE_ENV=production
CMD ["tsx", "server.ts"]
