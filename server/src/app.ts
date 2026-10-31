import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import express, {type NextFunction, type Request, type Response} from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import multer from "multer";
import {z} from "zod";
import {config} from "./config";
import {Resume, User} from "./models";

const COOKIE = "session";
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const credentialsSchema = z.object({
    email: z.string().email().max(254),
    password: z.string().min(8).max(72),
});

const resumeFieldsSchema = z.object({
    companyName: z.string().max(200).default(""),
    jobTitle: z.string().max(200).default(""),
    jobDescription: z.string().max(20_000).default(""),
});

type AuthedRequest = Request & { userId: string };

const startSession = (res: Response, userId: string) => {
    const token = jwt.sign({}, config.jwtSecret(), {subject: userId, expiresIn: "7d"});
    res.cookie(COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: config.cookieSecure,
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
};

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    try {
        const payload = jwt.verify(req.cookies[COOKIE] ?? "", config.jwtSecret());
        (req as AuthedRequest).userId = payload.sub as string;
        next();
    } catch {
        res.status(401).json({error: "Please log in."});
    }
};

const toClient = (resume: InstanceType<typeof Resume>) => ({
    id: resume.id,
    companyName: resume.companyName,
    jobTitle: resume.jobTitle,
    status: resume.status,
    feedback: resume.feedback,
    error: resume.error,
    imageUrl: `/api/resumes/${resume.id}/image`,
    resumeUrl: `/api/resumes/${resume.id}/file`,
});

const removeFiles = async (files: string[]) => {
    await Promise.all(files.map((file) => fs.rm(path.join(config.uploadDir, file), {force: true})));
};

