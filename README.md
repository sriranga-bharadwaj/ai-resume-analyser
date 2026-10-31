# Resumind

An AI resume analyzer. Upload a PDF resume with job details to get an estimated ATS score and feedback on tone, content, structure, and skills.

Scores are AI estimates, not results from a real applicant tracking system.

## Features

- Email and password accounts
- PDF upload with a preview image
- Background analysis through a job queue, with automatic retries
- Validation of AI output before it is saved
- Reuse of earlier results for identical uploads
- Per-user hourly analysis limit
- History of past analyses

## Tech stack

- **Frontend:** React, React Router, TypeScript, Tailwind CSS, Zustand, PDF.js
- **Backend:** Node.js, Express, Multer, Zod
- **Data and jobs:** MongoDB, Mongoose, Redis, BullMQ
- **AI:** OpenAI
- **Infrastructure:** Docker Compose, nginx
- **Testing:** Vitest, Supertest

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design and tradeoffs.

## Run with Docker

You need [Docker](https://www.docker.com/) and, for real analysis, an OpenAI API key.

1. Copy `.env.example` to `.env`.
2. Set `JWT_SECRET` to a long random value.
3. Set `OPENAI_API_KEY`. To run without a key, set `AI_PROVIDER=mock` instead. Mock scores are not real.
4. Start the app:

```bash
docker compose up --build
```

5. Open http://localhost:8080.

## Run the tests

```bash
cd server
npm install
npm test
```

## Acknowledgements

The frontend UI started from a JavaScript Mastery project.
