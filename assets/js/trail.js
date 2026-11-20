/* ==========================================================
   MARKETINGNEXTLEVEL
   Work trail

   Vanilla port of the React ImageCursorTrail. The React version
   leaned on refs, JSX state and Tailwind's data-[status] variants;
   none of that is available here, so the status lives on a
   data-status attribute and CSS reacts to it, which is what the
   Tailwind variants were compiling to anyway.

   Pieces are dropped where the pointer has travelled far enough
   from the last one, and the oldest is retired once the trail is
   full. Clicking a piece that is still on screen opens it.
   ========================================================== */

(function () {

    "use strict";

    /* How far the pointer must travel before the next piece is
       laid down, as a fraction of viewport width. The React
       original divided by this, so a bigger number means a
       shorter gap and a denser trail. */

    var STEP_DIVISOR = 22;

    // Pieces on screen at once before the oldest is retired
    var TRAIL_LENGTH = 5;

    /* A trail needs a pointer to trail behind. On a touch screen
       there is none, so the stage sat empty — 92vh of nothing
       where the work should be. These pieces ARE the portfolio,
       so without a pointer they lay out as a grid instead of
       waiting on a gesture that cannot happen. */

    var noHover = window.matchMedia
        ? window.matchMedia("(hover: none)").matches
        : false;

    var reduced = window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
        : false;

    function Trail(host) {

        this.host = host;
        this.items = Array.prototype.slice.call(
            host.querySelectorAll(".trail-item"));

        if (!this.items.length) return;

        this.index = 0;
        this.last = null;         // null until the first move
        this.zTop = 1;
        this.loaded = false;

        this.onMove = this.onMove.bind(this);
        this.onClick = this.onClick.bind(this);
        this.onLeave = this.onLeave.bind(this);

        /* Click stays bound either way — it is what opens a piece,
           and a tap fires it. The move handlers would fight the
           grid: a tap emits a pointermove, which writes inline
           left/top and would scatter the laid-out pieces. */

        if (!noHover) {

            host.addEventListener("pointermove", this.onMove);
            host.addEventListener("pointerleave", this.onLeave);

        }

        host.addEventListener("click", this.onClick);

        // Ten full-size pieces is not a first-paint cost
        if (window.IntersectionObserver) {

            var self = this;

            new IntersectionObserver(function (entries) {

                if (entries[0].isIntersecting) self.load();

            }, { threshold: 0, rootMargin: "700px 0px" }).observe(host);

        } else {

            this.load();

        }

    }

    Trail.prototype.load = function () {

        if (this.loaded) return;

        this.loaded = true;

        this.items.forEach(function (el) {

            if (el.dataset.src) {

                el.src = el.dataset.src;
                delete el.dataset.src;

            }

        });

        this.host.classList.add("is-loaded");

        /* "active" is what onClick checks before opening a piece,
           and what the CSS keys the visible state off — so the
           grid gets it for free by marking every piece on screen. */

        if (noHover) {

            this.items.forEach(function (el) {

                el.dataset.status = "active";

            });

            this.host.classList.add("is-static");

        }

    };

    Trail.prototype.travelled = function (x, y) {

        if (!this.last) return Infinity;

        return Math.hypot(x - this.last.x, y - this.last.y);

    };

    Trail.prototype.show = function (el, x, y) {

        var box = this.host.getBoundingClientRect();

        el.style.left = (x - box.left) + "px";
        el.style.top = (y - box.top) + "px";

        /* z-index climbs so each new piece lands on top of the
           one before. Rolled over well before any browser's
           stacking limit, exactly as the original did. */

        if (this.zTop > 40) this.zTop = 1;

        el.style.zIndex = String(this.zTop++);

        el.dataset.status = "active";

    };

    Trail.prototype.onMove = function (e) {

        if (reduced) return;

        // A click sends a pointermove at the same spot on some
        // devices; ignore anything that hasn't actually moved.
        if (this.travelled(e.clientX, e.clientY) <=
            window.innerWidth / STEP_DIVISOR) return;

        this.load();

        var lead = this.items[this.index % this.items.length];

        var tailAt = this.index - TRAIL_LENGTH;

        var tail = tailAt >= 0
            ? this.items[tailAt % this.items.length]
            : null;

        if (lead) this.show(lead, e.clientX, e.clientY);

        /* The original indexed the tail with a negative modulo,
           which in JS returns a negative index and silently
           retires nothing for the first few moves. Guarded. */

        if (tail && tail !== lead) tail.dataset.status = "inactive";

        this.last = { x: e.clientX, y: e.clientY };

        this.index++;

    };

    /* Clear the stage on the way out. Without this the last few
       pieces are left hanging wherever the pointer happened to
       leave, which reads as a bug rather than as a trail.

       The counters reset too, so coming back in starts a fresh
       run instead of resuming mid-sequence. */

    Trail.prototype.onLeave = function () {

        for (var i = 0; i < this.items.length; i++) {

            this.items[i].dataset.status = "inactive";

        }

        this.index = 0;
        this.last = null;

    };

    Trail.prototype.onClick = function (e) {

        var el = e.target.closest(".trail-item");

        // Only a piece that is actually on screen can be opened
        if (!el || el.dataset.status !== "active") return;

        open(el);

    };

    /* ==============================
    Lightbox
    ============================== */

    var box, stage, caption, closeBtn, lastFocus;

    function open(el) {

        if (!box) return;

        var isVideo = el.tagName === "VIDEO";
        var src = el.currentSrc || el.src;

        stage.innerHTML = "";

        var node;

        if (isVideo) {

            node = document.createElement("video");

            node.src = src;
            node.controls = true;
            node.autoplay = true;
            node.loop = true;
            node.playsInline = true;

            // Muted so it is allowed to start on its own; the
            // controls are there to turn it up.
            node.muted = true;

        } else {

            node = document.createElement("img");

            node.src = src;
            node.alt = el.alt || "";

        }

        node.className = "lightbox-media";

        stage.appendChild(node);

        caption.textContent = (el.dataset.label || "") +
            (el.dataset.client ? " — " + el.dataset.client : "");

        lastFocus = document.activeElement;

        box.hidden = false;

        // Next frame, so the transition has a start state to run from
        requestAnimationFrame(function () {

            box.classList.add("is-open");

        });

        document.body.style.overflow = "hidden";

        closeBtn.focus();

        if (isVideo) {

            var playing = node.play();

            if (playing && playing.catch) playing.catch(function () {});

        }

    }

    function close() {

        if (!box || box.hidden) return;

        box.classList.remove("is-open");

        var video = stage.querySelector("video");

        if (video) video.pause();

        document.body.style.overflow = "";

        // Let it fade before the media is torn down
        setTimeout(function () {

            box.hidden = true;
            stage.innerHTML = "";

        }, 260);

        if (lastFocus && lastFocus.focus) lastFocus.focus();

    }

    function init() {

        box = document.getElementById("workLightbox");

        if (box) {

            stage = box.querySelector(".lightbox-stage");
            caption = box.querySelector(".lightbox-caption");
            closeBtn = box.querySelector(".lightbox-close");

            closeBtn.addEventListener("click", close);

            // Clicking the backdrop closes; clicking the media does not
            box.addEventListener("click", function (e) {

                if (e.target === box || e.target.classList.contains("lightbox-frame")) close();

            });

            document.addEventListener("keydown", function (e) {

                if (e.key === "Escape") close();

            });

        }

        var host = document.getElementById("workTrail");

        if (host) new Trail(host);

    }

    if (document.readyState === "loading") {

        document.addEventListener("DOMContentLoaded", init);

    } else {

        init();

    }

})();
