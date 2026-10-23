import { ConfigError, loadConfig } from '@harvestslot/config';
import { createApp } from './bootstrap.js';

async function main(): Promise<void> {
  let env;
  try {
    env = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  const app = await createApp();
  await app.listen(env.API_PORT, env.API_HOST);
  console.warn(`HarvestSlot API listening on http://${env.API_HOST}:${env.API_PORT}/api/v1 (docs: /api/docs)`);
}

void main();
