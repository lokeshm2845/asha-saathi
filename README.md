# ASHA Saathi: prototype

Voice-first, offline AI co-pilot for ASHA workers. Team VictoryVerse, SVKM's NMIMS MPSTME Shirpur.
SEVA FIRST Innovation Challenge 2026, Theme 2, REG-003-OP.

Two parts:

| Part | URL | Who uses it |
|---|---|---|
| ASHA mobile app (installable PWA, works offline) | `/app/` | ASHA worker on her phone |
| PHC dashboard | `/dashboard/` | Medical Officer / ANM on a laptop |

## Run it

Needs Python 3.10+ and Node.js (Node is only for tests and demo data).

```bat
run.bat
```

or manually:

```bash
pip install -r requirements.txt
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000/app/ and http://localhost:8000/dashboard/ in **Chrome or Edge** (needed for voice input).

Fill the dashboard with fictional demo cases from 3 other villages (server must be running):

```bash
node tools/seed_demo.js
```

Run the risk-engine tests:

```bash
node --test tests/engine.test.js
```

## Deploy on Vercel (live demo)

1. Import this GitHub repo at vercel.com/new (Framework preset: **Other**, no build command). `vercel.json` routes `/api/*` to the FastAPI function in `api/index.py` and serves `web/` as static files.
2. Add a database so the ASHA app and the dashboard share data: in the Vercel project open **Storage → Create → Neon (Postgres) → Connect**. This sets `DATABASE_URL` automatically. Redeploy after connecting.
3. Open `https://<project>.vercel.app/dashboard/` and `https://<project>.vercel.app/app/`.

On Vercel the server fills itself with fictional demo cases when the database is empty (`SEED_DEMO`, on by default there). Without a database it falls back to a temporary SQLite file in `/tmp`, which each serverless instance keeps separately, so connect Neon for a reliable demo. There is no login yet: everything on the hosted demo is fictional, so don't enter real patient data.

## Open the app on a real phone

Voice input and offline install only work over **https** (or on localhost). The Vercel link is already https. For a laptop-hosted demo, use ngrok:

```bash
ngrok http 8000
```

Open the `https://….ngrok-free.app/app/` link on the phone in Chrome, then use the menu: **Add to Home screen**. It now opens like an app and works without network.

## What works

- Register pregnant women and children (6 demo families are preloaded)
- Speak a visit in **Marathi, Hindi or English** (Chrome speech recognition) or type it / tap a sample
- Extracts weeks of pregnancy, BP, Hb, MUAC, weight and 15 danger signs, including negation ("sujan nahi")
- Risk engine: RED / AMBER / GREEN with reasons in Hindi + English, based on MoHFW danger signs, Anemia Mukt Bharat Hb cut-offs and MUAC cut-offs
- Read-aloud of the result, printable referral slip, follow-up date
- **Offline**: tap the "ऑनलाइन" pill to simulate no network. Visits are stored on the phone and synced automatically when back online
- PHC dashboard: live high-risk list, filters, risk by village, referral status (New / Called / Reached PHC / Closed), log of RED alerts to the Medical Officer + ANM

## Honest limits (say these if judges ask)

- Speech-to-text in the prototype uses the browser's built-in recognition, which needs internet. Typed input and the whole risk engine work fully offline. The plan replaces it with an on-device AI4Bharat IndicConformer model.
- SMS alerts are logged on the dashboard, not actually sent. Production would use an SMS gateway (MSG91 / Twilio).
- Rules cover a subset of MoHFW guidance and must be reviewed by our clinical advisor. The ML model is planned (days 21–45).
- No login / encryption yet. Demo data is fictional.

## Structure

```
backend/main.py          FastAPI server (SQLite locally, Postgres via DATABASE_URL)
backend/demo_seed.json   fictional demo cases for hosted demos
api/index.py             Vercel serverless entry point
vercel.json              Vercel routing (API function + static web/)
web/shared/engine.js     extraction + risk rules (shared by app, tests, seed script)
web/app/                 ASHA PWA (index.html, app.js, app.css, sw.js)
web/dashboard/           PHC dashboard
tests/engine.test.js     10 tests (Hinglish, Devanagari, Marathi, negation, child MUAC)
tools/seed_demo.js       fictional demo data for the dashboard
```
