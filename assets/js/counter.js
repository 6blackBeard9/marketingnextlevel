/*======================================================
MARKETINGNEXTLEVEL — stat counters

Counts up to data-count and appends data-suffix, so a card
can read 500+, 50M+ or 98% without the suffix being baked
into the number.

Runs when the card scrolls into view rather than on load —
the stats sit well below the fold, so animating them at
page load means nobody sees it happen.
======================================================*/

(function () {

    const counters = document.querySelectorAll(".counter");

    if (!counters.length) return;

    const DURATION = 1500;

    const reduced =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const easeOut = t => 1 - Math.pow(1 - t, 3);

    function settle(el) {

        el.textContent =
            (parseFloat(el.dataset.count) || 0) + (el.dataset.suffix || "");

    }

    function run(el) {

        const target = parseFloat(el.dataset.count) || 0;
        const suffix = el.dataset.suffix || "";
        const started = performance.now();

        function step(now) {

            const t = Math.min(1, (now - started) / DURATION);

            el.textContent = Math.round(target * easeOut(t)) + suffix;

            if (t < 1) requestAnimationFrame(step);

        }

        requestAnimationFrame(step);

    }

    if (reduced) {

        counters.forEach(settle);

        return;

    }

    if (!window.IntersectionObserver) {

        counters.forEach(run);

        return;

    }

    const io = new IntersectionObserver((entries, obs) => {

        entries.forEach(entry => {

            if (!entry.isIntersecting) return;

            run(entry.target);

            // One pass only — re-counting on every scroll-by is noise
            obs.unobserve(entry.target);

        });

    }, { threshold: .4 });

    counters.forEach(c => io.observe(c));

})();
