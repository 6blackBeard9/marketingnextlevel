// MARKETINGNEXTLEVEL app.js v1.1
const brand = "MARKETINGNEXTLEVEL";
const heroPhrases = ["The Next Level.", "More Customers.", "Lasting Impact."];

const brandTyping = document.getElementById("brandTyping");
const brandTagline = document.getElementById("brandTagline");
const loader = document.getElementById("loader");
const website = document.getElementById("website");
const changingText = document.getElementById("changingText");
const soundHint = document.getElementById("soundHint");

MNLSound.volume = .5;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ==============================
Sound permission hint

Browsers won't let audio start before the visitor has
touched the page, so if we're still locked when the
typing begins we surface a small prompt and drop it the
moment sound is allowed.
============================== */

function watchSoundHint() {

    if (!soundHint) return;

    if (MNLSound.unlocked) return;

    soundHint.classList.add("show");

    MNLSound.onUnlock(() => {

        soundHint.classList.remove("show");
        MNLSound.key();

    });

}

async function typeBrand() {

    brandTyping.innerHTML = "";

    await Promise.race([MNLSound.ready(), sleep(700)]);

    watchSoundHint();

    for (let i = 0; i < brand.length; i++) {

        const c = brand[i];

        if (i < 9) { brandTyping.innerHTML += c; }
        else {
            brandTyping.innerHTML +=
                '<span class="next">' + c + '</span>';
        }

        MNLSound.key();

        // Uneven cadence reads as a person typing, not a metronome.
        await sleep(95 + Math.random() * 55);

    }

    MNLSound.tick();

    brandTyping.classList.add("gradientSweep", "active");
    gsap.to("#brandTagline", { opacity: 1, y: -10, duration: 1 });
    await sleep(1800);
    revealWebsite();
}

function revealWebsite() {

    if (soundHint) soundHint.classList.remove("show");

    const tl = gsap.timeline();

    tl.set("#website", {
        visibility: "visible"
    })

        .to("#brandTagline", {
            y: -220,
            scale: .72,
            duration: 1
        })

        .to("#loader", {
            opacity: 0,
            duration: .8
        }, "<")

        .set("#loader", {
            display: "none"
        })

        .to("#website", {
            opacity: 1,
            duration: .5
        })

        .fromTo(".navbar",
            {
                y: -80,
                opacity: 0
            },
            {
                y: 0,
                opacity: 1,
                duration: .8
            })

        // Staggers the copy only. Targeting .hero > * would
        // sweep the <video> elements into the tween and fight
        // the crossfade, which owns their opacity.
        .from(".hero-content > *", {

            y: 30,

            opacity: 0,

            stagger: .12,

            duration: .7

        }, "-=0.6")

        .call(startHeroText);

}

/* ==============================
Hero typewriter

Silent by design — the keystroke sound belongs to the
loader only. This line runs for as long as the visitor
stays on the page, and clicking along with it grates.
============================== */

const TYPE_MIN = 55;
const TYPE_JITTER = 45;
const ERASE_SPEED = 28;
const HOLD_MS = 2000;

/* ==============================
Hero video stage

The clip advances on its own counter rather than on the
phrase index, so the pairing keeps shuffling instead of
locking each phrase to one clip. With 3 phrases and 2
clips that runs:

  next level / A, more customers / B, lasting impact / A,
  next level / B, more customers / A, lasting impact / B

and only repeats every 6 turns. Any phrase/clip counts
work — the cycle is just their lowest common multiple.

Only the visible clip is decoded, and everything stops
when the hero scrolls away — an always-on loop burns
battery for no benefit once it is off screen.
============================== */

// Queried by class: the hero's id is now the #home anchor
const heroStage = document.querySelector(".hero");

const heroVideos = heroStage
    ? Array.from(heroStage.querySelectorAll(".heroVideo"))
    : [];

let heroStageVisible = true;

let heroClipTurn = 0;

