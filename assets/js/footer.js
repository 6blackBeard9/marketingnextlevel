/* ==========================================================
   MARKETINGNEXTLEVEL
   Footer drop

   The social buttons fall into the footer, tumble, and settle
   in a pile at whatever angle they land.

   Each button is a capsule — a line segment with a radius —
   which is the shape a pill actually is, and the reason they
   stack against each other convincingly instead of behaving
   like boxes. Impulse solver with a few iterations per frame,
   plus positional correction so a heavy pile doesn't sink.

   No dependency: the rest of this project is hand-written
   vanilla and a physics library would be the largest thing on
   the page by some margin.
   ========================================================== */

(function () {

    "use strict";

    var GRAVITY = 2600;      // px/s²
    var REST = 0.22;         // bounciness — pills are not balls

    /* Below this closing speed a contact is treated as dead.
       Gravity adds ~43px/s per frame, and giving 22% of that
       back every frame leaves a resting pill jittering at ~9px/s
       for ever — never still enough to sleep, and visibly
       buzzing. Real impacts are far faster than this and still
       bounce. */

    var BOUNCE_MIN = 90;
    var FRICTION = 0.34;
    var DAMP = 0.995;        // bleeds energy so a pile settles
    var SPIN_DAMP = 0.975;   // spin decays faster than travel
    var ITER = 8;            // solver passes per step
    /* Overlap under SLOP is left alone. Too small a value and a
       resting stack is corrected every frame, which shifts it,
       which changes the next frame's depth — a limit cycle that
       hums along at ~6px/s and never settles. A pixel of
       tolerance is invisible and breaks the loop. */

    var SLOP = 1.2;
    var CORRECT = 0.3;       // gentler push-out, less ringing
    var SLEEP_V = 14;        // px/s under which a body may sleep
    var SLEEP_FOR = 40;      // frames below that before it sleeps

    /* Hard stop. However well the solver is tuned, a pile can
       find some slow shuffle it never quite escapes, and an
       animation frame running for ever on a finished footer is
       not acceptable. After this the pile is frozen where it
       lies — by which point it has long looked settled. */

    var MAX_RUN = 6000;      // ms

    /* A capsule on a flat floor really does roll, so a pill that
       has all but stopped keeps creeping at ~20px/s and never
       gets still enough to sleep. Below CREEP the remaining
       motion is bled off hard — rolling resistance, in effect.
       Well above any speed you would see as movement. */

    var CREEP = 45;
    var CREEP_DAMP = 0.82;

    var reduced = window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    /* ==============================
    Capsule body
    ============================== */

    function Body(el, w, h) {

        this.el = el;

        this.r = h / 2;                          // cap radius
        this.hl = Math.max(0, w / 2 - this.r);   // half the spine

        this.x = 0;
        this.y = 0;
        this.a = 0;

        this.vx = 0;
        this.vy = 0;
        this.w = 0;

        this.m = (w * h) / 5000;
        this.im = 1 / this.m;

        // Box inertia is close enough for a rounded rectangle
        this.iI = 12 / (this.m * (w * w + h * h));

        this.still = 0;
        this.asleep = false;

    }

    // Centres of the two end caps, in world space
    Body.prototype.ends = function () {

        var c = Math.cos(this.a) * this.hl;
        var s = Math.sin(this.a) * this.hl;

        return [
            { x: this.x - c, y: this.y - s },
            { x: this.x + c, y: this.y + s }
        ];

    };

    Body.prototype.wake = function () {

        this.asleep = false;
        this.still = 0;

    };

    /* ==============================
    Geometry

    Closest points between the two spines. Everything else is
    circle-on-circle once we have them.
    ============================== */

    function closest(a0, a1, b0, b1) {

        var dax = a1.x - a0.x, day = a1.y - a0.y;
        var dbx = b1.x - b0.x, dby = b1.y - b0.y;
        var rx = a0.x - b0.x, ry = a0.y - b0.y;

        var A = dax * dax + day * day;
        var E = dbx * dbx + dby * dby;
        var F = dbx * rx + dby * ry;

        var s = 0, t = 0;

        if (A <= 1e-8 && E <= 1e-8) return [a0, b0];

        if (A <= 1e-8) {

            t = clamp01(F / E);

        } else {

            var C = dax * rx + day * ry;

            if (E <= 1e-8) {

                s = clamp01(-C / A);

            } else {

                var B = dax * dbx + day * dby;
                var d = A * E - B * B;

                s = d !== 0 ? clamp01((B * F - C * E) / d) : 0;
                t = (B * s + F) / E;

                if (t < 0) { t = 0; s = clamp01(-C / A); }
                else if (t > 1) { t = 1; s = clamp01((B - C) / A); }

            }

        }

        return [
            { x: a0.x + dax * s, y: a0.y + day * s },
            { x: b0.x + dbx * t, y: b0.y + dby * t }
        ];

    }

    function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    /* ==============================
    Contact resolution

    One contact: point p, unit normal n pointing out of `b`,
    penetration depth. Applies a normal impulse then a capped
    tangential one, both about the body's centre so they spin.
    ============================== */

    function resolve(b, other, px, py, nx, ny, depth) {

        var rax = px - b.x, ray = py - b.y;
        var rbx = 0, rby = 0;

        if (other) { rbx = px - other.x; rby = py - other.y; }

        // Relative velocity at the contact
        var vx = b.vx - b.w * ray;
        var vy = b.vy + b.w * rax;

        if (other) {
            vx -= other.vx - other.w * rby;
            vy -= other.vy + other.w * rbx;
        }

        var vn = vx * nx + vy * ny;

        if (vn > 0) return;                    // already separating

        var ran = rax * ny - ray * nx;
        var inv = b.im + b.iI * ran * ran;

        var rbn = 0;

        if (other) {
            rbn = rbx * ny - rby * nx;
            inv += other.im + other.iI * rbn * rbn;
        }

        if (inv <= 0) return;

        var e = Math.abs(vn) < BOUNCE_MIN ? 0 : REST;

        var j = (-(1 + e) * vn) / inv;

        b.vx += j * nx * b.im;
        b.vy += j * ny * b.im;
        b.w += ran * j * b.iI;

        if (other) {
            other.vx -= j * nx * other.im;
            other.vy -= j * ny * other.im;
            other.w -= rbn * j * other.iI;
        }

        // Friction along the tangent, Coulomb-capped
        var tx = -ny, ty = nx;

        vx = b.vx - b.w * ray;
        vy = b.vy + b.w * rax;

        if (other) {
            vx -= other.vx - other.w * rby;
            vy -= other.vy + other.w * rbx;
        }

        var vt = vx * tx + vy * ty;
        var rat = rax * ty - ray * tx;
        var invT = b.im + b.iI * rat * rat;

        var rbt = 0;

        if (other) {
            rbt = rbx * ty - rby * tx;
            invT += other.im + other.iI * rbt * rbt;
        }

        if (invT <= 0) return;

        var jt = -vt / invT;
        var cap = FRICTION * Math.abs(j);

        if (jt > cap) jt = cap;
        if (jt < -cap) jt = -cap;

        b.vx += jt * tx * b.im;
        b.vy += jt * ty * b.im;
        b.w += rat * jt * b.iI;

        if (other) {
            other.vx -= jt * tx * other.im;
            other.vy -= jt * ty * other.im;
            other.w -= rbt * jt * other.iI;
        }

        // Push the overlap out, or a stack slowly sinks
        if (depth > SLOP) {

            var push = ((depth - SLOP) * CORRECT) / (b.im + (other ? other.im : 0));

            b.x += push * nx * b.im;
            b.y += push * ny * b.im;

            if (other) {
                other.x -= push * nx * other.im;
                other.y -= push * ny * other.im;
            }

        }

    }

    /* ==============================
    World
    ============================== */

    function World(host, bodies) {

        this.host = host;
        this.bodies = bodies;
        this.w = 0;
        this.h = 0;
        this.raf = 0;
        this.last = 0;

        this.step = this.step.bind(this);

    }

    World.prototype.measure = function () {

        var r = this.host.getBoundingClientRect();

        this.w = r.width;
        this.h = r.height;

    };

    /* Drop them in from above, spread across the width.
       Returns false if the footer has no width yet — at first
       run the loader still covers the page and the box measures
       zero, which would place every body on top of the left
       wall and let the solver fling the pile sideways. */

    World.prototype.reset = function () {

        this.measure();

        if (this.w < 40) return false;

        var n = this.bodies.length;

        for (var i = 0; i < n; i++) {

            var b = this.bodies[i];
            var slot = (i + 0.5) / n;

            b.x = this.w * (0.16 + slot * 0.68) + (Math.random() - 0.5) * 40;
            b.y = -80 - i * 90 - Math.random() * 60;
            b.a = (Math.random() - 0.5) * 1.4;

            b.vx = (Math.random() - 0.5) * 60;
            b.vy = 0;
            b.w = (Math.random() - 0.5) * 3;

            b.wake();

        }

        this.host.classList.add("is-ready");

        this.draw();

        return true;

    };

    // Where every body would sit once settled, no animation
    World.prototype.settleNow = function () {

        this.measure();

        var n = this.bodies.length;

        for (var i = 0; i < n; i++) {

            var b = this.bodies[i];

            b.x = this.w * ((i + 0.5) / n);
            b.y = this.h - b.r - 8;
            b.a = 0;
            b.vx = b.vy = b.w = 0;
            b.asleep = true;

        }

        this.draw();

    };

    World.prototype.walls = function (b) {

        var ends = b.ends();

        for (var i = 0; i < 2; i++) {

            var e = ends[i];

            // floor
            var d = e.y + b.r - this.h;
            if (d > 0) resolve(b, null, e.x, this.h, 0, -1, d);

            // left
            d = b.r - e.x;
            if (d > 0) resolve(b, null, 0, e.y, 1, 0, d);

            // right
            d = e.x + b.r - this.w;
            if (d > 0) resolve(b, null, this.w, e.y, -1, 0, d);

        }

    };

    World.prototype.pairs = function () {

        var list = this.bodies;

        for (var i = 0; i < list.length; i++) {

            for (var k = i + 1; k < list.length; k++) {

                var A = list[i], B = list[k];

                if (A.asleep && B.asleep) continue;

                var ae = A.ends(), be = B.ends();
                var cp = closest(ae[0], ae[1], be[0], be[1]);

                var nx = cp[0].x - cp[1].x;
                var ny = cp[0].y - cp[1].y;

                var dist = Math.sqrt(nx * nx + ny * ny);
                var min = A.r + B.r;

                if (dist >= min) continue;

                if (dist < 1e-6) { nx = 0; ny = -1; dist = 1e-6; }
                else { nx /= dist; ny /= dist; }

                /* Only a moving neighbour wakes a sleeping body.
                   Waking both on any contact resets their
                   still-frame counters every frame, so two pills
                   resting against each other keep each other
                   awake for ever and the pile never sleeps. */

                if (A.asleep && !B.asleep) A.wake();
                else if (B.asleep && !A.asleep) B.wake();

                resolve(A, B,
                    (cp[0].x + cp[1].x) / 2,
                    (cp[0].y + cp[1].y) / 2,
                    nx, ny, min - dist);

            }

        }

    };

    World.prototype.integrate = function (dt) {

        for (var i = 0; i < this.bodies.length; i++) {

            var b = this.bodies[i];

            if (b.asleep) continue;

            b.vy += GRAVITY * dt;

            b.vx *= DAMP;
            b.vy *= DAMP;

            /* Spin bleeds off faster than travel. A pill that
               lands clear of the others keeps rotating on almost
               nothing otherwise, and never reaches the sleep
               threshold. */

            b.w *= SPIN_DAMP;

            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.a += b.w * dt;

        }

    };

    /* Sleep bookkeeping runs after the solver, never inside
       integrate(): gravity has just added ~43px/s to vy at that
       point, so a body resting on the floor looks fast every
       single frame and nothing would ever come to rest. */

    World.prototype.sleepCheck = function () {

        for (var i = 0; i < this.bodies.length; i++) {

            var b = this.bodies[i];

            if (b.asleep) continue;

            var speed = Math.abs(b.vx) + Math.abs(b.vy) + Math.abs(b.w) * 40;

            if (speed < CREEP) {

                b.vx *= CREEP_DAMP;
                b.vy *= CREEP_DAMP;
                b.w *= CREEP_DAMP;

            }

            if (speed < SLEEP_V) {

                if (++b.still > SLEEP_FOR) {

                    b.asleep = true;
                    b.vx = b.vy = b.w = 0;

                }

            } else {

                b.still = 0;

            }

        }

    };

    World.prototype.draw = function () {

        for (var i = 0; i < this.bodies.length; i++) {

            var b = this.bodies[i];

            b.el.style.transform =
                "translate(-50%,-50%) translate(" +
                b.x.toFixed(1) + "px," + b.y.toFixed(1) + "px) rotate(" +
                b.a.toFixed(3) + "rad)";

        }

    };

    World.prototype.asleepAll = function () {

        for (var i = 0; i < this.bodies.length; i++) {

            if (!this.bodies[i].asleep) return false;

        }

        return true;

    };

    World.prototype.freeze = function () {

        for (var i = 0; i < this.bodies.length; i++) {

            var b = this.bodies[i];

            b.vx = b.vy = b.w = 0;
            b.asleep = true;

        }

    };

    World.prototype.step = function (now) {

        if (!this.began) this.began = now;

        if (now - this.began > MAX_RUN) {

            this.freeze();
            this.draw();
            this.raf = 0;

            return;

        }

        var dt = this.last ? (now - this.last) / 1000 : 1 / 60;

        this.last = now;

        // A tab that was in the background hands back a huge dt;
        // stepping that would fire everything through the floor.
        if (dt > 1 / 30) dt = 1 / 30;

        this.integrate(dt);

        for (var k = 0; k < ITER; k++) {

            this.pairs();

            for (var i = 0; i < this.bodies.length; i++) {

                if (!this.bodies[i].asleep) this.walls(this.bodies[i]);

            }

        }

        this.sleepCheck();

        this.draw();

        this.raf = this.asleepAll() ? 0 : requestAnimationFrame(this.step);

    };

    World.prototype.start = function () {

        if (this.raf) return;

        this.last = 0;
        this.began = 0;
        this.raf = requestAnimationFrame(this.step);

    };

    World.prototype.stop = function () {

        if (!this.raf) return;

        cancelAnimationFrame(this.raf);
        this.raf = 0;

    };

    /* ==============================
    Wire up
    ============================== */

    function init() {

        var host = document.querySelector(".footerDrop");

        if (!host) return;

        var els = Array.prototype.slice.call(host.querySelectorAll(".footerDrop-pill"));

        if (!els.length) return;

        var bodies = els.map(function (el) {

            var r = el.getBoundingClientRect();

            return new Body(el, r.width, r.height);

        });

        var world = new World(host, bodies);

        if (reduced) {

            world.settleNow();

            return;

        }

        var dropped = false;

        if (window.IntersectionObserver) {

            new IntersectionObserver(function (entries) {

                if (!entries[0].isIntersecting) return;

                // First sight is also the first time the footer is
                // guaranteed to have been laid out, so this is
                // where the drop is set up rather than at init.
                if (!dropped) dropped = world.reset();

                if (dropped) world.start();

            }, { threshold: 0.25 }).observe(host);

        } else if (world.reset()) {

            world.start();

        }

        // Re-measure and re-drop: a resize changes the floor, and a
        // settled pile would be left hanging in mid-air.
        var t = 0;

        window.addEventListener("resize", function () {

            clearTimeout(t);

            t = setTimeout(function () {

                world.reset();
                world.start();

            }, 200);

        });

        window.footerDrop = world;      // handy for tuning

    }

    if (document.readyState === "loading") {

        document.addEventListener("DOMContentLoaded", init);

    } else {

        init();

    }

})();
