# Render 也支持 Docker 部署（可选）：New → Web Service → Deploy an existing image / Dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production
# Render 会注入 PORT 环境变量，此处仅为本地默认值
ENV PORT=80

EXPOSE 80

CMD ["node", "src/server.js"]
