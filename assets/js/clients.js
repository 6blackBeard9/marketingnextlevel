/*======================================================
MARKETINGNEXTLEVEL — marquee along an SVG path

Vanilla port of the React `MarqueeAlongSvgPath` component.
The effect is really just two CSS properties — offset-path
and offset-distance — so no framework is needed; this file
supplies the animation loop, drag and responsive scaling
that the React version got from `motion`.

Feature parity kept: base velocity, direction, slowdown on
hover, drag with inertia, drag-aware direction, rolling
z-index, repeat, responsive scaling.

Markup contract:

  <div class="pathMarquee" data-path="M…" data-viewbox="0 0 996 330">
    <ul class="pm-source"><li>Item</li>…</ul>
  </div>

The <ul> is the data source and stays in the DOM as the
no-JS fallback.
======================================================*/

(function () {

    const wrap = (min, max, value) => {

        const range = max - min;

        return ((((value - min) % range) + range) % range) + min;

    };

    const supported =
        window.CSS &&
        CSS.supports &&
        CSS.supports("offset-path", "path('M0 0 L10 10')");

    const reduced =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    class PathMarquee {

        constructor(el) {

            this.el = el;

            this.path = el.dataset.path;

            const vb = (el.dataset.viewbox || "0 0 996 330")
                .trim().split(/\s+/).map(Number);

            this.vw = vb[2] || 996;
            this.vh = vb[3] || 330;

            this.velocity = parseFloat(el.dataset.velocity) || 6;
            this.repeat = parseInt(el.dataset.repeat, 10) || 2;
            this.spacing = parseFloat(el.dataset.spacing) || 0;
            this.direction = el.dataset.direction === "reverse" ? -1 : 1;

            this.slowFactor = parseFloat(el.dataset.slowFactor) || 0.25;
            this.hoverSlow = el.dataset.hoverSlow !== "false";

            this.draggable = el.dataset.draggable !== "false";
            this.dragSensitivity =
                parseFloat(el.dataset.dragSensitivity) || 0.08;
            this.dragDecay = parseFloat(el.dataset.dragDecay) || 0.94;
            this.dragAware = el.dataset.dragAware !== "false";

            this.zBase = parseInt(el.dataset.zBase, 10) || 1;
            this.zRange = parseInt(el.dataset.zRange, 10) || 12;

            this.fade = el.dataset.fade !== undefined
                ? parseFloat(el.dataset.fade)
                : 7;

            // "auto" banks each card into the curve (the look of the
            // reference clip); "0deg" pins them upright for legibility.
            this.rotate = el.dataset.rotate || "auto";

            this.offset = 0;
            this.dir = this.direction;
            this.hover = 1;
            this.hovered = false;

            this.dragging = false;
            this.dragVel = 0;
            this.lastPointer = { x: 0, y: 0 };

            this.visible = true;
            this.paused = false;
            this.raf = 0;
            this.last = 0;

            this.frame = this.frame.bind(this);

            this.build();

        }

        /* ==============================
        DOM
        ============================== */

        build() {

            const source = this.el.querySelector(".pm-source");

            const originals = source
                ? Array.from(source.children)
                : [];

            if (!originals.length) return;

            this.el.style.aspectRatio = this.vw + " / " + this.vh;

            const stage = document.createElement("div");
            stage.className = "pm-stage";
            stage.style.width = this.vw + "px";
            stage.style.height = this.vh + "px";

            // Path preview, only painted when data-show-path="true"
            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");

            svg.setAttribute("viewBox", "0 0 " + this.vw + " " + this.vh);
            svg.setAttribute("width", this.vw);
            svg.setAttribute("height", this.vh);
            svg.setAttribute("class", "pm-svg");
            svg.setAttribute("aria-hidden", "true");

            const p = document.createElementNS(svgNS, "path");
            p.setAttribute("d", this.path);
            p.setAttribute("fill", "none");

            if (this.el.dataset.showPath === "true") {

                p.setAttribute("stroke", "currentColor");
                p.setAttribute("stroke-width", "1");

            } else {

                p.setAttribute("stroke", "none");

            }

            svg.appendChild(p);
            stage.appendChild(svg);

            this.items = [];

            /* How many cards ride the curve.

               data-spacing sets the gap between card centres in path
               units, so setting it to the card width makes them sit
               edge to edge no matter how long the client list is.
               Never fewer slots than names, or names would go unseen.
               Falls back to data-repeat when spacing is not given. */

            let total;

            if (this.spacing > 0) {

                const length = p.getTotalLength();

                total = Math.max(
                    originals.length,
                    Math.round(length / this.spacing)
                );

            } else {

                total = originals.length * this.repeat;

            }

            for (let i = 0; i < total; i++) {

                const node = originals[i % originals.length];

                const item = document.createElement("div");
                item.className = "pm-item";

                // offset-path takes a raw path string; it is NOT
                // affected by the SVG viewBox, which is why the
                // stage is scaled manually below.
                item.style.offsetPath = "path('" + this.path + "')";
                item.style.offsetRotate = this.rotate;
                item.style.willChange = "offset-distance";

                const inner = document.createElement("div");
                inner.className = "pm-inner";

                // Wrapped so the label can be measured against the
                // card. An <img> logo passes straight through — the
                // span is transparent to .pm-inner img.
                inner.innerHTML =
                    '<span class="pm-label">' + node.innerHTML + "</span>";

                item.appendChild(inner);

                if (i >= originals.length) {

                    item.setAttribute("aria-hidden", "true");

                }

                stage.appendChild(item);

                this.items.push({ el: item, index: i });

            }

            this.stage = stage;
            this.el.appendChild(stage);
            this.el.classList.add("pm-ready");

            this.fitLabels();

            this.bind();
            this.resize();
            this.apply();

            if (!reduced) this.start();

        }

        /* ==============================
        Label fitting

        The card is a fixed 74x62 and stays that way, so a long
        client name has to meet the box rather than the other
        way round: step the type down until the label fits.

        Two ways it can fail to fit — a word wider than the card
        ("Mahasangram") shows up as horizontal overflow, too many
        lines as vertical. Both are checked.

        Cards are clones of the same list, so each distinct name
        is measured once and the result reused. The box is a
        fixed px size and the stage scales around it, which means
        this holds at every viewport and never needs to re-run.
        ============================== */

        fitLabels() {

            const MAX = 12;
            const MIN = 7;
            const STEP = 0.5;

            const solved = new Map();

            this.el.querySelectorAll(".pm-inner").forEach(inner => {

                const label = inner.querySelector(".pm-label");

                // A logo image has nothing to size
                if (!label || !label.textContent.trim()) return;

                const key = label.textContent.trim();

                if (solved.has(key)) {

                    inner.style.fontSize = solved.get(key);

                    return;

                }

                const cs = getComputedStyle(inner);

                const availH = inner.clientHeight
                    - parseFloat(cs.paddingTop)
                    - parseFloat(cs.paddingBottom);

                let size = MAX;

                inner.style.fontSize = size + "px";

                while (
                    size > MIN &&
                    (label.scrollWidth > label.clientWidth + 0.5 ||
                     label.scrollHeight > availH + 0.5)
                ) {

                    size -= STEP;

                    inner.style.fontSize = size + "px";

                }

                solved.set(key, size + "px");

            });

        }

        /* ==============================
        Events
        ============================== */

        bind() {

            if (window.ResizeObserver) {

                new ResizeObserver(() => this.resize()).observe(this.el);

            } else {

                window.addEventListener("resize", () => this.resize());

            }

            if (this.hoverSlow) {

                this.el.addEventListener("pointerenter",
                    () => { this.hovered = true; });

                this.el.addEventListener("pointerleave",
                    () => { this.hovered = false; });

            }

            if (this.draggable) {

                this.el.classList.add("pm-grab");

                this.el.addEventListener("pointerdown", e => {

                    this.el.setPointerCapture(e.pointerId);
                    this.dragging = true;
                    this.dragVel = 0;
                    this.lastPointer = { x: e.clientX, y: e.clientY };
                    this.el.classList.add("pm-grabbing");

                });

                this.el.addEventListener("pointermove", e => {

                    if (!this.dragging) return;

                    const dx = e.clientX - this.lastPointer.x;
                    const dy = e.clientY - this.lastPointer.y;

                    // Movement magnitude, signed by horizontal travel —
                    // the path doubles back, so raw dx alone feels wrong.
                    const mag = Math.sqrt(dx * dx + dy * dy);

                    this.dragVel =
                        (dx > 0 ? mag : -mag) * this.dragSensitivity;

                    this.lastPointer = { x: e.clientX, y: e.clientY };

                });

                const release = e => {

                    if (!this.dragging) return;

                    try { this.el.releasePointerCapture(e.pointerId); }
                    catch (err) { }

                    this.dragging = false;
                    this.el.classList.remove("pm-grabbing");

                };

                this.el.addEventListener("pointerup", release);
                this.el.addEventListener("pointercancel", release);

            }

            // Don't burn frames when the section is off screen
            if (window.IntersectionObserver) {

                new IntersectionObserver(entries => {

                    this.visible = entries[0].isIntersecting;

                    if (this.visible && !reduced) this.start();

                }, { threshold: 0 }).observe(this.el);

            }

        }

        /* ==============================
        Layout

        offset-path works in CSS pixels and ignores the SVG
        viewBox, so the stage is kept at viewBox size and
        scaled as a whole.
        ============================== */

        resize() {

            // Below the breakpoint the stylesheet hides the stage and
            // shows the plain list instead — scaling to phone width
            // would render the names at about 7px.
            const off = getComputedStyle(this.stage).display === "none";

            if (off !== this.paused) {

                this.paused = off;

                if (!off && !reduced) this.start();

            }

            if (off) return;

            const w = this.el.clientWidth;

            if (!w) return;

            const scale = w / this.vw;

            this.stage.style.transform = "scale(" + scale + ")";
            this.stage.style.transformOrigin = "top left";

            // The whole stage is scaled, so type would scale with it —
            // ~11px on a small laptop, ~23px on a wide monitor. Chips
            // divide by this to hold one rendered size everywhere.
            this.stage.style.setProperty("--pm-scale", scale);

        }

        /* ==============================
        Loop
        ============================== */

        apply() {

            const n = this.items.length;
            const fade = this.fade;

            for (let i = 0; i < n; i++) {

                const it = this.items[i];

                const d = wrap(0, 100, this.offset + (it.index * 100) / n);

                it.el.style.offsetDistance = d + "%";

                it.el.style.zIndex =
                    Math.floor(this.zBase + (d / 100) * this.zRange);

                // The path is open, so an item reaching 100% jumps back
                // to 0%. Fading the last and first stretch hides the cut.
                let o = 1;

                if (d < fade) o = d / fade;
                else if (d > 100 - fade) o = (100 - d) / fade;

                it.el.style.opacity = o;

            }

        }

        frame(now) {

            if (!this.visible || this.paused) { this.raf = 0; return; }

            this.raf = requestAnimationFrame(this.frame);

            if (document.hidden) { this.last = now; return; }

            const dt = this.last
                ? Math.min((now - this.last) / 1000, 0.1)
                : 1 / 60;

            this.last = now;

            const target = this.hovered && this.hoverSlow
                ? this.slowFactor
                : 1;

            this.hover += (target - this.hover) *
                (1 - Math.pow(1 - 0.12, dt * 60));

            let move = 0;

            if (!this.dragging) {

                move = this.dir * this.velocity * dt * this.hover;

            }

            move += this.dragVel;

            if (this.dragAware && Math.abs(this.dragVel) > 0.1) {

                this.dir = Math.sign(this.dragVel) || this.dir;

            }

            if (!this.dragging) {

                this.dragVel *= Math.pow(this.dragDecay, dt * 60);

                if (Math.abs(this.dragVel) < 0.01) this.dragVel = 0;

            }

            this.offset = wrap(0, 100, this.offset + move);

            this.apply();

        }

        start() {

            if (this.raf) return;

            this.last = 0;
            this.raf = requestAnimationFrame(this.frame);

        }

    }

    function init() {

        const nodes = document.querySelectorAll(".pathMarquee");

        if (!nodes.length) return;

        if (!supported) {

            // Falls back to the plain .pm-source list
            nodes.forEach(n => n.classList.add("pm-unsupported"));

            return;

        }

        nodes.forEach(n => new PathMarquee(n));

    }

    if (document.readyState === "loading") {

        document.addEventListener("DOMContentLoaded", init);

    } else {

        init();

    }

})();
