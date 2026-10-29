# Demo script (2–3 minutes, for the video or live pitch)

**Setup:** run `run.bat`, then `node tools/seed_demo.js`. Put the ASHA app (phone, or Chrome DevTools mobile view) and the dashboard side by side. In the app, open Settings and tap "डेमो रीसेट" for a fresh start.

| Time | Who | What to show | What to say |
|---|---|---|---|
| 0:00 | Lokesh | Dashboard | "This is the PHC Medical Officer's screen. Three ASHAs have already synced visits. Red cases are on top, with the reason." |
| 0:20 | Parth | App home | "This is Sunanda tai, an ASHA in Babulde. She has 6 families. She has no network right now." Tap the **ऑनलाइन** pill so it turns **ऑफ़लाइन**. |
| 0:35 | Parth | Sunita Bhil → 🎤 | Tap the mic and speak in Marathi: *"सात महिने, पायांवर सूज, दोन दिवसांपासून डोकं दुखतंय, बीपी 150/100"*. (If there's no internet for voice, tap the **मराठी: BP जास्त** chip.) |
| 0:55 | Lokesh | Red result | "In 2 seconds, with no internet, the app says RED, refer today: high BP with headache and swelling, possible pre-eclampsia. The reason is in Hindi and English, and it can be read aloud." Tap **🔊 सुनें**. |
| 1:15 | Parth | Save → referral slip | "She saves it. A referral slip is ready to show at the PHC. The top bar says 2 records are waiting to sync, safe on the phone." |
| 1:30 | Parth | Tap the pill back to online | "The moment network comes back, it syncs automatically." |
| 1:40 | Lokesh | Dashboard | Within 4 seconds a red pop-up appears: **New RED case: Sunita Bhil**. "The doctor knows before the woman even reaches the PHC. The alert log shows the SMS to the Medical Officer and ANM." Change the status to **Called**. |
| 2:00 | Lokesh | Second case (Hindi typed) | Open Pooja Pawara (17 yrs) and type *"5 mahine, hb 8.2, sujan nahi"*. It shows AMBER: moderate anaemia plus teenage pregnancy. "It also understands 'sujan nahi', meaning no swelling." |
| 2:20 | Lokesh | Close | "One ASHA covers ~40 at-risk women and children. ASHA Saathi turns paper and memory into early alerts, in her own language, with no internet." |

Judges may ask about speech offline, SMS, ML or privacy: see "Honest limits" in README.md.
