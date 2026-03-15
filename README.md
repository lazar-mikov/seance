# HAUNTED — Multiplayer Séance App

> *You never know if the next heartbeat comes.*

Real-time WebSocket app for the HAUNTED horror short film (DFFB / Medienboard Berlin-Brandenburg). Five participants hold a button simultaneously on their phones to keep a ghost alive on a central display. One person lets go. The channel closes.

---

## Architecture

```
server.js          — Node.js + Express + Socket.io
public/
  index.html       — Landing / role selector
  phone.html       — Participant phone interface
  screen.html      — Central TV display
```

**Two client types:**
- `phone` — registers with a name, holds/releases a button
- `screen` — receives all state updates, renders EKG + participant data

**Server state machine:**
- `waiting` → participants join (up to 5)
- `active` → all 5 holding simultaneously triggers activation
- `flatlined` → any participant releases during active session

---

## Run Locally

```bash
npm install
node server.js
# → http://localhost:3000
```

Open `http://localhost:3000/screen.html` on the TV/projector.  
Open `http://localhost:3000/phone.html` on each of the five phones (must be on same network).

---

## Deploy to Railway (Recommended for Production)

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select this repo — Railway auto-detects Node.js
4. Add env var: `PORT` is handled automatically by Railway
5. Get your public URL (e.g. `https://haunted-production.up.railway.app`)
6. Generate QR codes pointing to `your-url/phone.html` for the five participants
7. Open `your-url/screen.html` on the central display

**Free tier works fine for a film shoot.**

---

## Deploy to Render

1. New Web Service → Connect GitHub repo
2. Build Command: `npm install`
3. Start Command: `node server.js`
4. Instance Type: Free

---

## On-Set Setup

```
Venue Wi-Fi or mobile hotspot
      │
      ├── TV/Projector → screen.html
      ├── Phone 1      → phone.html
      ├── Phone 2      → phone.html
      ├── Phone 3      → phone.html
      ├── Phone 4      → phone.html
      └── Phone 5      → phone.html
```

**For maximum reliability on set:** run server on a laptop on the same Wi-Fi. Use local IP (e.g. `http://192.168.1.42:3000`). No internet dependency.

To find your local IP:
```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig | findstr "IPv4"
```

Then QR-code `http://192.168.1.42:3000/phone.html`.

---

## Session Reset

On the central screen display, there is a small RESET SESSION button (bottom-left, faint). Clicking it resets all connected clients and reloads. Useful between takes.

---

## Presence → BPM Mapping

| Holding | BPM |
|---------|-----|
| 0 | — (flatline) |
| 1 | 42 |
| 2 | 55 |
| 3 | 68 |
| 4 | 82 |
| 5 | 78 (stable) |

The 5-person BPM is intentionally slightly lower than 4 — the ghost is calm when fully connected.

---

## Customization

**Change the max participants:**  
Edit `MAX_PARTICIPANTS` in `server.js` (currently 5).

**Change BPM values:**  
Edit `getBpmFromPresence()` in `screen.html`.

**Change the EKG waveform:**  
Edit `ekgSample()` in `screen.html`. The current function produces a standard P-QRS-T medical waveform.

---

*HAUNTED (2026) — DFFB Berlin / Medienboard Berlin-Brandenburg*
