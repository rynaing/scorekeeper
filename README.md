# Scorekeeper

The couch scoreboard for card & board games. Host screen + phone players, live-synced via Supabase.

**Live:** https://rynaing.github.io/scorekeeper/

## How it works
1. Someone taps **New table** on the big screen → gets a 4-letter code + QR code.
2. Players scan the QR (or enter the code) and join with a name.
3. Tap a player to select them, then **＋/−** with an adjustable step (1 / 5 / 10). Anyone at the table can adjust — it's a couch, trust-based.
4. The table creator gets **Reset scores** and **New table** controls.

## Stack
- GitHub Pages (static)
- Supabase: `sk_tables` + `sk_players`, Realtime for live scoreboard updates

## Deploy
```bash
./deploy.sh "commit message" [files...]
```
