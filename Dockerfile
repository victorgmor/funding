FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install -g npm@11 && npm ci
ARG PUBLIC_POLY_BUILDER_CODE=""
ARG PUBLIC_PRIVY_APP_ID=""
ARG PUBLIC_PRIVY_SIGNER_QUORUM_ID=""
ENV PUBLIC_POLY_BUILDER_CODE=$PUBLIC_POLY_BUILDER_CODE
ENV PUBLIC_PRIVY_APP_ID=$PUBLIC_PRIVY_APP_ID
ENV PUBLIC_PRIVY_SIGNER_QUORUM_ID=$PUBLIC_PRIVY_SIGNER_QUORUM_ID
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN mkdir -p data

EXPOSE 8080
CMD ["node", "./dist/server/entry.mjs"]
