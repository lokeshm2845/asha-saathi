"""ASHA Saathi PHC server: receives offline-synced data from ASHA phones and serves the
Medical Officer dashboard.  Run:  python -m uvicorn backend.main:app --port 8000

Env:
  DATABASE_URL / POSTGRES_URL  use Postgres (e.g. Neon on Vercel) instead of SQLite
  DB_PATH                      SQLite file (default data/asha_saathi.db; /tmp on Vercel)
  SEED_DEMO=1                  load backend/demo_seed.json when the database is empty (default on Vercel)
"""
import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
ON_VERCEL = bool(os.environ.get("VERCEL"))
def _postgres_url():
    # Neon / Vercel Postgres set DATABASE_URL or POSTGRES_URL, or <PREFIX>_URL if a custom prefix was chosen.
    for key in ("DATABASE_URL", "POSTGRES_URL"):
        if os.environ.get(key):
            return os.environ[key]
    for key, val in sorted(os.environ.items()):
        if key.endswith("_URL") and "UNPOOLED" not in key and val.startswith(("postgres://", "postgresql://")):
            return val
    return None


PG_URL = _postgres_url()
SEED = os.environ.get("SEED_DEMO", "1" if ON_VERCEL else "0") == "1"
# Vercel functions can only write to /tmp, and that disk is temporary.
DB = Path(os.environ.get("DB_PATH", "/tmp/asha_saathi.db" if ON_VERCEL else ROOT / "data" / "asha_saathi.db"))

if PG_URL:
    import psycopg
    from psycopg.rows import dict_row
else:
    DB.parent.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="ASHA Saathi PHC API")


class _Conn:
    """Runs the same '?'-style SQL on SQLite or Postgres."""

    def __init__(self, con):
        self.con = con

    def execute(self, sql, params=()):
        return self.con.execute(sql.replace("?", "%s") if PG_URL else sql, params)

    def value(self, sql, params=()):
        return self.execute(sql, params).fetchone()["n"]


@contextmanager
def db():
    if PG_URL:
        con = psycopg.connect(PG_URL, row_factory=dict_row)
    else:
        con = sqlite3.connect(DB)
        con.row_factory = sqlite3.Row
    try:
        yield _Conn(con)
        con.commit()
    finally:
        con.close()


with db() as con:
    con.execute("""CREATE TABLE IF NOT EXISTS beneficiaries (id TEXT PRIMARY KEY, asha_id TEXT, asha_name TEXT, village TEXT,
        type TEXT, name TEXT, data TEXT, updated_at TEXT)""")
    con.execute("""CREATE TABLE IF NOT EXISTS visits (id TEXT PRIMARY KEY, beneficiary_id TEXT, asha_id TEXT, level TEXT,
        created_at TEXT, synced_at TEXT, status TEXT DEFAULT 'New', data TEXT)""")
    con.execute(f"""CREATE TABLE IF NOT EXISTS alerts (id {'SERIAL PRIMARY KEY' if PG_URL else 'INTEGER PRIMARY KEY AUTOINCREMENT'},
        visit_id TEXT, sent_at TEXT, recipient TEXT, message TEXT)""")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Asha(BaseModel):
    id: str
    name: str
    village: str = ""
    phc: str = ""


class SyncIn(BaseModel):
    asha: Asha
    beneficiaries: list[dict] = []
    visits: list[dict] = []


@app.post("/api/sync")
def sync(body: SyncIn):
    alerts = 0
    with db() as con:
        for b in body.beneficiaries:
            con.execute("""INSERT INTO beneficiaries VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET data=excluded.data, name=excluded.name, village=excluded.village, updated_at=excluded.updated_at""",
                        (b["id"], body.asha.id, body.asha.name, b.get("village", body.asha.village), b.get("type"), b.get("name"), json.dumps(b), now()))
        for v in body.visits:
            new = con.execute("SELECT 1 FROM visits WHERE id=?", (v["id"],)).fetchone() is None
            con.execute("""INSERT INTO visits (id, beneficiary_id, asha_id, level, created_at, synced_at, data) VALUES (?,?,?,?,?,?,?)
                ON CONFLICT(id) DO NOTHING""",
                        (v["id"], v["beneficiaryId"], body.asha.id, v["level"], v["createdAt"], now(), json.dumps(v)))
            if new and v["level"] == "RED":
                ben = con.execute("SELECT name, village FROM beneficiaries WHERE id=?", (v["beneficiaryId"],)).fetchone()
                who = f"{ben['name']}, {ben['village']}" if ben else "beneficiary"
                reason = v["reasons"][0]["en"] if v.get("reasons") else "danger sign"
                msg = f"ASHA Saathi RED alert: {who}. {reason}. ASHA {body.asha.name}. Please expect referral today."
                # Prototype: alert is logged here; production sends it through an SMS / WhatsApp gateway.
                con.execute("INSERT INTO alerts (visit_id, sent_at, recipient, message) VALUES (?,?,?,?)",
                            (v["id"], now(), "Medical Officer + ANM", msg))
                alerts += 1
    return {"ok": True, "beneficiaries": len(body.beneficiaries), "visits": len(body.visits), "alerts": alerts}


