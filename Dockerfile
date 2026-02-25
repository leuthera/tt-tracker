FROM node:20-alpine

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Copy app files
COPY server.js index.html ./
COPY manifest.json icon.svg sw.js ./

# Data directory for the SQLite volume
RUN mkdir -p /data

EXPOSE 8000

CMD ["node", "server.js"]
