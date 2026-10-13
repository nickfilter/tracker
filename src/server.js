// 服务入口：监听端口（微信云托管默认 80，由 PORT 环境变量注入）
const app = require('./app');

const PORT = parseInt(process.env.PORT || '80', 10);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[clickdealer] listening on 0.0.0.0:${PORT}`);
  console.log(`[clickdealer] DB_HOST=${process.env.DB_HOST || '(unset)'} DB_NAME=${process.env.DB_NAME || '(unset)'}`);
});

// 优雅退出
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log('[clickdealer] shutting down...');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 9000);
  });
}