// A looping clip is motion; reduced-motion users get the
// poster frame and the phrase, without the movement.
const heroReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function showHeroClip(index) {

    if (!heroVideos.length) return;

    const active = index % heroVideos.length;

    heroVideos.forEach((video, i) => {

        const on = i === active;

        video.classList.toggle("is-active", on);

        if (on && heroStageVisible && !heroReducedMotion) {

            const play = video.play();

            if (play && play.catch) play.catch(() => { });

        } else {

            video.pause();

        }

    });

}

function watchHeroStage() {

    if (!heroStage || !window.IntersectionObserver) return;

    new IntersectionObserver(entries => {

        heroStageVisible = entries[0].isIntersecting;

        if (!heroStageVisible || heroReducedMotion) {

            heroVideos.forEach(v => v.pause());

        } else {

            const active = heroVideos.find(
                v => v.classList.contains("is-active")
            );

            if (active) {

                const play = active.play();

                if (play && play.catch) play.catch(() => { });

            }

        }

    }, { threshold: .15 }).observe(heroStage);

}

async function startHeroText() {

    const out = changingText.querySelector(".type");

    if (!out) return;

    watchHeroStage();

    let i = 0;

    while (true) {

        const phrase = heroPhrases[i];

        // Clip swaps first so it is already crossfading
        // while the phrase types itself in. Its own counter,
        // not the phrase index — that is what keeps the
        // pairing shuffling across cycles.
        showHeroClip(heroClipTurn++);

        changingText.classList.add("typing");

        for (let c = 1; c <= phrase.length; c++) {

            out.textContent = phrase.slice(0, c);

            await sleep(TYPE_MIN + Math.random() * TYPE_JITTER);

        }

        changingText.classList.remove("typing");

        await sleep(HOLD_MS);

        changingText.classList.add("typing");

        for (let c = phrase.length - 1; c >= 0; c--) {

            out.textContent = phrase.slice(0, c);

            await sleep(ERASE_SPEED);

        }

        changingText.classList.remove("typing");

        await sleep(220);

        i = (i + 1) % heroPhrases.length;

    }

}

/* ==============================
Navbar over the pinned hero

The bar has no box, so it sits directly on the footage.
Once .pageBody has scrolled up over the hero the backdrop
is light and light-coloured bar content would vanish, so it
swaps to dark at that crossing point.
============================== */

function initNavbarTheme() {

    const navbar = document.querySelector(".navbar");
    const hero = document.querySelector(".hero");

    if (!navbar || !hero) return;

    function sync() {

        // Crossing point is the hero's own bottom edge
        navbar.classList.toggle(
            "scrolled",
            window.scrollY > hero.offsetHeight - navbar.offsetHeight
        );

    }

    let queued = 0;

    window.addEventListener("scroll", () => {

        if (queued) return;

        queued = requestAnimationFrame(() => {
            queued = 0;
            sync();
        });

    }, { passive: true });

    window.addEventListener("resize", sync);

    sync();

}

/* ==============================
Wordmark

The docked one-line state is the element's resting layout;
everything else is a transform off it. The offsets can't be
authored in CSS because they depend on how wide each word
renders, so they're measured here and handed to CSS as
custom properties.
============================== */

