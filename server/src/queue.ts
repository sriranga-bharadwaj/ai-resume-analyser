import {Queue} from "bullmq";
import {config} from "./config";

export const QUEUE_NAME = "resume-analysis";
export const JOB_ATTEMPTS = 3;

export const redisConnection = () => {
    const url = new URL(config.redisUrl);
    return {
        host: url.hostname,
        port: Number(url.port || 6379),
        password: url.password || undefined,
        maxRetriesPerRequest: null,
    };
};

export const createEnqueue = () => {
    const queue = new Queue(QUEUE_NAME, {connection: redisConnection()});
    return async (resumeId: string) => {
        // jobId stops the same resume being queued twice.
        await queue.add("analyze", {resumeId}, {
            jobId: resumeId,
            attempts: JOB_ATTEMPTS,
            backoff: {type: "exponential", delay: 5_000},
            removeOnComplete: true,
            removeOnFail: 100,
        });
    };
};
