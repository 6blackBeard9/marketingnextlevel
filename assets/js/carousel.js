/*======================================================
MARKETINGNEXTLEVEL — coverflow carousel

Vanilla port of the React CoverflowCarousel. The effect is
transforms on absolutely-positioned cards, so nothing here
needed a framework — this file supplies the animation loop,
the drag and the measuring that the React version got from
refs and hooks.

Kept from the original:

  · one fractional position as the single source of truth,
    painted straight to the DOM rather than through state
  · the ring folded in the maths, so looping needs no cloned
    nodes and never reshuffles the DOM
  · distance^falloff easing on both tilt and depth, so the
    second card stays readable instead of folding shut
  · tilt capped short of edge-on so a far card never turns
    its back
  · flick-to-throw, capped at two cards
  · exponential settle, not a spring

Markup contract:

  <div class="coverflow" data-rotate="44" …>
    <div class="coverflow-frame" tabindex="0">
      <div class="coverflow-track">
        <article class="cfCard" data-title="…" data-note="…">…
      </div>
    </div>
    <button class="coverflow-nav is-prev">  (optional)
    <button class="coverflow-nav is-next">  (optional)
    <div class="coverflow-caption">…</div>  (optional)
    <div class="coverflow-dots"></div>      (optional)
  </div>
======================================================*/