function initBrandMark() {

    const mark = document.getElementById("brandMark");
    const hero = document.querySelector(".hero");

    if (!mark || !hero) return;

    const words = Array.from(mark.querySelectorAll(".brandMark-word"));

    if (words.length < 3) return;

    function measure() {

        const dockPx = parseFloat(getComputedStyle(mark).fontSize) || 26;

        // Stack spacing. Slightly over the .92 line-height so the
        // g's tail clears the ascenders of the word beneath it.
        const lh = dockPx * 0.98;

        // Widths at the docked size. is-measuring drops both the
        // per-word shifts and the container's scale() — a rect
        // read through that scale comes back multiplied by it.
        mark.classList.add("is-measuring");

        const w = words.map(el => el.getBoundingClientRect().width);

        mark.classList.remove("is-measuring");

        // Word 2 starts after word 1, word 3 after both — so to
        // stack them each shifts back by what precedes it.
        mark.style.setProperty("--next-x", (-w[0]) + "px");
        mark.style.setProperty("--level-x", (-(w[0] + w[1])) + "px");
        mark.style.setProperty("--lh", lh + "px");

        /* A phone has no room for the desktop wordmark. Held at
           the 34px floor, the three-line stack stood 100px tall -
           an eighth of a 812px screen - and sat squarely on top of
           the call to action. The width term is already tiny at
           this size, so it is the floor that has to come down. */

        const narrow = window.innerWidth < 640;

        const heroPx = Math.min(
            Math.max(narrow ? 24 : 34, window.innerWidth * 0.046), 64
        );

        const scale = heroPx / dockPx;

        mark.style.setProperty("--brand-scale", scale);

        // Three stacked lines, sitting above the hero's bottom
        const blockH = lh * 3 * scale;
        /* 9% of a tall phone is 73px of empty space under a block
           that is already too low. The floor is enough here. */

        const gap = Math.max(46, window.innerHeight * (narrow ? 0.05 : 0.09));
        const heroTop = window.innerHeight - gap - blockH;

        // .heroTag mirrors this block in the opposite corner, so
        // it reads the same size and offset rather than keeping
        // its own copy that could drift out of step.
        const root = document.documentElement;

        root.style.setProperty("--hero-mark-size", heroPx + "px");
        root.style.setProperty("--hero-mark-gap", gap + "px");
        root.style.setProperty("--hero-mark-block", blockH + "px");

        // offsetTop is unreliable for a fixed element (no
        // offsetParent), so read the resolved `top` instead.
        const dockTop = parseFloat(getComputedStyle(mark).top) || 0;

        mark.style.setProperty("--hero-dy", (heroTop - dockTop) + "px");

    }

    function sync() {

        // Docks a little before the hero fully clears, so the
        // word is already home by the time the bar goes dark.
        mark.classList.toggle(
            "is-hero",
            window.scrollY < hero.offsetHeight * 0.55
        );

    }

    let queued = 0;

    window.addEventListener("scroll", () => {

        if (queued) return;

        queued = requestAnimationFrame(() => {
            queued = 0;
            sync();
        });

    }, { passive: true });

    window.addEventListener("resize", () => {
        measure();
        sync();
    });

    // Webfont metrics change the measured widths
    if (document.fonts && document.fonts.ready) {

        document.fonts.ready.then(() => {
            measure();
            sync();
        });

    }

    measure();
    sync();

}

/* ==============================
EQ arrival

Cuts the clients panel's top edge into vertical columns and
drives their heights from scroll position, so the section
rises like an equaliser and lands as a flat rectangle.

Each column carries its own delay, wobble frequency and
amplitude — a shared timing reads as one wave rolling across,
where a spectrum needs the columns to disagree.

The wobble is scaled by the travel a column has left, so it
dies out on its own and the edge is exactly flat at the end.
============================== */

