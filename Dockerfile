# syntax=docker/dockerfile:1

# ---- Stage 1: build the React frontend -------------------------------------
FROM node:26 AS client-build
WORKDIR /build/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# Mock mode is ON unless this is exactly "false" (client/src/api/index.js)
ENV VITE_USE_MOCK=false
RUN npm run build

# ---- Stage 2: install backend dependencies (full image has the build tools bcrypt may need)
FROM node:26 AS server-deps
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 3: runtime -------------------------------------------------------
FROM node:26-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=server-deps /build/server/node_modules ./server/node_modules
COPY server/ ./server/
COPY SQL/queries/ ./SQL/queries/
COPY --from=client-build /build/client/dist ./client/dist
RUN chmod -R a+rX /app
USER node
WORKDIR /app/server
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "index.js"]
