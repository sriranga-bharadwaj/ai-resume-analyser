import mongoose from "mongoose";
import {Worker} from "bullmq";
import {config} from "./config";
import {markFailed, processResume} from "./analyze";
import {QUEUE_NAME, redisConnection} from "./queue";

await mongoose.connect(config.mongoUrl);

const worker = new Worker(
    QUEUE_NAME,
    (job) => processResume(job.data.resumeId),
    {connection: redisConnection(), concurrency: 2},
);

worker.on("failed", async (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) await markFailed(job.data.resumeId);
});

const shutdown = async () => {
    // Finishes running jobs before exit.
    await worker.close();
    await mongoose.disconnect();
    process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log("Worker ready");
