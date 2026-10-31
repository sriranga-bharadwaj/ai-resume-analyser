import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {MongoMemoryServer} from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";

process.env.JWT_SECRET = "test-secret";
process.env.AI_PROVIDER = "mock";
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `resumind-test-${process.pid}`);

const {createApp} = await import("../src/app");
const {markFailed, processResume, feedbackSchema} = await import("../src/analyze");
const {Resume, User} = await import("../src/models");

const pdf = Buffer.from("%PDF-1.7 test");
const png = Buffer.from("\x89PNG test", "latin1");

let mongo: MongoMemoryServer;
let queued: string[];
let queueDown: boolean;
const app = createApp(async (id) => {
    if (queueDown) throw new Error("redis down");
    queued.push(id);
});

const signUp = async (email = "a@example.com") => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({email, password: "password123"}).expect(201);
    return agent;
};

const uploadResume = (agent: ReturnType<typeof request.agent>, jobTitle = "Engineer") =>
    agent.post("/api/resumes")
        .field("jobTitle", jobTitle)
        .attach("resume", pdf, "resume.pdf")
        .attach("image", png, "resume.png");

beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
}, 120_000);

afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
    await fs.rm(process.env.UPLOAD_DIR!, {recursive: true, force: true});
});

beforeEach(async () => {
    queued = [];
    queueDown = false;
    await Promise.all([Resume.deleteMany({}), User.deleteMany({})]);
});

describe("auth", () => {
    it("blocks signed-out users", async () => {
        await request(app).get("/api/resumes").expect(401);
    });

    it("logs in with the right password only", async () => {
        await signUp();
        await request(app).post("/api/auth/login").send({email: "a@example.com", password: "wrong-password"}).expect(401);
        await request(app).post("/api/auth/login").send({email: "A@example.com", password: "password123"}).expect(200);
    });

    it("never returns the password hash", async () => {
        const agent = await signUp();
        const res = await agent.get("/api/auth/me").expect(200);
        expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });
});

describe("resumes", () => {
    it("queues a new resume and returns before analysis runs", async () => {
        const agent = await signUp();
        const res = await uploadResume(agent).expect(202);
        expect(res.body.resume.status).toBe("queued");
        expect(queued).toEqual([res.body.resume.id]);
    });

    it("rejects a file that is not a PDF", async () => {
        const agent = await signUp();
        await agent.post("/api/resumes")
            .attach("resume", Buffer.from("not a pdf"), "resume.pdf")
            .attach("image", png, "resume.png")
            .expect(400);
    });

    it("hides one user's resume and files from another user", async () => {
        const owner = await signUp();
        const {body} = await uploadResume(owner).expect(202);
        const other = await signUp("b@example.com");
        await other.get(`/api/resumes/${body.resume.id}`).expect(404);
        await other.get(`/api/resumes/${body.resume.id}/file`).expect(404);
        await owner.get(`/api/resumes/${body.resume.id}/file`).expect(200);
    });

    it("processes a job and validates the feedback", async () => {
        const agent = await signUp();
        const {body} = await uploadResume(agent).expect(202);
        await processResume(body.resume.id);
        const res = await agent.get(`/api/resumes/${body.resume.id}`).expect(200);
        expect(res.body.resume.status).toBe("completed");
        expect(feedbackSchema.safeParse(res.body.resume.feedback).success).toBe(true);
    });

    it("reuses a result without queueing for the same resume and job", async () => {
        const agent = await signUp();
        const first = await uploadResume(agent).expect(202);
        await processResume(first.body.resume.id);
        queued = [];
        const second = await uploadResume(agent).expect(200);
        expect(second.body.resume.status).toBe("completed");
        expect(queued).toEqual([]);
        await uploadResume(agent, "Different job").expect(202);
    });

    it("marks the resume failed when the queue is down", async () => {
        const agent = await signUp();
        queueDown = true;
        await uploadResume(agent).expect(503);
        const list = await agent.get("/api/resumes").expect(200);
        expect(list.body.resumes[0].status).toBe("failed");
    });

    it("does not overwrite a completed result when a late failure arrives", async () => {
        const agent = await signUp();
        const {body} = await uploadResume(agent).expect(202);
        await processResume(body.resume.id);
        await markFailed(body.resume.id);
        const res = await agent.get(`/api/resumes/${body.resume.id}`).expect(200);
        expect(res.body.resume.status).toBe("completed");
    });

    it("rejects AI output that breaks the schema", () => {
        expect(feedbackSchema.safeParse({overallScore: 500}).success).toBe(false);
    });

    it("deletes only the current user's data", async () => {
        const owner = await signUp();
        await uploadResume(owner).expect(202);
        const other = await signUp("b@example.com");
        await uploadResume(other).expect(202);
        await owner.delete("/api/resumes").expect(204);
        expect((await owner.get("/api/resumes")).body.resumes).toHaveLength(0);
        expect((await other.get("/api/resumes")).body.resumes).toHaveLength(1);
    });
});
