# Mafia Online — Setup Guide (No Coding Required)

This is a full online version of Mafia for exactly 8 players: 1 Mafia, 1 Detective,
1 Doctor, 5 Civilians. You'll deploy it on **Replit** (free, runs in your browser,
no installs) and share a link with your 7 classmates.

## Step 1 — Create a Replit account
Go to https://replit.com and sign up (free, use Google/email).

## Step 2 — Create a new Repl
1. Click **"+ Create Repl"**.
2. Choose the **Node.js** template.
3. Give it a name, e.g. `mafia-online`.
4. Click **Create Repl**.

## Step 3 — Add the files
Replit opens with a `index.js` and `package.json` already there. Replace them with
the files from this folder:

1. Delete the default `index.js`.
2. In the Replit file panel, create these files/folders and paste in the matching
   content from this project:
   - `package.json`
   - `server.js`
   - `public/index.html`
   - `public/style.css`
   - `public/client.js`

   (Click the folder icon in Replit's sidebar → "Add file", and type `public/index.html`
   — Replit automatically creates the `public` folder for you.)

## Step 4 — Run it
Click the big **Run** button at the top. Replit will automatically run `npm install`
(installing Express and Socket.io) and then start the server. After a few seconds
you'll see a webview panel open with a URL like:

```
https://mafia-online.yourusername.repl.co
```

That URL is your live game — click the icon to open it in a new tab to get the
full link.

## Step 5 — Play
1. Send that link to your 7 friends/classmates (they can be anywhere — different
   wifi, different phones, doesn't matter).
2. One person clicks **"Create room"** and gets a 4-letter room code.
3. Everyone else clicks **"Join room"**, enters that code and their name.
4. Once all 8 have joined, the host clicks **"Start game"**.
5. Everyone privately sees their role, then the Night/Day cycle begins automatically.

## For your demo/presentation
- Keep the Repl tab open during your demo — as long as it's running, the link works.
- On Replit's free tier the server may sleep after inactivity; just reopen the Repl
  and click Run again before presenting.
- You can play test rounds solo by opening the link in 8 different browser tabs
  (each tab is treated as a separate player) — handy for testing before demo day.

## What to say if asked "how does it work" in your project writeup
- **Backend:** Node.js + Express serves the web page; Socket.io keeps a live
  connection open between the server and every player's browser so game state
  (who died, whose turn, chat, votes) updates instantly for everyone.
- **Game state:** kept in the server's memory per room, keyed by room code —
  simple and appropriate for a short-lived party game like this.
- **Frontend:** plain HTML/CSS/JavaScript, no framework, so it's easy to read and
  explain line by line if your professor asks.
