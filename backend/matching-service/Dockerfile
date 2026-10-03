FROM node:24-slim
WORKDIR /workspace/backend/matching-service
COPY backend/matching-service/package.json backend/matching-service/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/matching-service/ ./
COPY lib/matching/ /workspace/lib/matching/
ENV NODE_ENV=production
EXPOSE 8001
CMD ["node", "index.ts"]
