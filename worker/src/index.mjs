import { enqueueScheduledPublication, processNextPublishJob } from './publish.mjs';
import { config } from './config.mjs';
import { processNextRenderJob } from './render.mjs';

const MAX_TICK_ITERATIONS = 24;

async function tick() {
  try {
    for (let iteration = 0; iteration < MAX_TICK_ITERATIONS; iteration += 1) {
      const rendered = await processNextRenderJob();
      if (rendered) {
        continue;
      }

      const scheduled = await enqueueScheduledPublication();
      if (scheduled) {
        continue;
      }

      const published = await processNextPublishJob();
      if (published) {
        continue;
      }

      break;
    }
  } catch (error) {
    console.error('[worker]', error);
  }
}

console.log('[worker] starting MansAlarm background worker');
await tick();
setInterval(() => {
  tick().catch((error) => {
    console.error('[worker interval]', error);
  });
}, config.pollIntervalMs);
