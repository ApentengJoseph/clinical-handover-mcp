FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY build/ ./build/
CMD ["node", "build/index.js"]