module.exports = {
  apps: [
    {
      name: 'liquidsoap-engine',
      script: 'liquidsoap',
      args: '/var/www/radiodj/playout.liq',
      watch: false,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'radioplay',
      script: '/var/www/radiodj/scripts/start-radioplay.sh',
      interpreter: 'bash',
      watch: false,
      env: { NODE_ENV: 'production' }
    }
  ]
};