function initEqArrival() {

    /* Every .eqPanel on the page, not just the clients one — a
       panel opts into the arrival by wrapping its contents in
       .eqPanel and needs no wiring here. They share a single
       scroll listener; one per panel would be four handlers
       fighting for the same frame. */

    const panels = Array.from(document.querySelectorAll(".eqPanel"))
        .map(panel => ({
            panel: panel,
            section: panel.closest("section"),
            cols: [],
            rise: 0,
            lastPath: ""
        }))
        .filter(entry => entry.section);

    if (!panels.length) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const small = window.matchMedia("(max-width: 900px)");

    // Arrival is dead scroll until the panel is well up the
    // screen — starting at first contact stretches it over a
    // whole viewport and the rise stops reading as a beat.

    const START = 0.38;

    // Fraction of the run handed to the stagger. Anything much
    // lower and the columns have all landed by ~70% of the run,
    // so the last stretch of the arrival is visually dead.

    const SPREAD = 0.78;

    let queued = false;

    function build(entry) {

        const section = entry.section;

        const w = section.offsetWidth || window.innerWidth;

        // ~108px columns: wide enough to read as rectangles
        // rather than as an audio meter's hairlines.

        const n = Math.max(7, Math.min(16, Math.round(w / 108)));

        entry.rise = Math.max(64, Math.min(150, window.innerHeight * 0.16));

        // Delays are dealt from evenly spaced slots and then
        // shuffled, rather than drawn at random: n random draws
        // clump, which leaves stretches of the run where nothing
        // is moving. Slots guarantee the spectrum stays busy;
        // the jitter keeps it from reading as a fixed order.

        const slots = [];

        for (let i = 0; i < n; i++) slots.push(i / (n - 1));

        for (let i = slots.length - 1; i > 0; i--) {

            const j = Math.floor(Math.random() * (i + 1));

            const t = slots[i]; slots[i] = slots[j]; slots[j] = t;

        }

        entry.cols = [];

        for (let i = 0; i < n; i++) {

            let d = slots[i] + (Math.random() - 0.5) * 0.12;

            entry.cols.push({
                delay: d < 0 ? 0 : d > 1 ? 1 : d,
                freq: 0.8 + Math.random() * 1.4,
                phase: Math.random() * Math.PI * 2,
                amp: 0.5 + Math.random() * 0.8
            });

        }

        entry.lastPath = "";

    }

    function drawOne(entry) {

        const section = entry.section;
        const panel = entry.panel;
        const cols = entry.cols;

        if (still.matches || small.matches) {

            panel.style.clipPath = "";
            section.classList.remove("is-arriving");
            section.classList.add("is-landed");

            return;

        }

        const vh = window.innerHeight;
        const top = section.getBoundingClientRect().top;

        let p = (1 - top / vh - START) / (1 - START);

        p = p < 0 ? 0 : p > 1 ? 1 : p;

        // Landed: drop the clip entirely rather than paying for
        // a polygon that describes a plain rectangle.

        if (p >= 1) {

            if (entry.lastPath !== "none") {

                panel.style.clipPath = "";
                section.classList.remove("is-arriving");
                section.classList.add("is-landed");

                entry.lastPath = "none";

            }

            return;

        }

        section.classList.add("is-arriving");
        section.classList.remove("is-landed");

        const pts = [];
        const step = 100 / cols.length;

        for (let i = 0; i < cols.length; i++) {

            const c = cols[i];

            let e = (p - c.delay * SPREAD) / (1 - SPREAD);

            e = e < 0 ? 0 : e > 1 ? 1 : e;

            // easeOutQuad. Cubic lands a column so abruptly that
            // its share of the run is over almost as it starts.

            const eased = 1 - Math.pow(1 - e, 2);

            const left = 1 - eased;

            const wob = Math.sin(e * Math.PI * c.freq + c.phase) * c.amp * 0.35;

            // Wobble rides on the remaining travel, so a column
            // that is nearly home barely moves. Slight negative
            // is fine — it just means no clipping there.

            let y = Math.round(entry.rise * left * (1 + wob));

            if (y < -8) y = -8;

            const x1 = (i * step).toFixed(3) + "%";
            const x2 = ((i + 1) * step).toFixed(3) + "%";

            pts.push(x1 + " " + y + "px", x2 + " " + y + "px");

        }

        pts.push("100% 100%", "0% 100%");

        const path = "polygon(" + pts.join(",") + ")";

        if (path !== entry.lastPath) {

            panel.style.clipPath = path;

            entry.lastPath = path;

        }

    }

    function draw() {

        queued = false;

        for (const entry of panels) drawOne(entry);

    }

    function onScroll() {

        if (queued) return;

        queued = true;

        requestAnimationFrame(draw);

    }

    function rebuild() {

        for (const entry of panels) build(entry);

        onScroll();

    }

    rebuild();
    draw();

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", rebuild);

    still.addEventListener("change", rebuild);
    small.addEventListener("change", rebuild);

}

