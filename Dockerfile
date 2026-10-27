FROM node:22-alpine
WORKDIR /app
ENV IN_DOCKER=1
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY web ./web
COPY scripts ./scripts
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server/src/index.js"]
