FROM node:20-alpine

ARG BUILD_SHA=dev
ENV BUILD_SHA=$BUILD_SHA

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy app files
COPY server.js index.html ./
COPY manifest.json icon.svg sw.js ./
COPY lib/ lib/

EXPOSE 8000

CMD ["node", "server.js"]
