# Clausidian Docker image — MCP server for Obsidian vault management
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy application code
COPY bin/ ./bin/
COPY src/ ./src/
COPY scaffold/ ./scaffold/
COPY skill/ ./skill/

# Create vault mount point
RUN mkdir -p /vault

# Set vault as default working directory for MCP operations
ENV VAULT_ROOT=/vault

# Default command: start MCP server
CMD ["node", "bin/cli.mjs", "serve", "--vault", "/vault"]

# Volume for vault data
VOLUME ["/vault"]

# Expose stdio for MCP protocol
EXPOSE 3000
