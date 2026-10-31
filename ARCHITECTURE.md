# Architecture

This project extends the [JS Mastery AI Resume Analyzer](https://github.com/adrianhajdin/ai-resume-analyzer) tutorial. The original app ran auth, storage, and AI calls in the browser through Puter.js. This version moves them to a backend.

```
Browser -> nginx (frontend container) -> Express API -> MongoDB
                                             |      -> shared uploads volume
                                             v
                                       Redis (BullMQ)
                                             |
                                             v
                                           Worker -> OpenAI
```

## Upload flow

1. The browser turns page 1 of the PDF into a PNG preview.
2. The API checks the session, rate limit, and file types.
3. The API saves both files and creates a MongoDB record.
4. If the same user already analyzed the same PDF and job details, the API reuses that result.
5. Otherwise, the API queues a job and returns `202 Accepted`.
6. The worker calls OpenAI, validates the JSON with Zod, and saves the result.
7. The browser polls `GET /api/resumes/:id` every 2 seconds until the job finishes.

## Design decisions

| Decision | Why | Tradeoff |
|---|---|---|
| Backend instead of browser AI calls | Keeps the API key secret and enforces limits on the server | More services to run |
| Queue and worker | AI calls are slow, so web requests stay short and workers scale separately | Adds Redis and polling |
| 3 attempts with exponential backoff | Handles temporary AI failures and invalid output | A failed job takes longer to report |
| `jobId` equals the resume ID | Stops the same resume being queued twice | Only covers duplicate queueing |
| Result reuse by SHA-256 hash | Avoids paying twice for identical input | Same-user only, so less reuse |
| JWT in an `httpOnly` cookie | Page scripts cannot read the token | Logout does not revoke copied tokens before expiry |
| Hourly rate limit per user | Limits AI cost and abuse | The limit lives in API memory, so each API instance counts separately |
| Local shared volume for files | Simple to run | Works on one host only; use S3 for several hosts |

## If a worker crashes

BullMQ detects the stalled job and gives it to another worker. The job can run again, so `processResume` skips work that is already complete. After 3 failed attempts, the record is marked `failed`.

## Run it

Create `.env` from `.env.example`, then run:

```bash
docker compose up --build
```

Open http://localhost:8080. To add workers:

```bash
docker compose up --scale worker=3
```

## Test it

```bash
cd server
npm test
```
