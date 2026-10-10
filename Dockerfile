# ==========================================
# Stage 1: Build the frontend application
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy project source code
COPY . .

# Optional build argument for Mattermost Base URL
ARG MATTERMOST_BASE_URL=""
ENV MATTERMOST_BASE_URL=${MATTERMOST_BASE_URL}

# Compile TypeScript and build production bundle
RUN npm run build

# ==========================================
# Stage 2: Production runtime environment
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5173

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled frontend assets from builder stage
COPY --chown=node:node --from=builder /app/dist ./dist

# Copy production backend server
COPY --chown=node:node server.js ./server.js

# Expose default application port
EXPOSE 5173

# Run container as non-root user
USER node

# Start production server
CMD ["node", "server.js"]
