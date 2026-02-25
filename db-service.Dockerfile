FROM node:20-alpine

WORKDIR /app

COPY db-service-package.json package.json
RUN npm install --omit=dev

COPY db-service.js .

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "db-service.js"]
