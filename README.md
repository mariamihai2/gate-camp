# Gate Camp — a logic circuits workbench for a math camp lecture

A static, no-backend interactive site for teaching a class how to build boolean
circuits out of AND / OR / NOT gates, then race to find circuits for all 16
functions of two variables.

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

## Design choices that match the lecture

- There is **no constant TRUE/FALSE gate** and **no way to leave a gate
  input unconnected**. An input pin with nothing wired to it simply doesn't
  carry a signal — the app won't evaluate through it — so students have to
  actually build a constant (e.g. `AND(A, NOT A)`) rather than cheat one in.
- The truth table and the "submit" pattern are computed by evaluating the
  actual wired graph for all four input combinations — not by simulating
  clicks — so there's no way to submit an incomplete or cyclic circuit.
- Everything lives in the browser's `localStorage`. There's no server, no
  accounts, and nothing to keep running after class — open the page and go.
  See "Multi-device use" below for the tradeoff this implies.

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

## Multi-device use

The Board is stored per-browser (`localStorage`), which is why there's no
sign-in and nothing to configure — but it also means it's not synced across
devices out of the box. For a classroom, the simplest setup is:

- One laptop drives the Board on the projector. Students build on their own
  laptops/tablets in the Workbench, then walk you through their circuit (or
  call out the gate list) so you can rebuild it in ten seconds and hit
  submit — or just have them come up and submit it themselves on the
  projector machine.

If you want true cross-device sync so every student can submit from their
own seat, you'd need to swap `localStorage` in `script.js` (see
`loadBoard`/`saveBoard`) for a small shared backend — e.g. Firebase Realtime
Database or a similar free-tier service — that's a deliberate scope cut to
keep this a zero-infrastructure static site.

## Files

- `index.html` — page structure and the three tabs (Workbench / Board / Guide)
- `style.css` — the whole visual design (PCB / breadboard theme)
- `script.js` — circuit graph, evaluation engine, canvas rendering and
  interaction, board persistence

## License

MIT — see `LICENSE`.
