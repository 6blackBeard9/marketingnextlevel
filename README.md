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
  roughly a quarter of the size as WebP
