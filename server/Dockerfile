FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
CMD ["npm", "start"]
