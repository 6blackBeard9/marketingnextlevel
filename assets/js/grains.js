/*======================================================
MARKETINGNEXTLEVEL — grain field

Crisp: every grain is snapped to a whole device pixel and
the frame is cleared outright, so nothing is antialiased
or smeared. Scales to retina / 4K by rendering in device
pixels instead of CSS pixels.

Smooth: the pointer is eased, the repel falloff is a
smoothstep (no hard edge at the radius), and the physics
are delta-time based so the return home is the same on a
60Hz or a 144Hz screen.
======================================================*/

(function () {

    const canvas = document.getElementById("grainCanvas");

    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });

    const loader = document.getElementById("loader");

    const reduced =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ==============================
    Tuning
    ============================== */

    const BG = "#050505";

    const DPR_CAP = 3;          // guard against absurd scale factors
    const AREA_PER_GRAIN = 230; // CSS px² per grain — keeps density even
    const MIN_GRAINS = 3500;
    const MAX_GRAINS = 18000;

    const REPEL_RADIUS = 0.17;  // of the shorter viewport side
    const MAX_OFFSET = 26;      // CSS px a grain may stray from home
    const SPRING = 0.028;       // pull back home
    const DAMPING = 0.87;       // per 60fps frame — soft landing, no snap
    const PUSH = 1.15;          // repel strength

    const POINTER_EASE = 0.25;  // pointer smoothing per 60fps frame
    const FADE_EASE = 0.06;     // influence fade in / out

    const LEVELS = 40;          // alpha quantisation buckets
    const MAX_ALPHA = 0.8;
    const MIN_ALPHA = 0.012;

    /* ==============================
    Canvas sizing
    ============================== */

    let dpr = 1;
    let cssW = 0, cssH = 0;   // layout pixels
    let W = 0, H = 0;         // device pixels

    function needsResize() {

        const rect = canvas.getBoundingClientRect();

        const w = rect.width || window.innerWidth;
        const h = rect.height || window.innerHeight;
        const d = Math.min(window.devicePixelRatio || 1, DPR_CAP);

        return Math.abs(w - cssW) > 0.5 ||
            Math.abs(h - cssH) > 0.5 ||
            d !== dpr;

    }

    function measure() {

        const rect = canvas.getBoundingClientRect();

        cssW = rect.width || window.innerWidth;
        cssH = rect.height || window.innerHeight;

        dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);

        // One canvas pixel per physical screen pixel — anything
        // else and the browser rescales the grains into mush.
        W = Math.max(1, Math.round(cssW * dpr));
        H = Math.max(1, Math.round(cssH * dpr));

        canvas.width = W;
        canvas.height = H;

        // Draw 1:1 in device pixels — this is what keeps the
        // grains sharp instead of landing on half pixels.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;

        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, W, H);

    }

    /* ==============================
    Grain field (structure of arrays)
    ============================== */

    let count = 0;

    let homeX, homeY, offX, offY, velX, velY;
    let grainSize, grainAlpha, wander, seed, flickerSeed, motion, strength;

    let drawX, drawY, level;
    let bucket, bucketStart, bucketFill, order;

    function build() {

        count = Math.max(
            MIN_GRAINS,
            Math.min(
                MAX_GRAINS,
                Math.round((cssW * cssH) / AREA_PER_GRAIN)
            )
        );

        homeX = new Float32Array(count);
        homeY = new Float32Array(count);
        offX = new Float32Array(count);
        offY = new Float32Array(count);
        velX = new Float32Array(count);
        velY = new Float32Array(count);

        grainSize = new Uint8Array(count);
        grainAlpha = new Float32Array(count);
        wander = new Float32Array(count);
        seed = new Float32Array(count);
        flickerSeed = new Float32Array(count);
        motion = new Float32Array(count);
        strength = new Float32Array(count);

        drawX = new Int32Array(count);
        drawY = new Int32Array(count);
        level = new Uint8Array(count);

        bucket = new Uint32Array(LEVELS + 1);        // last = "skip"
        bucketStart = new Uint32Array(LEVELS + 2);
        bucketFill = new Uint32Array(LEVELS + 1);
        order = new Uint32Array(count);

        const small = Math.max(1, Math.round(dpr));
        const large = Math.max(2, Math.round(2 * dpr));

        for (let i = 0; i < count; i++) {

            homeX[i] = Math.random() * W;
            homeY[i] = Math.random() * H;

            seed[i] = Math.random() * Math.PI * 2;
            flickerSeed[i] = Math.random() * Math.PI * 2;
            motion[i] = 0.6 + Math.random() * 0.8;

            const depth = Math.random();
            const bright = (220 + Math.random() * 35) / 255;

            // Nearer grains are bigger, brighter and shoved harder.
            if (depth < 0.70) {

                grainSize[i] = small;
                grainAlpha[i] = (0.09 + Math.random() * 0.09) * bright;
                wander[i] = 1.4 * dpr;

            } else if (depth < 0.93) {

                grainSize[i] = small;
                grainAlpha[i] = (0.20 + Math.random() * 0.16) * bright;
                wander[i] = 2.6 * dpr;

            } else {

                grainSize[i] = large;
                grainAlpha[i] = (0.45 + Math.random() * 0.30) * bright;
                wander[i] = 4.5 * dpr;

            }

            strength[i] = (0.25 + depth * 0.75) * PUSH * dpr;

        }

    }

    /* ==============================
    Pointer
    ============================== */

    let pointerX = 0, pointerY = 0;   // target, device px
    let smoothX = 0, smoothY = 0;     // eased
    let influence = 0, targetInfluence = 0;
    let seenPointer = false;

    function onPointerMove(e) {

        const rect = canvas.getBoundingClientRect();

        pointerX = (e.clientX - rect.left) * dpr;
        pointerY = (e.clientY - rect.top) * dpr;

        if (!seenPointer) {

            // Don't sweep in from the corner on the first move.
            smoothX = pointerX;
            smoothY = pointerY;
            seenPointer = true;

        }

        targetInfluence = 1;

    }

    function onPointerOut() {

        targetInfluence = 0;

    }

    if (!reduced) {

        window.addEventListener("pointermove", onPointerMove, { passive: true });
        window.addEventListener("pointerdown", onPointerMove, { passive: true });
        window.addEventListener("pointerleave", onPointerOut);
        window.addEventListener("blur", onPointerOut);

    }

    /* ==============================
    Resize
    ============================== */

    let resizeTimer = null;

    function rebuild() {

        if (!needsResize()) return;

        measure();
        build();

    }

    function onResize() {

        clearTimeout(resizeTimer);

        resizeTimer = setTimeout(rebuild, 150);

    }

    window.addEventListener("resize", onResize);

    // The element's box can settle after first paint (fonts,
    // scrollbars, a pane being revealed), and devicePixelRatio
    // changes when the window moves to another display.
    if (window.ResizeObserver) {

        new ResizeObserver(onResize).observe(canvas);

    }

    /* ==============================
    Loop
    ============================== */

    let time = 0;
    let last = 0;
    let raf = 0;
    let dprRaw = window.devicePixelRatio || 1;

    function hidden() {

        return !!loader &&
            (loader.style.display === "none" ||
                !loader.isConnected);

    }

    function frame(now) {

        if (hidden()) {

            raf = 0;
            return;

        }

        raf = requestAnimationFrame(frame);

        if (document.hidden) { last = now; return; }

        if ((window.devicePixelRatio || 1) !== dprRaw) {

            dprRaw = window.devicePixelRatio || 1;
            rebuild();

        }

        // Delta expressed in 60fps frames, clamped so an
        // alt-tab doesn't launch every grain off screen.
        const dt = last ? Math.min((now - last) / 16.6667, 3) : 1;
        last = now;

        time += 0.003 * dt;

        const pEase = 1 - Math.pow(1 - POINTER_EASE, dt);
        const fEase = 1 - Math.pow(1 - FADE_EASE, dt);

        smoothX += (pointerX - smoothX) * pEase;
        smoothY += (pointerY - smoothY) * pEase;
        influence += (targetInfluence - influence) * fEase;

        const damp = Math.pow(DAMPING, dt);
        const spring = SPRING * dt;

        const R = Math.min(W, H) * REPEL_RADIUS;
        const R2 = R * R;
        const active = influence > 0.002;

        const maxOff = MAX_OFFSET * dpr;
        const maxOff2 = maxOff * maxOff;

        const edge = Math.min(W, H) * 0.08;
        const step = MAX_ALPHA / LEVELS;

        bucket.fill(0);

        for (let i = 0; i < count; i++) {

            let ox = offX[i];
            let oy = offY[i];

            const hx = homeX[i];
            const hy = homeY[i];

            let ax = -ox * spring;
            let ay = -oy * spring;

            if (active) {

                // Push from where the grain actually is, not
                // from its home — reads far more like fluid.
                const dx = hx + ox - smoothX;
                const dy = hy + oy - smoothY;

                const d2 = dx * dx + dy * dy;

                if (d2 < R2 && d2 > 0) {

                    const d = Math.sqrt(d2);

                    let f = 1 - d / R;

                    // smoothstep: no pop at the rim, no spike at the core
                    f = f * f * (3 - 2 * f);

                    const push = (f * strength[i] * influence * dt) / d;

                    ax += dx * push;
                    ay += dy * push;

                }

            }

            let vx = (velX[i] + ax) * damp;
            let vy = (velY[i] + ay) * damp;

            ox += vx * dt;
            oy += vy * dt;

            const off2 = ox * ox + oy * oy;

            if (off2 > maxOff2) {

                const k = maxOff / Math.sqrt(off2);

                ox *= k;
                oy *= k;
                vx *= k;
                vy *= k;

            }

            velX[i] = vx;
            velY[i] = vy;
            offX[i] = ox;
            offY[i] = oy;

            const t = time * motion[i];
            const s = seed[i];
            const w = wander[i];

            const x = hx + ox +
                Math.sin(t + s) * w +
                Math.cos(t * 0.6 + s) * w * 0.5;

            const y = hy + oy +
                Math.cos(t + s) * w +
                Math.sin(t * 0.5 + s) * w * 0.5;

            let fade = 1;

            if (x < edge) fade *= x / edge;
            if (y < edge) fade *= y / edge;
            if (W - x < edge) fade *= (W - x) / edge;
            if (H - y < edge) fade *= (H - y) / edge;

            if (fade <= 0) { level[i] = LEVELS; continue; }

            const alpha =
                (grainAlpha[i] +
                    Math.sin(time * (2 + motion[i]) + flickerSeed[i]) * 0.02) *
                fade;

            if (alpha < MIN_ALPHA) { level[i] = LEVELS; continue; }

            let lv = (alpha / step) | 0;

            if (lv >= LEVELS) lv = LEVELS - 1;

            level[i] = lv;
            bucket[lv]++;

            // Whole device pixels only — this is the crisp part.
            drawX[i] = x | 0;
            drawY[i] = y | 0;

        }

        /* Counting sort into alpha buckets so fillStyle /
           globalAlpha changes ~40 times a frame, not 9000. */

        let acc = 0;

        for (let l = 0; l <= LEVELS; l++) {

            bucketStart[l] = acc;
            bucketFill[l] = acc;
            acc += bucket[l];

        }

        bucketStart[LEVELS + 1] = acc;

        for (let i = 0; i < count; i++) {

            const lv = level[i];

            if (lv === LEVELS) continue;

            order[bucketFill[lv]++] = i;

        }

        /* Draw */

        ctx.globalAlpha = 1;
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle = "#ffffff";

        for (let l = 0; l < LEVELS; l++) {

            const from = bucketStart[l];
            const to = bucketFill[l];

            if (to === from) continue;

            ctx.globalAlpha = (l + 0.5) * step;

            for (let k = from; k < to; k++) {

                const i = order[k];
                const s = grainSize[i];

                ctx.fillRect(drawX[i], drawY[i], s, s);

            }

        }

        ctx.globalAlpha = 1;

    }

    function start() {

        if (!raf) {

            last = 0;
            raf = requestAnimationFrame(frame);

        }

    }

    document.addEventListener("visibilitychange", () => {

        if (!document.hidden && !hidden()) start();

    });

    measure();
    build();
    start();

})();