/* ==============================
Field scroll

The whole page is one colour field. Every flat panel paints
--field, so at any instant they are all the same colour — the
site turns from citron to light black as a single surface, and
the panels still occlude each other because they stay opaque.

The colour is a STATE, not a scroll position. A panel owns a
colour; crossing into it starts a fixed 900ms ease to that
colour and the ease finishes on its own. Scrubbing the colour
frame-by-frame off scrollY reads badly: it stalls half-way
when you stop, tracks scroll speed, and reverses on the
smallest scroll back. Tying it to a state means the change
always completes and always looks the same.

The work panels sit this out: they're covered by artwork, and
their eq columns read against what's behind them.

A panel's content dips while the field is in flight, because
adjacent palettes are polarity-inverted — dark type on citron,
white on light black — and the midpoint suits neither.
============================== */

function initFieldScroll() {

    const body = document.querySelector(".pageBody");

    if (!body) return;

    // Flat-colour panels in document order. The work pages are
    // artwork, so they aren't stops on the colour run.

    const stops = Array.from(body.children).filter(el =>
        el.tagName === "SECTION" && !el.classList.contains("workPage"));

    if (stops.length < 2) return;

    const parse = value => {

        const hex = value.trim().replace("#", "");

        if (hex.length !== 6) return null;

        return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));

    };

    // Each panel's own colour, read once — --bg stays the source
    // of truth, --field is only ever the animated result.

    const shades = stops.map(section =>
        parse(getComputedStyle(section).getPropertyValue("--bg")) || [0, 0, 0]);

    const still = window.matchMedia("(prefers-reduced-motion: reduce)");

    const RUN = 900;      // ms the colour takes to change

    let current = 0;                    // panel whose colour we're on
    let from = shades[0];
    let to = shades[0];
    let startedAt = 0;
    let raf = 0;
    let swapped = true;                 // has the type flipped yet?
    let lastField = "";

    /* A panel is "ahead" while the field hasn't become its colour
       yet — its heading has to borrow the polarity that suits the
       colour it's arriving onto, or it sits at about 1:1. */

    function markAhead() {

        for (let i = 0; i < stops.length; i++) {

            stops[i].classList.toggle("is-ahead", i > current);

        }

    }

    function paint(shade, flight) {

        const field = "rgb(" + shade.join(",") + ")";

        if (field !== lastField) {

            body.style.setProperty("--field", field);

            lastField = field;


        }

        /* A light dip while the colour is in flight, to soften
           the moment the type changes polarity.

           It used to be heavy (down to 0.18) because it was the
           only thing stopping unreadable text mid-change. Now
           --text-ahead keeps the headings legible on both sides
           and the floor is ~4.3:1, so this is only smoothing.

           flight is 0 at rest and 1 mid-change. */

        const dip = 1 - flight * 0.35;

        for (let i = 0; i < stops.length; i++) {

            stops[i].style.setProperty("--reveal", dip.toFixed(3));

        }

    }

    function tick(now) {

        let t = (now - startedAt) / RUN;

        if (t < 0) t = 0;

        const done = t >= 1;

        if (done) t = 1;

        /* Half way is where the two polarities are equally
           legible against the field — measured, roughly 4.3:1
           either side. Swapping earlier or later makes one of
           them worse. */

        if (!swapped && t >= 0.5) {

            swapped = true;

            markAhead();

        }

        // easeInOutCubic — settles rather than stops dead
        const e = t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;

        const shade = [0, 1, 2].map(c =>
            Math.round(from[c] + (to[c] - from[c]) * e));

        // Peaks at the half-way point, zero at both ends
        paint(shade, done ? 0 : Math.sin(t * Math.PI));

        raf = done ? 0 : requestAnimationFrame(tick);

    }

    function goTo(index) {

        if (index === current) return;

        current = index;

        // Leave from wherever we actually are, so a change that
        // interrupts another doesn't jump.
        from = lastField
            ? lastField.slice(4, -1).split(",").map(Number)
            : shades[0];

        to = shades[index];

        swapped = false;

        if (still.matches) {

            if (raf) cancelAnimationFrame(raf);

            raf = 0;

            swapped = true;

            markAhead();
            paint(to, 0);

            return;

        }

        startedAt = performance.now();

        if (!raf) raf = requestAnimationFrame(tick);

    }

    function onScroll() {

        const mark = window.innerHeight * 0.5;

        let index = 0;

        // The panel that owns the middle of the screen owns the
        // colour. Half a screen in is late enough that a nudge
        // near a boundary doesn't flip it back and forth.

        for (let i = 0; i < stops.length; i++) {

            if (stops[i].getBoundingClientRect().top <= mark) index = i;

        }

        goTo(index);

    }

    markAhead();
    paint(shades[0], 0);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    still.addEventListener("change", onScroll);

    onScroll();

}

