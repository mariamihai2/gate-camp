# Gate Camp — a logic circuits workbench for a math camp lecture

A static, no-backend interactive site for teaching a class how to build boolean
circuits out of AND / OR / NOT gates, then race to find circuits for all 16
functions of two variables.

**[Live workbench →](#)** *(replace with your GitHub Pages URL once deployed — see below)*

## What's here

- **Workbench** — drag AND/OR/NOT gates onto a canvas, wire them up (a wire
  can fan out to feed more than one input), flip the A/B switches to watch
  signal flow live, and read off the truth table as you build.
- **The Board** — all 16 boolean functions of two variables, laid out as
  cards. Submitting a finished circuit fills in that function's card with
  your name and gate count, and a gallery of every submitted solution.
- **Field Guide** — a written recap of the lecture plan: the ~20 minute
  intro, the main 16-functions hunt, and ways to extend the session
  (3-variable functions, a completeness proof, De Morgan's laws, minimal
  gate counts).

The Board now syncs **live across every device in the room** via Firebase
Firestore — a student who submits a circuit on their laptop shows up
instantly on the projector and on everyone else's screens too, no refresh
needed.

## Design choices that match the lecture

- There is **no constant TRUE/FALSE gate** and **no way to leave a gate
  input unconnected**. An input pin with nothing wired to it simply doesn't
  carry a signal — the app won't evaluate through it — so students have to
  actually build a constant (e.g. `AND(A, NOT A)`) rather than cheat one in.
- The truth table and the "submit" pattern are computed by evaluating the
  actual wired graph for all four input combinations — not by simulating
  clicks — so there's no way to submit an incomplete or cyclic circuit.
- Your name is remembered per-browser in `localStorage` (no accounts, no
  login). The Board itself lives in **Firebase Firestore** and updates in
  real time for everyone connected — see "Live sync (Firebase)" below.

## Running it

It's a static site — three files, no build step.

```bash
git clone <this-repo-url>
cd <repo>
python3 -m http.server 8000   # or any static file server
# open http://localhost:8000
```

## Deploying to GitHub Pages

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under **Source**, choose the `main` branch and `/ (root)` folder.
4. Save — GitHub will publish at `https://<user>.github.io/<repo>/` within a
   minute or two.

## Live sync (Firebase)

The Board is backed by a Firebase project (Firestore) so every device in
the room sees submissions the instant they happen — no refresh, no manual
relay.

**How it's wired up:**

- `script.js` is loaded as an ES module (`<script type="module" ...>` in
  `index.html`) so it can `import` the Firebase SDK straight from Google's
  CDN — no npm install, no build step.
- Each Workbench (the 2-variable one and the 3-variable "Extra Time" one)
  writes submissions into its own Firestore **collection**, named after its
  `storageKey` (`gatecamp_board_v1` and `gatecamp_board_3v_v1`). Every
  submitted circuit is its own document, so two students submitting at the
  same instant never overwrite each other.
- Each Workbench subscribes to its collection with `onSnapshot`, so
  `renderBoard()` re-runs automatically whenever anyone, anywhere, adds or
  removes a submission. The small dot next to each Board's heading shows
  `connecting…`, `live`, or `sync error` so you can tell at a glance whether
  the room is actually synced.
- "Reset board" now deletes every document in that collection — this
  clears the Board **for everyone**, not just the browser you clicked it in.
- Your display name still lives in per-browser `localStorage` — that part
  is deliberately *not* synced, since it's specific to you, not the room.

**Setting up your own Firebase project:**

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com).
2. Add a Web App and copy its `firebaseConfig` object.
3. Paste it over the `firebaseConfig` object near the top of `script.js`.
4. In the console, go to **Firestore Database → Create database**, and
   start it in test mode (or use rules like the ones below).
5. Firestore's default rules deny all access — for a classroom exercise
   with no login system, open (but time-boxed) rules are the simplest
   option. In **Firestore Database → Rules**, something like:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /gatecamp_board_v1/{doc} {
         allow read, write: if request.time < timestamp.date(2026, 12, 31);
       }
       match /gatecamp_board_3v_v1/{doc} {
         allow read, write: if request.time < timestamp.date(2026, 12, 31);
       }
     }
   }
   ```

   Adjust the collection names and expiry date to match your own
   `storageKey`s and event date. Because these rules are wide open to
   anyone with your `firebaseConfig` (which ships in the client-side JS
   and can't really be kept secret), don't reuse this Firebase project for
   anything sensitive.

**Offline/no-Firebase fallback:** if you'd rather not stand up a Firebase
project at all (e.g. running this fully offline), the simplest fallback is
to revert `boardCollection()`/`startBoardSync()`/`submit()`/`resetBoard()`
in `script.js` back to reading/writing a `board` object in `localStorage` —
that's exactly how earlier versions of this app worked, just per-browser
instead of live.

## Files

- `index.html` — page structure and the three tabs (Workbench / Board / Guide)
- `style.css` — the whole visual design (PCB / breadboard theme)
- `script.js` — circuit graph, evaluation engine, canvas rendering and
  interaction, Firebase Firestore live board sync

## License

MIT — see `LICENSE`.
