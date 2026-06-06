// pm2 process definitions for the Skyline SIS.
// Start:  pm2 start ecosystem.config.js && pm2 save
// Boot:   pm2 startup   (run the printed command once)
const path = require('path');
const root = __dirname;

// Load the repo-root .env so both processes share DATABASE_URL, JWT_SECRET, etc.
require('dotenv').config({ path: path.join(root, '.env') });

const shared = {
  NODE_ENV: 'production',
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  WEB_ORIGIN: process.env.WEB_ORIGIN,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL,
  PGBOSS_SCHEMA: process.env.PGBOSS_SCHEMA,
};

module.exports = {
  apps: [
    {
      name: 'skyline-api',
      cwd: path.join(root, 'apps/api'),
      script: 'dist/main.js',
      env: { ...shared, API_PORT: process.env.API_PORT || '3001' },
      max_restarts: 10,
      restart_delay: 2000,
    },
    {
      name: 'skyline-web',
      cwd: path.join(root, 'apps/web'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: { ...shared, API_PORT: process.env.API_PORT || '3001', PORT: '3000' },
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
