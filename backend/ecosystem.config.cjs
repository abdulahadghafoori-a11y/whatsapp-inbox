// PM2 process definition.
// IMPORTANT: instances must be 1 — the API hosts an in-process Socket.io server
// and the DB-backed job poller. Running multiple instances without a Socket.io
// Redis adapter + distributed locking would double-process jobs and split rooms.
module.exports = {
  apps: [
    {
      name: 'inbox-api',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '500M',
    },
  ],
}
