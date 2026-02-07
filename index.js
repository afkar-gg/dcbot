require('dotenv').config();

const { createBot } = require('./src/bot');

createBot()
  .start()
  .catch((err) => {
    console.error('Bot failed to start:', err);
    process.exitCode = 1;
  });
