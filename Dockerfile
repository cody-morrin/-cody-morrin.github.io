FROM node:24-slim
WORKDIR /app
COPY package.json server.js ./
COPY public ./public
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
