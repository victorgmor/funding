FROM node:22-slim AS build
WORKDIR /app
ARG PUBLIC_POLY_BUILDER_CODE=""
ENV PUBLIC_POLY_BUILDER_CODE=$PUBLIC_POLY_BUILDER_CODE
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
RUN mkdir -p data

EXPOSE 8080
CMD ["node", "./dist/server/entry.mjs"]