export const createApp = (enqueue: (resumeId: string) => Promise<void>) => {
    const app = express();
    // The API sits behind one proxy (nginx), so rate limits see real client IPs.
    app.set("trust proxy", 1);
    app.use(express.json());
    app.use(cookieParser());

    const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: MAX_FILE_BYTES}}).fields([
        {name: "resume", maxCount: 1},
        {name: "image", maxCount: 1},
    ]);

    const authLimiter = rateLimit({windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false});
    const analysisLimiter = rateLimit({
        windowMs: 60 * 60 * 1000,
        limit: config.analysesPerHour,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => (req as AuthedRequest).userId,
        message: {error: "Hourly analysis limit reached. Please try again later."},
    });

    app.get("/api/health", (_req, res) => {
        res.json({status: mongoose.connection.readyState === 1 ? "ok" : "starting"});
    });

    app.post("/api/auth/register", authLimiter, async (req, res) => {
        const parsed = credentialsSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({error: "Enter a valid email and a password of 8-72 characters."});
            return;
        }
        const email = parsed.data.email.toLowerCase();
        if (await User.exists({email})) {
            res.status(409).json({error: "That email is already registered."});
            return;
        }
        const user = await User.create({email, passwordHash: await bcrypt.hash(parsed.data.password, 12)});
        startSession(res, user.id);
        res.status(201).json({user: {id: user.id, email: user.email}});
    });

    app.post("/api/auth/login", authLimiter, async (req, res) => {
        const parsed = credentialsSchema.safeParse(req.body);
        const user = parsed.success ? await User.findOne({email: parsed.data.email.toLowerCase()}) : null;
        if (!parsed.success || !user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
            res.status(401).json({error: "Wrong email or password."});
            return;
        }
        startSession(res, user.id);
        res.json({user: {id: user.id, email: user.email}});
    });

    app.post("/api/auth/logout", (_req, res) => {
        res.clearCookie(COOKIE);
        res.status(204).end();
    });

    app.get("/api/auth/me", requireAuth, async (req, res) => {
        const user = await User.findById((req as AuthedRequest).userId);
        if (!user) {
            res.status(401).json({error: "Please log in."});
            return;
        }
        res.json({user: {id: user.id, email: user.email}});
    });

    app.get("/api/resumes", requireAuth, async (req, res) => {
        const resumes = await Resume.find({userId: (req as AuthedRequest).userId}).sort({createdAt: -1}).limit(100);
        res.json({resumes: resumes.map(toClient)});
    });

    app.post("/api/resumes", requireAuth, analysisLimiter, upload, async (req, res) => {
        const files = req.files as Record<string, Express.Multer.File[]> | undefined;
        const pdf = files?.resume?.[0];
        const image = files?.image?.[0];
        const fields = resumeFieldsSchema.safeParse(req.body);

        if (!pdf || pdf.buffer.subarray(0, 5).toString() !== "%PDF-") {
            res.status(400).json({error: "Upload a PDF resume."});
            return;
        }
        if (!image || image.buffer.subarray(1, 4).toString() !== "PNG") {
            res.status(400).json({error: "A PNG preview image is required."});
            return;
        }
        if (!fields.success) {
            res.status(400).json({error: "The job details are too long."});
            return;
        }

        const userId = (req as AuthedRequest).userId;
        const contentHash = crypto.createHash("sha256")
            .update(pdf.buffer)
            .update(`\0${fields.data.jobTitle}\0${fields.data.jobDescription}\0${config.aiProvider}:${config.openAiModel}`)
            .digest("hex");

        const id = crypto.randomUUID();
        const resumeFile = `${id}.pdf`;
        const imageFile = `${id}.png`;
        await fs.mkdir(config.uploadDir, {recursive: true});
        await fs.writeFile(path.join(config.uploadDir, resumeFile), pdf.buffer);
        await fs.writeFile(path.join(config.uploadDir, imageFile), image.buffer);

        // The same resume and job reuse the earlier result, which avoids paying for another AI call.
        const cached = await Resume.findOne({userId, contentHash, status: "completed"});
        const resume = await Resume.create({
            ...fields.data,
            userId,
            resumeFile,
            imageFile,
            contentHash,
            status: cached ? "completed" : "queued",
            feedback: cached?.feedback ?? null,
        });

        if (!cached) {
            try {
                await enqueue(resume.id);
            } catch (err) {
                console.error("Could not queue analysis:", err);
                resume.status = "failed";
                resume.error = "The analysis service is unavailable. Please try again.";
                await resume.save();
                res.status(503).json({error: resume.error});
                return;
            }
        }
        res.status(cached ? 200 : 202).json({resume: toClient(resume)});
    });

    const findOwned = async (req: Request) => {
        if (!mongoose.isValidObjectId(req.params.id)) return null;
        return Resume.findOne({_id: req.params.id, userId: (req as AuthedRequest).userId});
    };

    app.get("/api/resumes/:id", requireAuth, async (req, res) => {
        const resume = await findOwned(req);
        if (!resume) {
            res.status(404).json({error: "Resume not found."});
            return;
        }
        res.json({resume: toClient(resume)});
    });

    const sendStored = (field: "resumeFile" | "imageFile", type: string) => async (req: Request, res: Response) => {
        const resume = await findOwned(req);
        if (!resume) {
            res.status(404).json({error: "Resume not found."});
            return;
        }
        res.type(type).sendFile(path.resolve(config.uploadDir, resume[field]));
    };
    app.get("/api/resumes/:id/file", requireAuth, sendStored("resumeFile", "application/pdf"));
    app.get("/api/resumes/:id/image", requireAuth, sendStored("imageFile", "image/png"));

    app.delete("/api/resumes", requireAuth, async (req, res) => {
        const userId = (req as AuthedRequest).userId;
        const resumes = await Resume.find({userId});
        await removeFiles(resumes.flatMap((resume) => [resume.resumeFile, resume.imageFile]));
        await Resume.deleteMany({userId});
        res.status(204).end();
    });

    app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
        if (err instanceof multer.MulterError) {
            res.status(400).json({error: err.code === "LIMIT_FILE_SIZE" ? "Files must be 20 MB or smaller." : err.message});
            return;
        }
        console.error(err);
        res.status(500).json({error: "Something went wrong."});
    });

    return app;
};
