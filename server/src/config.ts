const required = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing environment variable: ${name}`);
    return value;
};

export const config = {
    port: Number(process.env.PORT ?? 4000),
    mongoUrl: process.env.MONGO_URL ?? "mongodb://localhost:27017/resumind",
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    uploadDir: process.env.UPLOAD_DIR ?? "uploads",
    cookieSecure: process.env.COOKIE_SECURE === "true",
    aiProvider: process.env.AI_PROVIDER ?? "openai",
    openAiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    analysesPerHour: Number(process.env.ANALYSES_PER_HOUR ?? 10),
    jwtSecret: () => required("JWT_SECRET"),
    openAiKey: () => required("OPENAI_API_KEY"),
};
