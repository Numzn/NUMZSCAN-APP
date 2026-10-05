FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY . .
# dist/ is the legacy fundraising/OBS build; web/dist/ is the React EventPass app served at the root.
RUN npm run build && cd web && npm run build

FROM node:22-alpine
WORKDIR /app
COPY api/package.json api/package-lock.json* ./api/
RUN cd api && npm install --omit=dev
COPY api ./api
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "api/src/server.js"]
