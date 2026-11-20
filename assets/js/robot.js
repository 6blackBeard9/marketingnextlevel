/* ==========================================================
   MARKETINGNEXTLEVEL
   Hero robot

   Vanilla port of the React RobotHero. The original was
   @react-three/fiber + drei; neither exists here, so the scene
   graph, the render loop and the two drei helpers are written
   out by hand. Only three.js itself is a real dependency, and
   it comes off the CDN like GSAP already does.

   What replaced what:
     <Canvas>            -> renderer + camera + loop below
     useFrame            -> the tick() function
     drei <Environment>  -> RoomEnvironment through PMREM
     drei <ContactShadow>-> a radial-gradient plane under it
     state.pointer       -> pointer tracked off the canvas
     state.viewport      -> world size solved from the fov

   The navbar from the original is deliberately not here — the
   site has its own.
   ========================================================== */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/* How large the robot is allowed to get. The one dial worth
   reaching for if it wants to be bigger or smaller. */

const SCALE_CAP = 1.45;

const CANVAS = document.getElementById("robotCanvas");

if (CANVAS) start(CANVAS);

function start(canvas) {

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ==============================
    Look
    ============================== */

    const design = {
        chassis: "#c4c4c4",
        screen: "#00ffc6",
        screenPower: 3.8,
        screenGlow: 1.2,
        eyeGap: 0.07,
        eyeScale: 1.1,
        earScale: 1.3,
        blinkCycle: 3.0,
        blinkDuration: 0.45,
        headHeight: 0.6,
        ambient: 0.75
    };

    const motion = {
        moveSpeed: 0.35,
        bodyRotSpeed: 10.0,
        headRotSpeed: 20.0,
        bodyTiltY: 0.95,
        headLookX: 0.3,
        headLookY: 1.8
    };

    /* ==============================
    Renderer, camera, environment
    ============================== */

    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true            // the panel's own background shows through
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0.2, 6);

    scene.add(new THREE.AmbientLight(0xffffff, design.ambient));

    /* drei's <Environment preset="studio"> is an HDR lookup. The
       robot's own materials sit at envMapIntensity 0, so this is
       really only lighting the ears and trim — RoomEnvironment
       ships with three and is close enough for that. */

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    /* ==============================
    Procedural chassis texture

    Straight port: speckled colour map plus a matching bump, so
    the shell reads as moulded plastic rather than plain grey.
    ============================== */

    function makeChassisMaps() {

        const size = 512;
        const colour = document.createElement("canvas");
        const bump = document.createElement("canvas");

        colour.width = colour.height = bump.width = bump.height = size;

        const cc = colour.getContext("2d");
        const bc = bump.getContext("2d");

        cc.fillStyle = "#dcdcdc";
        cc.fillRect(0, 0, size, size);
        bc.fillStyle = "#808080";
        bc.fillRect(0, 0, size, size);

        for (let i = 0; i < 10000; i++) {

            const x = Math.random() * size;
            const y = Math.random() * size;
            const r = 0.5 + Math.random() * 1.5;
            const dark = Math.random() > 0.15;

            cc.beginPath();
            cc.arc(x, y, r, 0, Math.PI * 2);
            cc.fillStyle = dark ? "#222222" : "#dddddd";
            cc.fill();

            bc.beginPath();
            bc.arc(x, y, r, 0, Math.PI * 2);
            bc.fillStyle = dark ? "#000000" : "#ffffff";
            bc.fill();

        }

        const map = new THREE.CanvasTexture(colour);
        const bumpMap = new THREE.CanvasTexture(bump);

        map.wrapS = map.wrapT = THREE.RepeatWrapping;
        bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;

        map.repeat.set(6, 3);
        bumpMap.repeat.set(6, 3);

        return { map, bumpMap };

    }

    const maps = makeChassisMaps();

    const shellMat = new THREE.MeshStandardMaterial({
        color: design.chassis,
        map: maps.map,
        bumpMap: maps.bumpMap,
        bumpScale: 0.005,
        roughness: 1.0,
        metalness: 0.0,
        envMapIntensity: 0.0
    });

    /* ==============================
    Small shared materials
    ============================== */

    const M = {
        earBase: new THREE.MeshStandardMaterial({ color: "#f0f0f0", roughness: 0.5 }),
        earRing: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.3 }),
        earCentre: new THREE.MeshStandardMaterial({ color: "#cccccc", roughness: 0.8 }),
        antBase: new THREE.MeshStandardMaterial({ color: "#999999", roughness: 0.4, metalness: 0.5 }),
        antStick: new THREE.MeshStandardMaterial({ color: "#d0d0d0", roughness: 0.4, metalness: 0.2 }),
        antTip: new THREE.MeshStandardMaterial({ color: "#ff3366", roughness: 0.2, toneMapped: false }),
        head: new THREE.MeshStandardMaterial({ color: "#111111", roughness: 1.0, metalness: 0.0 }),
        eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2), toneMapped: false }),
        heart: new THREE.MeshBasicMaterial({ color: "#ff3366", toneMapped: false })
    };

    /* ==============================
    Body
    ============================== */

    const body = new THREE.Group();
    body.position.set(0, -0.3, 0);
    scene.add(body);

    const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.43, 64, 64, 0, Math.PI * 2, Math.PI * 0.15, Math.PI * 0.85),
        shellMat);

    body.add(shell);

    const bevel = new THREE.Mesh(
        new THREE.TorusGeometry(0.235, 0.025, 32, 64), shellMat);

    bevel.position.y = 0.34;
    bevel.rotation.x = Math.PI / 2;
    body.add(bevel);

    // Lathed collar the head sits in
    const neck = [
        [0.1, -0.05], [0.215, -0.05], [0.28, 0.02],
        [0.295, 0.045], [0.27, 0.055], [0.1, 0.055], [0.1, 0.055]
    ].map(p => new THREE.Vector2(p[0], p[1]));

    const collar = new THREE.Mesh(new THREE.LatheGeometry(neck, 64), shellMat);
    collar.position.y = 0.38;
    body.add(collar);

    /* ==============================
    Head
    ============================== */

    const head = new THREE.Group();
    head.position.y = design.headHeight;
    body.add(head);

    head.add(new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 64, 64, 0, Math.PI * 2, 0, Math.PI), M.head));

    /* Fresnel dome — the visor. Raw GLSL, ported as-is: rim
       brightens where the surface turns away from the camera. */

    const visorUniforms = {
        color: { value: new THREE.Color(design.screen) },
        power: { value: design.screenPower },
        intensity: { value: design.screenGlow }
    };

    head.add(new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 64, 64, 0, Math.PI * 2, 0, Math.PI),
        new THREE.ShaderMaterial({
            uniforms: visorUniforms,
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                void main() {
                    vec4 mv = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = -mv.xyz;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * mv;
                }`,
            fragmentShader: `
                uniform vec3 color;
                uniform float power;
                uniform float intensity;
                varying vec3 vNormal;
                varying vec3 vViewPosition;
                void main() {
                    vec3 n = normalize(vNormal);
                    vec3 v = normalize(vViewPosition);
                    float f = pow(1.0 - max(dot(v, n), 0.0), power);
                    gl_FragColor = vec4(color, f * intensity);
                }`,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        })));

    /* ==============================
    Eyes

    Two rounded brackets built from a curve path, swapped for a
    heart outline when the robot is poked.
    ============================== */

    function bracket(sign) {

        const w = 0.025, h = 0.035 * sign, r = 0.02 * sign, g = 0.005 * sign;
        const p = new THREE.CurvePath();
        const V = (x, y) => new THREE.Vector3(x, y, 0);

        p.add(new THREE.LineCurve3(V(-w, g), V(-w, h - r)));
        p.add(new THREE.QuadraticBezierCurve3(V(-w, h - r), V(-w, h), V(-w + 0.02, h)));
        p.add(new THREE.LineCurve3(V(-w + 0.02, h), V(w - 0.02, h)));
        p.add(new THREE.QuadraticBezierCurve3(V(w - 0.02, h), V(w, h), V(w, h - r)));
        p.add(new THREE.LineCurve3(V(w, h - r), V(w, g)));

        return p;

    }

    const heartCurve = new (class extends THREE.Curve {
        getPoint(t, target = new THREE.Vector3()) {
            t *= Math.PI * 2;
            const x = 16 * Math.pow(Math.sin(t), 3);
            const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t)
                - 2 * Math.cos(3 * t) - Math.cos(4 * t);
            return target.set(x * 0.002, (y + 6) * 0.002, 0);
        }
    })();

    const eyes = [];
    const eyeHost = new THREE.Group();
    eyeHost.position.set(0, -0.02, 0.29);
    head.add(eyeHost);

    [-1, 1].forEach(side => {

        const g = new THREE.Group();
        g.position.x = side * design.eyeGap;
        g.rotation.y = side * 0.2;

        const open = new THREE.Group();
        open.add(new THREE.Mesh(new THREE.TubeGeometry(bracket(1), 20, 0.0035, 8, false), M.eye));
        open.add(new THREE.Mesh(new THREE.TubeGeometry(bracket(-1), 20, 0.0035, 8, false), M.eye));

        const heart = new THREE.Mesh(
            new THREE.TubeGeometry(heartCurve, 64, 0.0035, 8, true), M.heart);

        heart.visible = false;

        g.add(open, heart);
        eyeHost.add(g);

        eyes.push({ group: g, open, heart });

    });

    /* ==============================
    Ears
    ============================== */

    function ear(side) {

        const g = new THREE.Group();
        g.position.set(side * 0.29, 0, 0);
        g.scale.setScalar(design.earScale);

        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.025, 32), M.earBase);
        base.rotation.z = Math.PI / 2;
        g.add(base);

        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.008, 16, 32), M.earRing);
        ring.position.x = side * 0.012;
        ring.rotation.z = Math.PI / 2;
        g.add(ring);

        const centre = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.005, 32), M.earCentre);
        centre.position.x = side * 0.012;
        centre.rotation.z = Math.PI / 2;
        g.add(centre);

        const ant = new THREE.Group();
        ant.position.set(side * 0.015, 0.035, 0);
        ant.rotation.x = -0.4;

        const a1 = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.02, 16), M.antBase);
        a1.position.y = 0.01;

        const a2 = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.1, 8), M.antStick);
        a2.position.y = 0.06;

        const a3 = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 16), M.antTip);
        a3.position.y = 0.11;

        ant.add(a1, a2, a3);
        g.add(ant);

        return g;

    }

    head.add(ear(-1), ear(1));

    /* ==============================
    Contact shadow

    drei's version is a whole extra render pass. A radial
    gradient on a plane costs nothing and reads the same at this
    camera angle.
    ============================== */

    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 256;

    const sc = shadowCanvas.getContext("2d");
    const grad = sc.createRadialGradient(128, 128, 8, 128, 128, 122);

    grad.addColorStop(0, "rgba(0,0,0,0.85)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.30)");
    grad.addColorStop(1, "rgba(0,0,0,0)");

    sc.fillStyle = grad;
    sc.fillRect(0, 0, 256, 256);

    const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(2.6, 2.6),
        new THREE.MeshBasicMaterial({
            map: new THREE.CanvasTexture(shadowCanvas),
            transparent: true,
            depthWrite: false
        }));

    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.79;
    scene.add(shadow);

    /* ==============================
    Sizing

    R3F hands components a `viewport` in world units. Solved here
    from the fov so the robot scales the same way.
    ============================== */

    const rig = new THREE.Group();
    scene.add(rig);
    rig.add(body);

    let world = { width: 3.5, height: 2 };

    function resize() {

        const w = canvas.clientWidth || canvas.parentElement.clientWidth;
        const h = canvas.clientHeight || canvas.parentElement.clientHeight;

        if (!w || !h) return;

        renderer.setSize(w, h, false);

        camera.aspect = w / h;
        camera.updateProjectionMatrix();

        world.height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.position.z;
        world.width = world.height * camera.aspect;

        /* The React original capped this at 1.1. Raised, because
           that was sized for a hero with a navbar and nothing
           else in it — ours gives the robot the whole middle of
           the panel, so it can afford to be bigger. The
           width/3.5 term still shrinks it on narrow screens. */

        rig.scale.setScalar(Math.min(SCALE_CAP, world.width / 3.5));

    }

    /* ==============================
    Pointer
    ============================== */

    const pointer = { x: 0, y: 0 };

    window.addEventListener("pointermove", e => {

        const r = canvas.getBoundingClientRect();

        if (!r.width || !r.height) return;

        pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
        pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);

    }, { passive: true });

    let loved = 0;

    canvas.addEventListener("pointerdown", () => { loved = performance.now() + 2000; });

    /* ==============================
    Loop
    ============================== */

    const clock = new THREE.Clock();
    let raf = 0;
    let onScreen = true;

    function tick() {

        raf = requestAnimationFrame(tick);

        if (!onScreen) return;

        const dt = Math.min(clock.getDelta(), 0.1);
        const t = clock.getElapsedTime();

        const targetX = pointer.x * (world.width / 3.5);

        body.position.x += (targetX - body.position.x) * motion.moveSpeed * dt;

        const rel = pointer.x - body.position.x / 2.5;

        const lerp = (a, b, s) => a + (b - a) * Math.min(1, s * dt);

        body.rotation.y = lerp(body.rotation.y, -rel * motion.bodyTiltY, motion.bodyRotSpeed);
        body.rotation.x = lerp(body.rotation.x, -pointer.y * 0.25, motion.bodyRotSpeed);
        body.rotation.z = lerp(body.rotation.z, -rel * 0.15, motion.bodyRotSpeed);

        head.rotation.y = lerp(head.rotation.y, rel * motion.headLookY, motion.headRotSpeed);
        head.rotation.x = lerp(head.rotation.x, -pointer.y * motion.headLookX, motion.headRotSpeed);

        // Blink, unless it is busy being in love
        const isHeart = performance.now() < loved;
        const cycle = t % design.blinkCycle;

        let squash = 1;

        if (!isHeart && cycle < design.blinkDuration) {
            squash = Math.max(0.05, 1 - Math.sin((cycle / design.blinkDuration) * Math.PI));
        }

        eyes.forEach(e => {
            e.open.visible = !isHeart;
            e.heart.visible = isHeart;
            e.group.scale.set(design.eyeScale, design.eyeScale * squash, design.eyeScale);
        });

        renderer.render(scene, camera);

    }

    resize();
    window.addEventListener("resize", resize);

    // A hero off-screen is a GPU running for nobody
    if (window.IntersectionObserver) {

        new IntersectionObserver(entries => {

            onScreen = entries[0].isIntersecting;

        }, { threshold: 0 }).observe(canvas);

    }

    if (reduced) {

        renderer.render(scene, camera);

    } else {

        tick();

    }

    // Handy for tuning from the console
    window.heroRobot = { scene, camera, renderer, body, head, eyes, resize };

}
