/* ==========================================================
   MARKETINGNEXTLEVEL
   Manifesto

   The section is a tall scroll track with a pinned stage. How
   far you are through the track decides how far the stack of
   words has travelled, so one screen of scrolling moves the
   stack by exactly one word.

   Travel is measured from the words themselves rather than
   assumed, so changing the type size or adding a word needs no
   change here.
   ========================================================== */

(function () {

    "use strict";

    function init() {

        var section = document.getElementById("manifesto");

        if (!section) return;

        var stage = section.querySelector(".manifesto-stage");
        var stack = section.querySelector(".manifesto-stack");
        var note = section.querySelector(".manifesto-note");

        if (!stage || !stack) return;

        var words = Array.prototype.slice.call(
            stack.querySelectorAll(".manifesto-word"));

        if (!words.length) return;

        /* The last word holds while the note comes up, so it
           gets no travel of its own — the stack stops with it
           centred. */

        var travelWords = words.length - 1;

        var still = window.matchMedia
            ? window.matchMedia("(prefers-reduced-motion: reduce)")
            : null;

        var queued = false;
        var lastOn = -1;

        function draw() {

            queued = false;

            var box = section.getBoundingClientRect();
            var vh = window.innerHeight;

            // Scroll budget: everything past the first pinned screen
            var budget = box.height - vh;

            if (budget <= 0) return;

            var p = -box.top / budget;

            p = p < 0 ? 0 : p > 1 ? 1 : p;

            /* The note owns the last fifth of the track; the words
               finish before it starts so the two never fight for
               the same stretch of scroll. */

            var NOTE_FROM = 0.82;

            var wordP = p < NOTE_FROM ? p / NOTE_FROM : 1;

            var noteP = p < NOTE_FROM ? 0 : (p - NOTE_FROM) / (1 - NOTE_FROM);

            // Measured, not assumed — type size can change freely
            var step = words.length > 1
                ? words[1].offsetTop - words[0].offsetTop
                : 0;

            var shift = wordP * travelWords * step;

            stack.style.transform = "translateY(" + (-shift).toFixed(1) + "px)";

            // Whichever word is nearest the middle is the one being read
            var on = Math.round(wordP * travelWords);

            if (on !== lastOn) {

                for (var i = 0; i < words.length; i++) {

                    words[i].classList.toggle("is-on", i === on);

                }

                lastOn = on;

            }

            if (note) {

                note.style.setProperty("--note", noteP.toFixed(3));

            }

        }

        function onScroll() {

            if (queued) return;

            queued = true;

            requestAnimationFrame(draw);

        }

        // Reduced motion: no travel, just the first word and the note
        if (still && still.matches) {

            words[0].classList.add("is-on");

            if (note) note.style.setProperty("--note", "1");

            return;

        }

        draw();

        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);

    }

    if (document.readyState === "loading") {

        document.addEventListener("DOMContentLoaded", init);

    } else {

        init();

    }

})();
