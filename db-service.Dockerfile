FROM node:22-alpine

WORKDIR /app

COPY db-service-package.json package.json
RUN npm install --omit=dev

COPY db-service.js .
COPY lib/ lib/

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "db-service.js"]