def seed_demo():
    """Hosted demos lose their data on restart, so they reload fictional demo visits when empty."""
    with db() as con:
        if con.value("SELECT COUNT(*) AS n FROM visits"):
            return
    for p in json.loads((ROOT / "backend" / "demo_seed.json").read_text(encoding="utf8")):
        for v in p["visits"]:
            v["createdAt"] = (datetime.now(timezone.utc) - timedelta(hours=v.get("hoursAgo", 0))).isoformat(timespec="seconds")
        sync(SyncIn(**p))


if SEED:
    seed_demo()

LATEST = "v.created_at = (SELECT MAX(created_at) FROM visits v2 WHERE v2.beneficiary_id = v.beneficiary_id)"


@app.get("/api/cases")
def cases():
    """Latest visit per beneficiary, highest risk first."""
    with db() as con:
        rows = con.execute(f"""
            SELECT v.*, b.name, b.type, b.village, b.asha_name, b.data AS bdata FROM visits v
            JOIN beneficiaries b ON b.id = v.beneficiary_id
            WHERE {LATEST}
            ORDER BY CASE v.level WHEN 'RED' THEN 0 WHEN 'AMBER' THEN 1 ELSE 2 END, v.created_at DESC""").fetchall()
    out = []
    for r in rows:
        d, b = json.loads(r["data"]), json.loads(r["bdata"])
        out.append({"visitId": r["id"], "name": r["name"], "type": r["type"], "village": r["village"], "asha": r["asha_name"],
                    "level": r["level"], "status": r["status"], "createdAt": r["created_at"], "syncedAt": r["synced_at"],
                    "reasons": d.get("reasons", []), "transcript": d.get("transcript", ""), "fields": d.get("fields", {}),
                    "age": b.get("age"), "ageMonths": b.get("ageMonths"), "gestWeeks": b.get("gestWeeks")})
    return out


def _sum(level):
    return f"SUM(CASE WHEN v.level='{level}' THEN 1 ELSE 0 END)"


@app.get("/api/summary")
def summary():
    with db() as con:
        c = {r["level"]: r["n"] for r in con.execute(f"SELECT v.level, COUNT(*) AS n FROM visits v WHERE {LATEST} GROUP BY v.level").fetchall()}
        villages = [{"village": r["village"], "red": int(r["red"]), "amber": int(r["amber"]), "green": int(r["green"])}
                    for r in con.execute(f"""SELECT b.village, {_sum('RED')} AS red, {_sum('AMBER')} AS amber, {_sum('GREEN')} AS green
            FROM visits v JOIN beneficiaries b ON b.id = v.beneficiary_id WHERE {LATEST} GROUP BY b.village ORDER BY red DESC""").fetchall()]
        alerts = [dict(r) for r in con.execute("SELECT * FROM alerts ORDER BY id DESC LIMIT 20").fetchall()]
        return {
            "registered": con.value("SELECT COUNT(*) AS n FROM beneficiaries"),
            "pregnant": con.value("SELECT COUNT(*) AS n FROM beneficiaries WHERE type='pregnant'"),
            "children": con.value("SELECT COUNT(*) AS n FROM beneficiaries WHERE type='child'"),
            "ashas": con.value("SELECT COUNT(DISTINCT asha_id) AS n FROM beneficiaries"),
            "visits": con.value("SELECT COUNT(*) AS n FROM visits"),
            "red": c.get("RED", 0), "amber": c.get("AMBER", 0), "green": c.get("GREEN", 0),
            "openReferrals": con.value("SELECT COUNT(*) AS n FROM visits WHERE level='RED' AND status NOT IN ('Closed','Reached PHC')"),
            "villages": villages, "alerts": alerts,
        }


class StatusIn(BaseModel):
    status: str


@app.patch("/api/visits/{visit_id}")
def set_status(visit_id: str, body: StatusIn):
    if body.status not in {"New", "Called", "Reached PHC", "Closed"}:
        raise HTTPException(400, "bad status")
    with db() as con:
        if con.execute("UPDATE visits SET status=? WHERE id=?", (body.status, visit_id)).rowcount == 0:
            raise HTTPException(404, "visit not found")
    return {"ok": True}


@app.post("/api/demo/reset")
def reset():
    with db() as con:
        for t in ("alerts", "visits", "beneficiaries"):
            con.execute(f"DELETE FROM {t}")
    if SEED:
        seed_demo()
    return {"ok": True}


@app.get("/api/health")
def health():
    return {"ok": True, "database": "postgres" if PG_URL else ("sqlite-tmp" if ON_VERCEL else "sqlite"), "seedDemo": SEED}


# Serves the landing page, ASHA app (/app/) and dashboard (/dashboard/); on Vercel too (see vercel.json).
if (ROOT / "web").is_dir():
    app.mount("/", StaticFiles(directory=ROOT / "web", html=True), name="web")