/* ==============================
Menu circle

Hover alone would strand touch users, so click toggles the
same state CSS already reveals on hover. Closes on outside
click and on Escape.
============================== */

function initMenu() {

    const menu = document.querySelector(".navMenu");

    if (!menu) return;

    const toggle = menu.querySelector(".navMenu-toggle");

    if (!toggle) return;

    function setOpen(open) {

        menu.classList.toggle("is-open", open);
        toggle.setAttribute("aria-expanded", open ? "true" : "false");

        /* Closing has to drop focus as well as the class. The list
           is also held open by :focus-within, and a tap leaves the
           button focused — so on a phone it sprang straight back
           open and there was no way to dismiss it. Keyboard users
           are unaffected: they move focus with Tab, not by closing. */

        if (!open && document.activeElement &&
            menu.contains(document.activeElement)) {

            document.activeElement.blur();

        }

    }

    /* Scrolling away is a dismissal too — on touch there is no
       pointer leaving the menu to close it. */

    let menuScrollFrom = window.scrollY;

    window.addEventListener("scroll", () => {

        if (!menu.classList.contains("is-open")) {

            menuScrollFrom = window.scrollY;

            return;

        }

        if (Math.abs(window.scrollY - menuScrollFrom) > 80) setOpen(false);

    }, { passive: true });

    toggle.addEventListener("click", e => {

        e.stopPropagation();
        setOpen(!menu.classList.contains("is-open"));

    });

    // pointerdown, not click: a tap on a non-interactive area of
    // the page does not always deliver a click to document on iOS
    document.addEventListener("pointerdown", e => {

        if (!menu.contains(e.target)) setOpen(false);

    });

    document.addEventListener("keydown", e => {

        if (e.key !== "Escape") return;

        setOpen(false);
        toggle.blur();

    });

    // A pill was picked — collapse behind it
    menu.querySelectorAll(".navMenu-list a").forEach(link => {

        link.addEventListener("click", () => setOpen(false));

    });

    /* ---- current section drives which pill is showing ---- */

    const items = Array.from(menu.querySelectorAll(".navMenu-list li"));

    const sections = Array.from(document.querySelectorAll("[data-nav]"));

    if (!items.length || !sections.length) return;

    // The hero is sticky, so its rect is pinned at the top and
    // can't say where we are; offsetTop reports flow position,
    // which sticky never moves.
    function flowTop(el) {

        let y = 0;

        while (el) {

            y += el.offsetTop;
            el = el.offsetParent;

        }

        return y;

    }

    let currentName = "";

    function syncActive() {

        const navH = 90;
        const mark = window.scrollY + navH + 10;

        let name = sections[0].dataset.nav;

        for (const section of sections) {

            if (flowTop(section) <= mark) name = section.dataset.nav;

        }

        if (name === currentName) return;

        currentName = name;

        let active = null;

        items.forEach(li => {

            const link = li.querySelector("a");
            const on = link && link.dataset.section === name;

            li.classList.toggle("is-active", on);

            if (on) active = li;

        });

        // "Home" keeps the Menu circle; a section swaps it for
        // that section's pill.
        const showPill = !!active && name !== "Home";

        menu.classList.toggle("has-active", showPill);

        if (active) {

            // How far down the column it sits — the list shifts
            // up by this so the pill lands on the circle's spot.
            menu.querySelector(".navMenu-list").style.setProperty(
                "--active-offset", active.offsetTop + "px"
            );

        }

    }

    let ticking = 0;

    window.addEventListener("scroll", () => {

        if (ticking) return;

        ticking = requestAnimationFrame(() => {
            ticking = 0;
            syncActive();
        });

    }, { passive: true });

    window.addEventListener("resize", () => {

        currentName = "";
        syncActive();

    });

    syncActive();

}

