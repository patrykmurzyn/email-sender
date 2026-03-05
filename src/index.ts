import { getConfig } from "./config";
import { LibsqlEventRepository } from "./db";
import { createResendClient } from "./delivery";
import { hashPayloadContent } from "./hash";
import { processQueueMessage } from "./processor";
import type { Env } from "./types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const config = getConfig(env);
    const repository = new LibsqlEventRepository(env);
    const deliveryClient = createResendClient(env.RESEND_API_KEY, config);

    for (const message of batch.messages) {
      await processQueueMessage(message, {
        config,
        repository,
        deliveryClient,
        hashContent: hashPayloadContent,
        sleep,
        logger: console,
      });
    }
  },
} satisfies ExportedHandler<Env>;
