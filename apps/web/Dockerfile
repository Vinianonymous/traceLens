FROM node:22-alpine AS build
ARG VITE_TRACELENS_API_PORT=8000
ARG VITE_DEMO_ORIGIN=http://demo-api:8001
ARG VITE_DEMO_ORIGIN=http://demo-api:8001
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
CMD ["./node_modules/.bin/serve", "-s", "dist", "-l", "5173"]
