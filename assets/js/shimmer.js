/*======================================================
MARKETINGNEXTLEVEL — gradient shimmer

Vanilla port of the React GradientShimmer component. The
effect is CSS: a multi-stop gradient clipped to the text
with background-clip, swept by animating background-position.
This file supplies the measuring, the sweep and the pause
gates that the React version got from hooks.

Kept from the original: preset palettes, named easings, band
built around a saturated core that fades to the base colour,
width-normalised sweep, pause between passes, and pausing
while off-screen / scrolling / on a hidden tab.

Usage:
  <span class="shimmer" data-gradient="twilight">Text</span>
======================================================*/

(function () {

    /* ==============================
    Palettes
    ============================== */

    const PRESETS = {

        sunrise: [
            ["#B6D3EF", 0], ["#D7CFC8", .252], ["#EAC6A5", .424],
            ["#EF9B62", .586], ["#F48D7A", .758], ["#F888A0", 1]
        ],

        twilight: [
            ["#E3CCE6", 0], ["#4E8CD5", .35],
            ["#6068C2", .64], ["#38364E", 1]
        ],

        bay: [
            ["#DBE3D0", 0], ["#8DB8A7", .23], ["#2D8E9A", .42],
            ["#076492", .59], ["#154288", .79], ["#262C81", 1]
        ],

        mint: [
            ["#DECEE8", 0], ["#CBBAEE", .21],
            ["#7DC0FB", .46], ["#00C7A6", 1]
        ],

        /* On-brand: the site's blues with a light lead-in, so the
           sweep reads as a sheen rather than a colour change. */
        brand: [
            ["#C9D8FF", 0], ["#79A2FF", .28],
            ["#5D87FF", .55], ["#305CDE", .8], ["#2148B8", 1]
        ]

    };

    const EASINGS = {
        smooth: "cubic-bezier(0.45, 0, 0.55, 1)",
        gentle: "cubic-bezier(0.76, 0, 0.24, 1)",
        snappy: "cubic-bezier(0.3, 0, 0.2, 1)"
    };

    const BAND_CORE_RATIO = 0.44;
    const SPREAD_MID_RATIO = 0.72;
    const BASE_FONT_PX = 14;
    const MAX_SPREAD_PX = 48;
    const FALLBACK_WIDTH = 96;
    const SCROLL_IDLE_MS = 120;
    const ROOT_MARGIN = "160px";

    /* ==============================
    Band gradient

    Every stop is packed into the saturated core, then fades
    out through a soft mix to the base text colour. Uses the
    runtime --gs-* vars so it scales with font size.
    ============================== */

    function buildBand(stops, angle) {

        const sorted = stops.slice().sort((a, b) => a[1] - b[1]);
        const first = sorted[0][0];
        const last = sorted[sorted.length - 1][0];

        const core = sorted.map(s => {

            const f = (s[1] - .5) * 2 * BAND_CORE_RATIO;

            return s[0] +
                " calc(50% + var(--gs-spread-mid) * " + f.toFixed(4) + ")";

        }).join(", ");

        return [
            "linear-gradient(" + angle + "deg",
            "var(--gs-base) calc(50% - var(--gs-spread))",
            "color-mix(in oklab, var(--gs-base) 42%, " + first +
                ") calc(50% - var(--gs-spread-mid))",
            core,
            "color-mix(in oklab, var(--gs-base) 42%, " + last +
                ") calc(50% + var(--gs-spread-mid))",
            "var(--gs-base) calc(50% + var(--gs-spread)))"
        ].join(", ");

    }

    /* ==============================
    Capability gates
    ============================== */

    const clipsText =
        window.CSS && CSS.supports &&
        (CSS.supports("background-clip", "text") ||
         CSS.supports("-webkit-background-clip", "text"));

    // color-mix is used by the band's fade-out; without it the
    // whole gradient string is invalid and the text would vanish.
    const hasColorMix =
        window.CSS && CSS.supports &&
        CSS.supports("color", "color-mix(in oklab, #000 42%, #fff)");

    const reduced =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ==============================
    Setup
    ============================== */

    function init(el) {

        const text = el.textContent.trim();

        if (!text) return;

        const stops = PRESETS[el.dataset.gradient] || PRESETS.brand;
        const angle = parseFloat(el.dataset.angle) || 105;
        const spread = parseFloat(el.dataset.spread) || 3;
        const seconds = parseFloat(el.dataset.duration) || 1.45;
        const pause = el.dataset.pause !== undefined
            ? parseFloat(el.dataset.pause)
            : 2600;
        const easing = EASINGS[el.dataset.easing] || EASINGS.smooth;
        const base = el.dataset.base || "currentColor";

        // Staggers the first pass so a group of targets reads as
        // one band travelling across them rather than three
        // firing at once. Cycle length is shared, so the offset
        // holds for every pass after that.
        const delay = parseFloat(el.dataset.delay) || 0;

        el.style.setProperty("--gs-base", base);
        el.style.backgroundImage = buildBand(stops, angle);
        el.style.backgroundRepeat = "no-repeat";
        el.style.backgroundColor = "var(--gs-base)";
        el.style.webkitBackgroundClip = "text";
        el.style.backgroundClip = "text";

        // text-fill-color rather than `color: transparent`, so
        // currentColor in --gs-base still resolves to the real one.
        el.style.webkitTextFillColor = "transparent";

        function measure() {

            // offsetWidth, not getBoundingClientRect: the wordmark
            // sits inside a scaled container, and a measured rect
            // would come back multiplied by that scale.
            const width = el.offsetWidth || FALLBACK_WIDTH;
            const font =
                parseFloat(getComputedStyle(el).fontSize) || BASE_FONT_PX;
            const scale = font / BASE_FONT_PX;

            const spreadPx = Math.min(
                text.length * spread * scale,
                MAX_SPREAD_PX * scale
            );

            const layer = Math.max(1, width + spreadPx * 2);

            el.style.setProperty("--gs-spread", spreadPx + "px");
            el.style.setProperty(
                "--gs-spread-mid", (spreadPx * SPREAD_MID_RATIO) + "px"
            );
            el.style.backgroundSize = layer + "px 100%";

            return {
                start: -spreadPx - layer / 2,
                end: width + spreadPx - layer / 2
            };

        }

        measure();

        // Static gradient, no sweep
        if (reduced || typeof el.animate !== "function") return;

        let anim = null;
        let timer = null;
        let active = true;
        let dead = false;

        function sweep() {

            if (dead) return;

            const m = measure();

            const next = el.animate(
                [
                    { backgroundPosition: m.start + "px center" },
                    { backgroundPosition: m.end + "px center" }
                ],
                { duration: seconds * 1000, easing: easing, fill: "forwards" }
            );

            if (!active) next.pause();

            // Cancel the previous pass only once the new one owns the
            // property, or finished fill:forwards animations pile up.
            if (anim) anim.cancel();

            anim = next;

            next.onfinish = function () {
                timer = setTimeout(sweep, Math.max(0, pause));
            };

        }

        /* Gates: viewport, tab visibility, scroll idle */

        let onScreen = true;
        let visible = !document.hidden;
        let still = true;

        function apply() {

            active = onScreen && visible && still;

            if (anim) {
                if (active) anim.play();
                else anim.pause();
            }

        }

        if (window.IntersectionObserver) {

            onScreen = false;

            new IntersectionObserver(entries => {

                onScreen = entries[entries.length - 1].isIntersecting;
                apply();

            }, { rootMargin: ROOT_MARGIN }).observe(el);

        }

        document.addEventListener("visibilitychange", function () {

            visible = !document.hidden;
            apply();

        });

        let idle = null;

        window.addEventListener("scroll", function () {

            still = false;
            apply();

            clearTimeout(idle);

            idle = setTimeout(function () {
                still = true;
                apply();
            }, SCROLL_IDLE_MS);

        }, { passive: true, capture: true });

        if (window.ResizeObserver) {

            new ResizeObserver(function () { measure(); }).observe(el);

        }

        apply();

        if (delay > 0) timer = setTimeout(sweep, delay);
        else sweep();

    }

    function start() {

        const nodes = document.querySelectorAll(".shimmer");

        if (!nodes.length) return;

        // Without either feature the text would render invisible,
        // so leave it as plain text instead.
        if (!clipsText || !hasColorMix) return;

        nodes.forEach(init);

    }

    if (document.readyState === "loading") {

        document.addEventListener("DOMContentLoaded", start);

    } else {

        start();

    }

})();