/* ==============================
Custom cursor

The CSS for #cursor / #cursorBlur / #mouseGlow was already
written but nothing ever moved them, so they sat piled in
the top-left corner. Each layer trails at its own rate.
============================== */

function initCursor() {

    const dot = document.getElementById("cursor");
    const ring = document.getElementById("cursorBlur");
    const glow = document.getElementById("mouseGlow");

    if (!dot || !ring || !glow) return;

    const fine = window.matchMedia("(pointer: fine)").matches;

    if (!fine) {

        dot.style.display = ring.style.display = glow.style.display = "none";

        return;

    }

    const layers = [
        { el: dot, x: 0, y: 0, ease: .45, scale: 1 },
        { el: ring, x: 0, y: 0, ease: .18, scale: 1 },
        { el: glow, x: 0, y: 0, ease: .08, scale: 1 }
    ];

    let mx = 0, my = 0, seen = false;

    layers.forEach(l => {

        l.el.style.opacity = 0;
        l.el.style.left = "0px";
        l.el.style.top = "0px";
        l.el.style.willChange = "transform";

    });

    // Only take over the pointer once we're actually driving it.
    document.documentElement.classList.add("customCursor");

    window.addEventListener("pointermove", e => {

        mx = e.clientX;
        my = e.clientY;

        if (!seen) {

            seen = true;

            layers.forEach(l => {

                l.x = mx;
                l.y = my;
                l.el.style.opacity = 1;

            });

        }

    }, { passive: true });

    document.addEventListener("mouseleave", () => {

        layers.forEach(l => { l.el.style.opacity = 0; });

    });

    document.addEventListener("mouseenter", () => {

        if (seen) layers.forEach(l => { l.el.style.opacity = 1; });

    });

    // Grow over anything clickable
    const hoverable = "a, button, .cfCard, .pm-item, .workItem";

    document.addEventListener("pointerover", e => {

        if (e.target.closest && e.target.closest(hoverable)) {

            layers[0].scale = 2.1;
            layers[1].scale = 1.35;

        }

    }, { passive: true });

    document.addEventListener("pointerout", e => {

        if (e.target.closest && e.target.closest(hoverable)) {

            layers[0].scale = 1;
            layers[1].scale = 1;

        }

    }, { passive: true });

    let current = [1, 1, 1];

    (function follow() {

        layers.forEach((l, i) => {

            l.x += (mx - l.x) * l.ease;
            l.y += (my - l.y) * l.ease;

            current[i] += (l.scale - current[i]) * .2;

            l.el.style.transform =
                "translate3d(" + l.x + "px," + l.y + "px,0) " +
                "translate(-50%,-50%) scale(" + current[i] + ")";

        });

        requestAnimationFrame(follow);

    })();

}


window.addEventListener("load", () => {

    initCursor();
    initNavbarTheme();
    initBrandMark();
    initMenu();
    initEqArrival();
    initFieldScroll();

    gsap.set("#website", {
        opacity: 0,
        visibility: "hidden"
    });

    gsap.set("#brandTagline", {
        opacity: 0,
        y: 20
    });

    typeBrand();

});

lucide.createIcons();

gsap.from(".featureCard",{

    scrollTrigger:{

        trigger:".whyChoose",

        start:"top 70%"

    },

    y:60,

    opacity:0,

    stagger:.2,

    duration:.9,

    ease:"power3.out"

});
