FROM node:20-alpine
WORKDIR /app

COPY api/package.json api/package-lock.json* ./api/
RUN cd api && npm install --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "api/src/server.js"]
