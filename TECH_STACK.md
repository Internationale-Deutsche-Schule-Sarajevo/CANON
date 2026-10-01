# TECH_STACK.md — Complete Technology Specification
# IDSS Handbook Web Application
# Version 1.0 — June 2026

---

## Approved Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js App Router | Latest stable |
| Language | TypeScript strict | `"strict": true` in tsconfig |
| UI Components | Shadcn/ui | Tailwind-based, copy into project |
| Styling | Tailwind CSS v4 | Tokens in `globals.css` — see DESIGN_SYSTEM.md |
| 3D Rendering | Three.js `0.160.0` | Via CDN importmap — see DESIGN_SYSTEM.md |
| Animation | GSAP `3.12.5` | Via CDN |
| Sound | Howler.js `2.2.4` | Via CDN |
| Forms | React Hook Form + Zod Resolver | Standard form pattern |
| Database | Supabase PostgreSQL + pgvector | Existing project from `.env` |
| File Storage | Supabase Storage | Role-scoped buckets |
| Realtime | Supabase Realtime | Document status, notifications |
| Auth | Supabase Auth | Email + password only |
| AI Generation | `gemini-2.5-flash` | See AI section below |
| AI Embeddings | `text-embedding-004` | See AI section below |
| API Key Rotation | GeminiKeyManager (8 keys) | See AI section below |
| OCR | OCR.Space API | 25k req/month, 1MB limit |
| Email | Resend | 3,000/month free |
| Rate Limiting | Upstash Redis | 500K commands/month |
| Background Jobs | Upstash QStash | Long-running pipelines |
| Error Tracking | Sentry | From Phase 1 |
| LLM Monitoring | Maxim AI + Langtrace | Chatbot quality and token usage |
| Secrets | Infisical or Dotenv Vault | 5 devs free |
| DOCX Export | `docx` npm package | IDSS memorandum template |
| Hosting | Vercel | Free tier, Next.js native |

---

## AI Provider — Exact Specification

### Generation Model

| Parameter | Value |
|---|---|
| Exact API string | `gemini-2.5-flash` |
| Endpoint | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent` |
| Temperature — factual | `0.3` |
| Temperature — creative | `0.7` |
| max_output_tokens — short | `512` (chatbot greetings, simple facts) |
| max_output_tokens — medium | `2048` (quiz questions, summaries) |
| max_output_tokens — long | `8192` (chapter generation, DOCX content) |

**FORBIDDEN model strings — never use:**
`gemini-2.0-flash` · `gemini-2.0-flash-exp` · `gemini-flash-2.0` ·
`gemini-1.5-pro` · `gemini-pro` · any string containing `2.0`

### Embedding Model

| Parameter | Value |
|---|---|
| Exact API string | `text-embedding-004` |
| Endpoint | `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent` |
| Output dimension | `768` — fixed, never change |
| Task type — indexing | `RETRIEVAL_DOCUMENT` |
| Task type — query | `RETRIEVAL_QUERY` |
| Batch size | Max 100 texts per call |

### 8-Key Rotation (GeminiKeyManager)

Environment variables:
```
GEMINI_API_KEY_1 through GEMINI_API_KEY_8
```

Algorithm: round-robin rotation.
On HTTP 429: mark key throttled, rotate immediately to next key.
Throttle release: 65 seconds after throttle timestamp.
All keys throttled: FIFO queue, max 120 second wait.
Non-429 errors: do NOT rotate, throw to caller immediately.
Same key pool for both generation and embedding calls.

---

## Forbidden Technologies

Never introduce these without written approval in `DECISION_LOG.md`:

| Technology | Reason |
|---|---|
| Redux, MobX, Zustand | Use Server Components → Server Actions → Context → useState |
| Prisma | Use Supabase client directly |
| styled-components, emotion | Use Tailwind CSS |
| Pages Router | Use App Router only |
| React Query / TanStack Query | Use Supabase real-time hooks |
| Moment.js | Use `date-fns` or native `Intl` API |
| axios | Use native `fetch` |
| Any additional UI component library | Shadcn/ui only |
| MongoDB | Use PostgreSQL |
| Pinecone, Weaviate | Use pgvector (sufficient for this scale) |

---

## Environment Variables

All in `.env` — never commit.
All keys (placeholder only) in `.env.example` — always commit.

Required variables:
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI Provider
AI_PROVIDER=gemini
GEMINI_API_KEY_1=
GEMINI_API_KEY_2=
GEMINI_API_KEY_3=
GEMINI_API_KEY_4=
GEMINI_API_KEY_5=
GEMINI_API_KEY_6=
GEMINI_API_KEY_7=
GEMINI_API_KEY_8=

# Email
RESEND_API_KEY=
RESEND_FROM_EMAIL=

# Rate limiting
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Background jobs
QSTASH_URL=
QSTASH_TOKEN=

# OCR
OCR_SPACE_API_KEY=

# Error tracking
SENTRY_DSN=

# LLM monitoring
MAXIM_API_KEY=
LANGTRACE_API_KEY=
```

---

*IDSS Handbook Tech Stack v1.0 — P.U. IDSS Sarajevo*
