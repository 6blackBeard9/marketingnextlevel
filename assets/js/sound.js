/*======================================================
MARKETINGNEXTLEVEL — sound engine

The raw mp3s start with a long stretch of silence
(typing.mp3 = 1.15s, tick.mp3 = 1.49s) and typing.mp3 is
27s of continuous typing. Restarting the <audio> element
on every letter therefore only ever plays the silence.

So: decode once with Web Audio, detect every keystroke
onset in the file, and fire a short slice per letter.
Different slice + slight pitch shift each time, which is
what makes it sound like real typing instead of a loop.
======================================================*/

window.MNLSound = (function () {

    const AC = window.AudioContext || window.webkitAudioContext;

    let ctx = null;
    let master = null;

    let keys = null;   // { buffer, onsets: [seconds] }
    let tick = null;   // { buffer, onset }

    let loading = null;
    let unlocked = false;

    let muted = false;

    try {

        muted = localStorage.getItem("mnl-muted") === "1";

    } catch (e) { }

    const listeners = [];

    /* ==============================
    Context
    ============================== */

    function context() {

        if (!ctx && AC) {

            ctx = new AC();

            master = ctx.createGain();
            master.gain.value = muted ? 0 : 1;
            master.connect(ctx.destination);

        }

        return ctx;

    }

    /* ==============================
    Onset detection

    Walk the waveform in short windows and mark the start
    of every transient that rises out of the noise floor.
    ============================== */

    function findOnsets(buffer, opts) {

        const data = buffer.getChannelData(0);
        const rate = buffer.sampleRate;

        const win = Math.floor(rate * 0.005);   // 5ms
        const minGap = opts.minGap || 0.05;
        const limit = opts.limit || 64;

        // Noise floor / peak pass
        let peak = 0;

        for (let i = 0; i < data.length; i += 7) {

            const a = data[i] < 0 ? -data[i] : data[i];

            if (a > peak) peak = a;

        }

        const threshold = Math.max(0.03, peak * 0.22);
        const release = threshold * 0.45;

        const onsets = [];

        let armed = true;
        let last = -1;

        for (let s = 0; s + win < data.length; s += win) {

            let m = 0;

            for (let i = s; i < s + win; i++) {

                const a = data[i] < 0 ? -data[i] : data[i];

                if (a > m) m = a;

            }

            const t = s / rate;

            if (armed && m > threshold && (last < 0 || t - last > minGap)) {

                onsets.push(t);

                last = t;
                armed = false;

                if (onsets.length >= limit) break;

            } else if (!armed && m < release) {

                armed = true;

            }

        }

        return onsets;

    }

    /* ==============================
    Load + decode
    ============================== */

    function decode(url) {

        return fetch(url)
            .then(r => r.arrayBuffer())
            .then(b => new Promise((res, rej) => {

                // callback form for older Safari
                const p = context().decodeAudioData(b, res, rej);

                if (p && p.then) p.then(res, rej);

            }));

    }

    function load() {

        if (loading) return loading;

        if (!AC) {

            loading = Promise.resolve(false);

            return loading;

        }

        loading = Promise.all([

            decode("assets/audio/typing.mp3")
                .then(buffer => {

                    keys = {
                        buffer,
                        onsets: findOnsets(buffer, { minGap: 0.06, limit: 48 })
                    };

                    // Fallback if detection found nothing usable
                    if (keys.onsets.length < 2) keys.onsets = [1.15];

                })
                .catch(() => { keys = null; }),

            decode("assets/audio/tick.mp3")
                .then(buffer => {

                    const o = findOnsets(buffer, { minGap: 0.2, limit: 1 });

                    tick = { buffer, onset: o.length ? o[0] : 0 };

                })
                .catch(() => { tick = null; })

        ]).then(() => true);

        return loading;

    }

    /* ==============================
    Autoplay unlock

    Browsers refuse to start audio until the visitor has
    interacted with the page, so we try immediately and
    then latch onto the first real gesture.
    ============================== */

    const GESTURES = ["pointerdown", "mousedown", "touchend", "keydown"];

    function announce() {

        while (listeners.length) {

            try { listeners.shift()(); } catch (e) { }

        }

    }

    function tryResume() {

        const c = context();

        if (!c) return;

        if (c.state === "running") {

            if (!unlocked) { unlocked = true; announce(); }

            return;

        }

        c.resume().then(() => {

            if (c.state === "running" && !unlocked) {

                unlocked = true;
                announce();

            }

        }).catch(() => { });

    }

    function onGesture() {

        tryResume();

    }

    function watchGestures() {

        GESTURES.forEach(ev =>
            window.addEventListener(ev, onGesture, { passive: true })
        );

    }

    function stopWatching() {

        GESTURES.forEach(ev =>
            window.removeEventListener(ev, onGesture)
        );

    }

    /* ==============================
    Playback
    ============================== */

    function play(buffer, offset, duration, volume, rate) {

        if (!ctx || ctx.state !== "running") return;

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = rate;

        const gain = ctx.createGain();

        const t = ctx.currentTime;
        const fade = 0.006;

        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(volume, t + fade);
        gain.gain.setValueAtTime(volume, t + duration - fade);
        gain.gain.linearRampToValueAtTime(0, t + duration);

        src.connect(gain);
        gain.connect(master);

        src.start(t, Math.max(0, offset - 0.004), duration * rate + 0.02);
        src.stop(t + duration + 0.02);

        src.onended = () => {

            try { src.disconnect(); gain.disconnect(); } catch (e) { }

        };

    }

    /* ==============================
    Public
    ============================== */

    const api = {

        volume: 0.55,

        init() {

            load();
            tryResume();
            watchGestures();

            return api;

        },

        ready() {

            return load();

        },

        get unlocked() {

            return unlocked;

        },

        onUnlock(fn) {

            if (unlocked) fn();
            else listeners.push(fn);

        },

        get muted() {

            return muted;

        },

        set muted(value) {

            muted = !!value;

            try {

                localStorage.setItem("mnl-muted", muted ? "1" : "0");

            } catch (e) { }

            if (master) {

                const t = ctx.currentTime;

                master.gain.cancelScheduledValues(t);
                master.gain.setValueAtTime(master.gain.value, t);
                master.gain.linearRampToValueAtTime(muted ? 0 : 1, t + 0.12);

            }

        },

        /* One keystroke. `scale` trims the level for the
           hero line, which types for as long as you stay. */
        key(scale) {

            if (!keys || !unlocked || muted) return;

            const list = keys.onsets;
            const at = list[(Math.random() * list.length) | 0];

            play(
                keys.buffer,
                at,
                0.115,
                api.volume * (scale || 1) * (0.75 + Math.random() * 0.35),
                0.94 + Math.random() * 0.14
            );

        },

        /* Confirmation chime */
        tick() {

            if (!tick || !unlocked || muted) return;

            play(tick.buffer, tick.onset, 1.1, api.volume * 1.15, 1);

        },

        dispose() {

            stopWatching();

        }

    };

    return api;

})();

MNLSound.init();
