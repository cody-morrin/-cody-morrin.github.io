# Wordle ±15%

Wordle, except every coloured square has a **15% chance of lying**. When a square lies, it shows one of the other two colours instead (each equally likely). Apart from that it plays like normal Wordle.

- **Daily** (the folder itself, e.g. `https://your-site/`): one word a day, the same for everyone, with a new word at midnight in each player's own time zone.
- **Random** (`random.html`): a new word every time the page loads.

The whole website is the **`public` folder**: plain HTML, CSS and JavaScript, with no database, no accounts, no build step and no tracking. Games and stats are kept in each player's own browser. Anything that can serve files can host it, at the root of a domain or in a subfolder.

## Hosting it: pick one

### A. Free, no server (easiest)

- **Netlify Drop:** open https://app.netlify.com/drop and drag the `public` folder onto the page. You get a link right away. Make a free account if you want to keep it or give it your own domain.
- **Cloudflare Pages:** dashboard → Workers & Pages → Create → Pages → *Upload assets* → upload the `public` folder.
- **GitHub Pages:** put the *contents* of `public` in a repository (any name except `random`), then Settings → Pages → deploy from the branch.

Netlify and Cloudflare Pages also pick up `public/_headers`, which adds the same security headers the included server sends.

### B. Your own server with Docker

```
docker compose up -d --build
```

That serves it on port **8080** (http://your-server:8080) and keeps it running, including after a reboot. To use another port, change the left number in `"8080:8080"` in `docker-compose.yml` (e.g. `"80:8080"`). Put your usual reverse proxy or HTTPS in front if you have one. After any change, run the same command again.

### C. Any web server you already run (nginx, Apache, Caddy, …)

Copy the *contents* of `public` into a folder your server serves. That's all.

### D. Node, without Docker

With Node 22 or newer, in this folder: `npm start` (or `node server.js`), then open http://localhost:8080. For another port: `PORT=3000 npm start` (in Windows PowerShell: `$env:PORT=3000; npm start`). It runs only while that terminal is open (use option B to keep it running), and it reads the files once at the start, so restart it after any change.

To just try it on your own computer: `python -m http.server 8080 -d public` (on Windows maybe `py -m http.server 8080 -d public`), then open http://localhost:8080.

## Changing things

- **How often squares lie:** `const LIE = 0.15` at the top of `public/app.js`.
- **The page itself:** `public/random.html` is an exact copy of `public/index.html` (the page decides between daily and random from its address). If you edit `index.html`, copy it over `random.html` afterwards.
- **The words:** `tools/answers.txt` lists the possible answers, and `tools/guesses.txt` lists every word players may guess (it may include the answers too). After editing either, run `node tools/build-words.mjs`, which rewrites `public/words.js`, then upload again (or rerun option B, or restart option D).
  - Adding answers keeps every daily word as it is. The new ones come up in Random straight away, but as daily words only after the current list runs out (about 4¾ years).
  - Removing an answer shifts every daily word after it. To keep a word out of the dailies without that, leave it where it is.
- **The daily numbering:** daily #1 was 14 Nov 2026 (`START` in `public/app.js`). If you leave this and the answer list as they are, your daily word is the same as on https://wordle.teraleon.de, so you can compare results.

After an update on a static host (options A and C), a player whose browser cached the old files may need to reload once more. The included server (options B and D) avoids this by adding version numbers to the page's files.
