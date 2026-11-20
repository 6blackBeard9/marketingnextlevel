# MarketingNextLevel

Website for MarketingNextLevel — an AI-powered creative growth agency.

**Live:** https://6blackbeard9.github.io/marketingnextlevel/

---

## Running it

```bash
python -m http.server 5599
```

Then open <http://localhost:5599>.

It has to be **served**, not opened from the filesystem. The hero is an
ES module that pulls three.js through an import map, and browsers block
both on `file://` — double-clicking `index.html` gives you a page with no
robot and no artwork.

## No build step

There is no `package.json`, no bundler and no install. Every file ships
exactly as written, which is why the only thing needed to run it is a
static server.

Four components that normally arrive as React packages were ported to
plain JavaScript instead:

| Component | Originally | Here |
|---|---|---|
| Hero robot | React Three Fiber + drei | `assets/js/robot.js`, three.js via import map |
| Services carousel | shadcn coverflow | `assets/js/carousel.js` |
| Client marquee | `marquee-along-svg-path` | `assets/js/clients.js`, CSS `offset-path` |
| Portfolio trail | `image-cursor-trail` | `assets/js/trail.js` |

drei's `<Environment>` and `<ContactShadows>` have hand-written stand-ins;
`useFrame` is a plain render loop; Tailwind's `data-[status]` variants are
just attribute selectors.

## What's in it

- **Hero** — three.js robot that tracks the pointer, blinks, and swaps to
  heart eyes when poked. The `h1` sits behind it.
- **Work panels** — pinned full-screen pieces, each revealed by an
  equaliser of vertical columns cut from the panel itself.
- **Clients** — names riding an SVG path, card text auto-fitted to a fixed
  box so any name length works.
- **Manifesto** — scroll-driven word sequence on a pinned stage.
- **Services** — coverflow carousel, auto-advancing, pausing on the centred
  card to reveal its description and artwork.
- **Portfolio** — cursor trail laying work along the pointer; click any
  piece to open it full size.
- **Footer** — social buttons dropped in by a capsule physics solver
  (impulse-based, written from scratch).

The whole page is one colour field that eases between section colours as
you scroll, rather than a stack of separately coloured panels.

## Layout

```
index.html
assets/
  css/     style.css · animations.css · responsive.css
  js/      app.js · robot.js · carousel.js · clients.js · trail.js
           manifesto.js · footer.js · shimmer.js · grains.js · sound.js
  images/  ourwork/ · services/
  videos/  website_service.mp4
  audio/   typing.mp3 · tick.mp3
```

`?v=` query strings on the CSS and JS are cache-busters — bump them after
editing a file so browsers don't serve a stale copy.

## Deploying

Push to `main` and the live site updates. `.github/workflows/deploy.yml`
runs a check, then publishes the repo root to GitHub Pages — the whole
repo *is* the site, so there is nothing to build.

Pages is served from the workflow rather than from the branch, which
skips Jekyll entirely (this is plain HTML with no front matter to
process) and means something runs before anything goes live.

The check is `.github/scripts/check_assets.py`, and it exists for one
specific failure. With no build step, a file that is referenced but
never committed — because `.gitignore` excludes the folder it lives in —
works perfectly on your machine and 404s in production. Nothing else
would catch it. It reads `index.html` plus every script and stylesheet
the page loads, since the markup names the images but the audio is only
named inside `sound.js`.

Run it yourself before pushing:

```bash
python .github/scripts/check_assets.py
```

It is also worth knowing what it deliberately ignores: a string in a
script only counts as a path if it starts with `./`, `../`, `/` or
`assets/`. `robot.js` imports `three/addons/…`, which ends in `.js` but
is a bare specifier the import map resolves to a CDN.

## Responsive

Breakpoints live in `assets/css/responsive.css`: 400 / 640 / 900 / 1100
/ 1150, plus short-viewport and reduced-motion blocks. Verified at 375,
768, 1024, 1280 and 1440 wide.

Two things to keep in mind when editing it:

- **900px is where the pinning stops.** Sections become `position:
  relative` and `overflow: clip` — `relative` rather than `static`
  because the work panels' backdrops are absolutely positioned and
  overscan on purpose, and an element whose containing block sits
  outside the clipping box is not clipped by it. `static` there scrolled
  the page sideways by 51px.
- **Hover-only content needs a touch path.** A phone reaches neither a
  cursor trail nor a `:hover` reveal. The service cards open the centred
  card's description under `(hover: none)`; the portfolio trail becomes a
  tappable grid (`trail.js` adds `.is-static`). Anything new that hides
  content behind hover needs the same treatment or it is invisible on
  half the traffic.

## Accessibility

Every text/background pair is checked against WCAG AA. Because the page
changes colour as you scroll, section headings carry a second colour for
the stretch before the field reaches them — adjacent palettes are
polarity-inverted, so a heading would otherwise sit at about 1:1 on
arrival. Reduced motion is respected throughout: the trail, the drop, the
colour eases and the robot all stand still.

## Known gaps

- Five of the six footer social links and the Contact nav item are `#`
- The `ourwork` PNGs are oversized for photographic content and would be
  roughly a quarter of the size as WebP — they are 5.8MB of a 10.8MB
  deploy
- Paid Ads Management is the one service card with no artwork behind it
