FROM node:22-slim

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY index.html styles.css script.js ./
COPY assets ./assets

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "start"]