(function () {

    const reduced =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    class Coverflow {

        constructor(el) {

            this.el = el;
            this.frame = el.querySelector(".coverflow-frame");
            this.track = el.querySelector(".coverflow-track");
            this.cards = Array.from(el.querySelectorAll(".cfCard"));

            if (!this.frame || !this.track || this.cards.length < 2) return;

            const d = el.dataset;

            this.rotate = parseFloat(d.rotate) || 44;
            this.depth = d.depth !== undefined ? parseFloat(d.depth) : 0.6;
            this.perspective = parseFloat(d.perspective) || 3;
            this.falloff = d.falloff !== undefined ? parseFloat(d.falloff) : 0.56;
            this.fade = d.fade !== undefined ? parseFloat(d.fade) : 0.1;
            this.gap = d.gap !== undefined ? parseFloat(d.gap) : 0.05;
            this.loop = d.loop !== "false";

            this.count = this.cards.length;

            // Fractional card index at the centre — everything else
            // is derived from it.
            this.pos = 0;

            // Where the current settle is headed. Stepping off `pos`
            // instead would swallow a keypress that lands mid-flight,
            // before the round-off moves.
            this.target = 0;

            this.width = 0;
            this.raf = 0;
            this.drag = null;
            this.selected = 0;

            /* Autoplay. Cards per second — positive drifts the ring
               right to left, which is the reading direction. */

            this.speed = d.speed !== undefined ? parseFloat(d.speed) : 0.24;
            this.autoRaf = 0;
            this.autoAt = 0;
            this.onScreen = true;

            /* Only the centred card answers the pointer, and hover is
               resolved geometrically rather than with pointerenter:
               autoplay slides a new card under a cursor that hasn't
               moved, and enter/leave don't fire for that. */

            this.pointer = null;
            this.hovering = false;
            this.mediaOn = -1;

            this.touch = window.matchMedia
                ? window.matchMedia("(hover: none)").matches
                : false;

            this.frame.style.perspective =
                "calc(var(--cf-card) * " + this.perspective + ")";

            this.paint = this.paint.bind(this);
            this.step = this.step.bind(this);
            this.tick = this.tick.bind(this);

            this.buildDots();
            this.buildMedia();
            this.bind();
            this.measure();
            this.select(0);

            if (!reduced) this.startAuto();

        }

        /* ==============================
        Background media

        The artwork belongs to the section, not the card — the
        cards carry only their content. Each card names its own
        file on data-media, so adding art is a one-attribute
        change next to the service it belongs to.
        ============================== */

        buildMedia() {

            const host = this.el.closest("section") || this.el.parentElement;

            if (!host) return;

            const layer = document.createElement("div");

            layer.className = "servicesMedia";
            layer.setAttribute("aria-hidden", "true");

            this.media = this.cards.map(card => {

                const src = card.dataset.media;

                if (!src) return null;

                const item = document.createElement("div");
                item.className = "servicesMedia-item";

                const video = /\.(mp4|webm|ogv)$/i.test(src);
                const node = document.createElement(video ? "video" : "img");

                /* Held back rather than set now, and deliberately
                   not loading="lazy". These are revealed by a
                   hover, which is instant — a file that only
                   starts fetching at that moment shows nothing,
                   and lazy never fires at all for an image that
                   sits inside an opacity:0 layer. loadMedia()
                   fills these in as the section comes up. */

                node.dataset.src = src;

                if (video) {

                    node.muted = true;
                    node.loop = true;
                    node.playsInline = true;

                    /* "auto", not "metadata": loadMedia() holds the
                       src back until the section is close, so by
                       the time this starts fetching we're already
                       deferring — and a hover has to play at once,
                       which metadata-only can't do. */

                    node.preload = "auto";

                } else {

                    node.alt = "";
                    node.decoding = "async";

                }

                item.appendChild(node);
                layer.appendChild(item);

                return item;

            });

            // Nothing declared any art yet — don't add an empty layer
            if (!this.media.some(Boolean)) return;

            this.mediaLayer = layer;
            host.insertBefore(layer, host.firstChild);

        }

        /* Called once, as the section comes within reach. Runs
           well ahead of any hover, so the artwork is decoded and
           ready the moment a card is held. */

        loadMedia() {

            if (!this.media || this.mediaLoaded) return;

            this.mediaLoaded = true;

            this.media.forEach(item => {

                if (!item) return;

                const node = item.firstChild;

                if (node && node.dataset.src) {

                    node.src = node.dataset.src;

                    delete node.dataset.src;

                }

            });

        }

        showMedia(index) {

            if (!this.media || index === this.mediaOn) return;

            this.mediaOn = index;

            this.media.forEach((item, i) => {

                if (!item) return;

                const on = i === index;

                item.classList.toggle("is-on", on);

                const video = item.firstChild;

                if (video && video.tagName === "VIDEO") {

                    if (on) {

                        /* From the top each time. A five-second
                           clip picked up half way reads as broken
                           rather than as a loop. */

                        if (video.currentTime > 0.05) video.currentTime = 0;

                        const playing = video.play();

                        if (playing && playing.catch) playing.catch(() => {});

                    } else {

                        video.pause();

                    }

                }

            });

        }

        /* ==============================
        Autoplay

        One clock for the drift. A settle (arrow, dot, drag throw)
        owns `pos` while it runs, so the drift stands off until
        that finishes rather than the two fighting over it.
        ============================== */

        startAuto() {

            if (this.autoRaf || this.speed <= 0) return;

            this.autoAt = 0;
            this.autoRaf = requestAnimationFrame(this.tick);

        }

        stopAuto() {

            if (!this.autoRaf) return;

            cancelAnimationFrame(this.autoRaf);
            this.autoRaf = 0;

        }

        // Is the pointer inside the card currently at the centre?
        resolveHover() {

            /* Touch has no hover to give. The artwork follows the
               centred card instead, and the drift keeps running —
               CSS opens that card's text off .is-centre. */

            if (this.touch) {

                this.showMedia(this.indexAt(this.pos));

                return;

            }

            const p = this.pointer;

            let over = false;

            if (p) {

                const centre = this.cards[this.indexAt(this.pos)];

                if (centre) {

                    const r = centre.getBoundingClientRect();

                    over = p.x >= r.left && p.x <= r.right &&
                           p.y >= r.top && p.y <= r.bottom;

                }

            }

            if (over === this.hovering) return;

            this.hovering = over;

            this.el.classList.toggle("is-held", over);

            const index = this.indexAt(this.pos);

            this.cards.forEach((card, i) =>
                card.classList.toggle("is-open", over && i === index));

            this.showMedia(over ? index : -1);

        }

        tick(now) {

            this.autoRaf = requestAnimationFrame(this.tick);

            const last = this.autoAt || now;

            this.autoAt = now;

            this.resolveHover();

            // Paused: held by the pointer, mid-drag, mid-settle, or
            // scrolled out of sight.
            if (this.hovering || this.drag || this.raf || !this.onScreen) return;

            const dt = Math.min((now - last) / 1000, 0.05);

            this.pos = this.clamp(this.pos + this.speed * dt);

            // Keep the settle's anchor with us, or the next arrow
            // press would jump back to where the drift began.
            this.target = this.pos;

            const index = this.indexAt(this.pos);

            if (index !== this.selected) this.select(index);

            this.paint();

        }

        /* ==============================
        Geometry
        ============================== */

        // Nearest whole card, folded back into 0..count-1
        indexAt(pos) {

            return ((Math.round(pos) % this.count) + this.count) % this.count;

        }

        clamp(pos) {

            return this.loop
                ? pos
                : Math.max(0, Math.min(this.count - 1, pos));

        }

        measure() {

            const first = this.cards[0];

            if (!first) return;

            this.width = first.offsetWidth;

            this.paint();

        }

        paint() {

            const width = this.width;

            if (!width) return;

            const pitch = width * (1 + this.gap);
            const pos = this.pos;
            const count = this.count;

            for (let i = 0; i < count; i++) {

                const card = this.cards[i];

                // Fold the distance into the shorter way round the
                // ring. This is the whole looping mechanism.
                let offset = i - pos;

                if (this.loop) {

                    offset = ((offset % count) + count) % count;

                    if (offset > count / 2) offset -= count;

                }

                const distance = Math.abs(offset);

                // Tilt and recession both ease off as cards travel
                // out — a linear ramp folds the second card shut.
                const ramp = Math.pow(distance, this.falloff);

                // Capped short of edge-on, or a far card turns its back
                const tilt =
                    Math.min(this.rotate * ramp, 82) * Math.sign(offset);

                card.style.transform =
                    "translateX(calc(-50% + " + (offset * pitch) + "px)) " +
                    "translateZ(" + (-this.depth * width * ramp) + "px) " +
                    "rotateY(" + (-tilt) + "deg)";

                // A card is teleported across the ring at exactly half
                // a turn out, so it has to be gone by then.
                const edge = this.loop
                    ? Math.min(1, Math.max(0, count / 2 - distance))
                    : 1;

                card.style.opacity =
                    Math.max(0, 1 - this.fade * distance) * edge;

                card.style.zIndex = 100 - Math.round(distance);

                card.classList.toggle("is-centre", Math.round(distance) === 0);

            }

        }

        /* ==============================
        Motion
        ============================== */

        step() {

            const remaining = this.target - this.pos;

            if (Math.abs(remaining) < 0.0004) {

                this.pos = this.target;
                this.paint();
                this.raf = 0;

                return;

            }

            // Exponential ease-out, not a spring — no overshoot wanted
            this.pos += remaining * 0.16;

            this.paint();

            this.raf = requestAnimationFrame(this.step);

        }

        settle(target) {

            if (this.raf) cancelAnimationFrame(this.raf);

            this.target = target;

            this.select(this.indexAt(target));

            if (reduced) {

                this.pos = target;
                this.paint();
                this.raf = 0;

                return;

            }

            this.raf = requestAnimationFrame(this.step);

        }

        goTo(index) {

            // Take the shorter way round rather than unwinding the ring
            const target = this.loop
                ? index +
                  Math.round((this.target - index) / this.count) * this.count
                : index;

            this.settle(this.clamp(target));

        }

        nudge(by) {

            this.settle(this.clamp(Math.round(this.target) + by));

        }

        /* ==============================
        Caption + dots
        ============================== */

        buildDots() {

            this.dotWrap = this.el.querySelector(".coverflow-dots");

            if (!this.dotWrap) return;

            this.dots = this.cards.map((card, i) => {

                const dot = document.createElement("button");

                dot.type = "button";
                dot.className = "coverflow-dot";
                dot.setAttribute(
                    "aria-label", "Go to " + (card.dataset.title || i + 1)
                );

                dot.addEventListener("click", () => this.goTo(i));

                this.dotWrap.appendChild(dot);

                return dot;

            });

        }

        select(index) {

            this.selected = index;

            const card = this.cards[index];

            if (!card) return;

            const title = this.el.querySelector(".coverflow-title");
            const note = this.el.querySelector(".coverflow-note");

            if (title) title.textContent = card.dataset.title || "";

            /* The description now lives on the card itself, so an
               external caption reads it from there. data-note is
               still honoured first, for a caption that wants to
               say something shorter than the card does. */

            if (note) {

                const inCard = card.querySelector(".cfCard-note");

                note.textContent = card.dataset.note
                    || (inCard ? inCard.textContent.trim() : "");

            }

            if (this.dots) {

                this.dots.forEach((dot, i) => {

                    dot.classList.toggle("is-on", i === index);
                    dot.setAttribute("aria-current", i === index);

                });

            }

        }

        /* ==============================
        Input
        ============================== */

        bind() {

            const frame = this.frame;

            /* Pointer position only — whether it counts as a hover is
               decided in resolveHover(), against whichever card is
               centred at the time. */

            frame.addEventListener("pointermove", e => {

                this.pointer = { x: e.clientX, y: e.clientY };

            });

            frame.addEventListener("pointerleave", () => {

                this.pointer = null;

            });

            /* A carousel turning off-screen is work nobody sees.
               The margin also gives the artwork a head start —
               it begins loading a screenful before the section
               arrives, so it's ready long before a hover. */

            if (window.IntersectionObserver) {

                new IntersectionObserver(entries => {

                    this.onScreen = entries[0].isIntersecting;

                    if (this.onScreen) this.loadMedia();

                }, { threshold: 0, rootMargin: "800px 0px" }).observe(this.el);

            } else {

                this.loadMedia();

            }

            frame.addEventListener("pointerdown", e => {

                if (this.raf) {

                    cancelAnimationFrame(this.raf);
                    this.raf = 0;

                }

                frame.setPointerCapture(e.pointerId);

                this.target = this.pos;

                this.drag = {
                    id: e.pointerId,
                    x: e.clientX,
                    pos: this.pos,
                    v: 0,
                    t: performance.now()
                };

                frame.classList.add("is-dragging");

            });

            frame.addEventListener("pointermove", e => {

                const drag = this.drag;

                if (!drag || drag.id !== e.pointerId) return;

                const pitch = this.width * (1 + this.gap);

                if (!pitch) return;

                const now = performance.now();
                const previous = this.pos;

                this.pos = this.clamp(drag.pos - (e.clientX - drag.x) / pitch);

                // Cards per second, for the throw
                drag.v =
                    ((this.pos - previous) / Math.max(now - drag.t, 1)) * 1000;

                drag.t = now;

                const index = this.indexAt(this.pos);

                if (index !== this.selected) this.select(index);

                this.paint();

            });

            const end = e => {

                const drag = this.drag;

                if (!drag || drag.id !== e.pointerId) return;

                this.drag = null;

                frame.classList.remove("is-dragging");

                // Let a flick carry, but never more than two cards
                const carried = Math.max(-2, Math.min(2, drag.v * 0.18));

                this.settle(this.clamp(Math.round(this.pos + carried)));

            };

            frame.addEventListener("pointerup", end);
            frame.addEventListener("pointercancel", end);

            frame.addEventListener("keydown", e => {

                if (e.key === "ArrowLeft") {

                    e.preventDefault();
                    this.nudge(-1);

                } else if (e.key === "ArrowRight") {

                    e.preventDefault();
                    this.nudge(1);

                }

            });

            const prev = this.el.querySelector(".coverflow-nav.is-prev");
            const next = this.el.querySelector(".coverflow-nav.is-next");

            if (prev) prev.addEventListener("click", () => this.nudge(-1));
            if (next) next.addEventListener("click", () => this.nudge(1));

            this.cards.forEach((card, i) => {

                card.addEventListener("click", () => {

                    if (i !== this.selected) this.goTo(i);

                });

            });

            // Card width drives pitch, depth and perspective, so it is
            // the only thing worth measuring.
            if (window.ResizeObserver) {

                new ResizeObserver(() => this.measure()).observe(this.frame);

            } else {

                window.addEventListener("resize", () => this.measure());

            }

        }

    }

    function start() {

        document.querySelectorAll(".coverflow").forEach(el => {

            // Handed back on the element so other code can drive it
            // (goTo, stopAuto) without this file exporting anything.
            el.coverflow = new Coverflow(el);

        });

    }

    if (document.readyState === "loading") {

        document.addEventListener("DOMContentLoaded", start);

    } else {

        start();

    }

})();
