/* ============================================================
   360° VIRTUAL TOUR — MINIMAL DARK UI SCRIPT
   ============================================================ */
(function () {
    'use strict';

    /* ── DOM cache ── */
    const $ = (id) => document.getElementById(id);
    const dom = {
        loading: $('loadingScreen'),
        loaderFill: $('loaderFill'),
        topBar: $('topBar'),

        infoBox: $('infoBox'),
        infoBoxText: $('infoBoxText'),
        gridOverlay: $('gridOverlay'),
        gridBody: $('gridBody'),
        gridClose: $('gridClose'),
        btnGrid: $('btnGrid'),
        btnFullscreen: $('btnFullscreen'),
        btnHelp: $('btnHelp'),
        helpOverlay: $('helpOverlay'),
        helpClose: $('helpClose'),
        infoPopup: $('infoPopup'),
        popupClose: $('popupClose'),
        infoTitle: $('infoTitle'),
        infoDesc: $('infoDescription'),
        infoImage: $('infoImage'),
        popupImgWrap: $('popupImgWrap'),

        /* Indoor Navigation */
        navGuidePanel: $('navGuidePanel'),
        navGuideClose: $('navGuideClose'),
        btnNavGuide: $('btnNavGuide'),
        floorSelect: $('floorSelect'),
        labSelect: $('labSelect'),
        navGuideGo: $('navGuideGo'),
        navGuideClear: $('navGuideClear'),
        directionBanner: $('directionBanner'),
        dirStepNum: $('dirStepNum'),
        dirStepTotal: $('dirStepTotal'),
        dirInstruction: $('dirInstruction'),
        dirDestination: $('dirDestination'),
        dirPrev: $('dirPrev'),
        dirNext: $('dirNext'),
        navComingSoon: $('navComingSoon'),
    };

    let viewer = null;
    let configData = null;
    let sceneKeys = [];
    let totalScenes = 0;
    let currentSceneId = '';
    const sceneEntryPositions = {};

    /* ─────────────────────────────────────────────
       LOADING SCREEN
       ───────────────────────────────────────────── */
    function runLoader(onReady) {
        let pct = 0;
        const tick = setInterval(() => {
            pct += Math.random() * 16 + 5;
            if (pct > 95) pct = 95;
            dom.loaderFill.style.width = pct + '%';
        }, 110);

        onReady(() => {
            clearInterval(tick);
            dom.loaderFill.style.width = '100%';
            setTimeout(() => {
                dom.loading.classList.add('done');
                dom.topBar.classList.add('show');
                dom.infoBox.classList.add('show');
            }, 350);
        });
    }

    /* ─────────────────────────────────────────────
       PANNELLUM HOTSPOT HANDLERS (original logic)
       ───────────────────────────────────────────── */
    function smoothTransition(event, args) {
        if (event) event.stopPropagation();

        const entryPitch = args.targetPitch ?? 0;
        const entryYaw = args.targetYaw ?? 0;
        const entryHfov = viewer.getHfov();

        // Record the entry direction so compass can reset to it
        sceneEntryPositions[args.sceneId] = {
            pitch: entryPitch,
            yaw: entryYaw,
            hfov: entryHfov
        };

        viewer.loadScene(args.sceneId, entryPitch, entryYaw, entryHfov);
    }

    function hotspotText(div) {
        const el = document.createElement('div');
        el.classList.add('hotspot-content');
        el.innerHTML = '<img src="assets/arrow.png" class="arrow-img">';
        div.innerHTML = '';
        div.appendChild(el);
    }

    /* ─────────────────────────────────────────────
       INFO POPUP (hotspot detail — stays centered)
       ───────────────────────────────────────────── */
    function showInfo(event, args) {
        dom.infoTitle.innerText = args.title || '';
        dom.infoDesc.innerText = args.description || '';
        if (args.image) {
            dom.infoImage.src = args.image;
            dom.popupImgWrap.style.display = 'block';
        } else {
            dom.infoImage.src = '';
            dom.popupImgWrap.style.display = 'none';
        }
        dom.infoPopup.classList.add('active');
    }

    function closeInfo() { dom.infoPopup.classList.remove('active'); }

    dom.popupClose.addEventListener('click', closeInfo);
    dom.infoPopup.addEventListener('click', (e) => {
        if (e.target === dom.infoPopup) closeInfo();
    });

    /* ─────────────────────────────────────────────
       HELP PANEL (right side — only one at a time)
       ───────────────────────────────────────────── */
    function openHelp() { closeGrid(); dom.helpOverlay.classList.add('active'); }
    function closeHelp() { dom.helpOverlay.classList.remove('active'); }
    function toggleHelp() {
        dom.helpOverlay.classList.contains('active') ? closeHelp() : openHelp();
    }

    dom.btnHelp.addEventListener('click', toggleHelp);
    dom.helpClose.addEventListener('click', closeHelp);
    dom.helpOverlay.addEventListener('click', (e) => {
        if (e.target === dom.helpOverlay) closeHelp();
    });

    /* ─────────────────────────────────────────────
       GRID PANEL (right side — only one at a time)
       ───────────────────────────────────────────── */
    function openGrid() { closeHelp(); dom.gridOverlay.classList.add('active'); }
    function closeGrid() { dom.gridOverlay.classList.remove('active'); }
    function toggleGrid() {
        dom.gridOverlay.classList.contains('active') ? closeGrid() : openGrid();
    }

    dom.btnGrid.addEventListener('click', toggleGrid);
    dom.gridClose.addEventListener('click', closeGrid);
    dom.gridOverlay.addEventListener('click', (e) => {
        if (e.target === dom.gridOverlay) closeGrid();
    });

    function buildGrid(config) {
        dom.gridBody.innerHTML = '';
        sceneKeys.forEach((id, i) => {
            const scene = config.scenes[id];
            const item = document.createElement('div');
            item.className = 'grid-item';
            item.dataset.scene = id;
            item.innerHTML =
                '<img class="grid-thumb" src="' + scene.panorama + '" alt="' + scene.title + '" loading="lazy">' +
                '<span class="grid-num">' + (i + 1) + '</span>' +
                '<span class="grid-label">' + scene.title + '</span>';
            item.addEventListener('click', () => {
                // Grid loads scene at config defaults — record as entry position
                const sc = config.scenes[id];
                sceneEntryPositions[id] = {
                    pitch: sc.pitch || 0,
                    yaw: sc.yaw || 0,
                    hfov: sc.hfov || 110
                };
                viewer.loadScene(id);
                closeGrid();
            });
            dom.gridBody.appendChild(item);
        });
    }

    function markGridActive(sceneId) {
        dom.gridBody.querySelectorAll('.grid-item').forEach((el) => {
            el.classList.toggle('active', el.dataset.scene === sceneId);
        });
    }

    /* ─────────────────────────────────────────────
       FULLSCREEN
       ───────────────────────────────────────────── */
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen().catch(() => { });
        }
    }
    dom.btnFullscreen.addEventListener('click', toggleFullscreen);

    /* ─────────────────────────────────────────────
       UPDATE UI ON SCENE CHANGE
       ───────────────────────────────────────────── */
    function updateUI(sceneId) {
        if (!configData) return;
        const scene = configData.scenes[sceneId];
        if (!scene) return;
        currentSceneId = sceneId;
        const idx = sceneKeys.indexOf(sceneId) + 1;


        dom.infoBoxText.textContent = scene.title;

        markGridActive(sceneId);
    }

    /* ─────────────────────────────────────────────
       KEYBOARD SHORTCUTS
       ───────────────────────────────────────────── */
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        const k = e.key.toLowerCase();
        if (k === 'escape') { closeInfo(); closeHelp(); closeGrid(); closeNavGuide(); return; }
        if (k === 'g') { e.preventDefault(); toggleGrid(); return; }
        if (k === 'h') { e.preventDefault(); toggleHelp(); return; }
        if (k === 'f') { e.preventDefault(); toggleFullscreen(); return; }
        if (k === 'n') { e.preventDefault(); toggleNavGuide(); return; }
    });

    /* ─────────────────────────────────────────────
       INDOOR NAVIGATION SYSTEM — 8-FLOOR
       ───────────────────────────────────────────── */

    /*
     * Which floors have 360° data available.
     * Set a floor to true once its panoramas are uploaded.
     */
    const FLOOR_AVAILABLE = {
        'Ground Floor': true,
        '1st Floor': false,
        '2nd Floor': false,
        '3rd Floor': false,
        '4th Floor': false,
        '5th Floor': false,
        '6th Floor': false,
        '7th Floor': false
    };

    /*
     * Maps each floor key to its corridor scene (entry point).
     * Only Ground Floor has real scenes right now.
     * Update these when new floor panoramas are added.
     */
    const FLOOR_CORRIDOR_MAP = {
        'Ground Floor': 'scene1',
        '1st Floor': null,
        '2nd Floor': null,
        '3rd Floor': null,
        '4th Floor': null,
        '5th Floor': null,
        '6th Floor': null,
        '7th Floor': null
    };

    /* Reverse lookup: scene → floor name */
    const SCENE_TO_FLOOR = {};
    (function buildSceneFloorMap() {
        const floorScenes = {
            'Ground Floor': ['scene1', 'scene2', 'scene3', 'scene4', 'scene5', 'scene6', 'scene7', 'scene8', 'scene9', 'scene10', 'scene11']
            /* Add scene arrays for other floors here when available */
        };
        for (const floor in floorScenes) {
            floorScenes[floor].forEach(s => { SCENE_TO_FLOOR[s] = floor; });
        }
    })();

    /*
     * Floor → Lab data.
     * Each lab has:
     *   label:            Display name
     *   destinationScene: The scene ID where the lab/destination is
     *   destinationInfo:  Title of the info hotspot to blink (null if none)
     *   route:            Array of steps  { scene, direction, arrowTarget }
     *                     arrowTarget = sceneId the highlighted arrow points to (null at destination)
     *
     * Floors without 360° data keep their lab structure for future use.
     */
    const FLOOR_DATA = {

        /* ══════ GROUND FLOOR (ACTIVE — has 360° images) ══════ */
        'Ground Floor': {
            labs: [
                {
                    id: 'xr-lab',
                    label: 'L-107 Extended Reality & Game Development Lab',
                    destinationScene: 'scene1',
                    destinationInfo: 'L-107 Extended Reality & Game Development Lab',
                    route: [
                        { scene: 'scene4', direction: 'Go straight ahead', arrowTarget: 'scene1' },
                        { scene: 'scene1', direction: '✅ You have arrived!', arrowTarget: null }
                    ]
                },
                {
                    id: 'iot-lab',
                    label: 'L-106 IOT Lab',
                    destinationScene: 'scene1',
                    destinationInfo: 'L-106 IOT Lab',
                    route: [
                        { scene: 'scene4', direction: 'Go straight ahead', arrowTarget: 'scene1' },
                        { scene: 'scene1', direction: '✅ IOT Lab is on your right', arrowTarget: null }
                    ]
                },
                {
                    id: 'network-lab',
                    label: 'L-108 Network Architecture Lab',
                    destinationScene: 'scene5',
                    destinationInfo: 'L-108 Network Architecture Lab',
                    route: [
                        { scene: 'scene4', direction: 'Go to the end of the corridor', arrowTarget: 'scene5' },
                        { scene: 'scene5', direction: '✅ Network Lab is on your left', arrowTarget: null }
                    ]
                },
                {
                    id: 'data-center',
                    label: 'Data Center',
                    destinationScene: 'scene4',
                    destinationInfo: 'Data Center',
                    route: [
                        { scene: 'scene4', direction: '✅ Data Center is right here', arrowTarget: null }
                    ]
                },
                {
                    id: 'seminar-hall',
                    label: 'Seminar Hall',
                    destinationScene: 'scene10',
                    destinationInfo: null,
                    route: [
                        { scene: 'scene4', direction: 'Continue straight ahead', arrowTarget: 'scene5' },
                        { scene: 'scene5', direction: 'Go straight to Seminar Hall', arrowTarget: 'scene10' },
                        { scene: 'scene10', direction: '✅ Welcome to the Seminar Hall', arrowTarget: null }
                    ]
                }
            ]
        },

        /* ══════ 1ST FLOOR (Coming Soon) ══════ */
        '1st Floor': {
            labs: [
                { id: '1f-comp', label: 'L-101 Computer Lab', destinationScene: null, destinationInfo: null, route: [] },
                { id: '1f-software', label: 'L-102 Software Engineering Lab', destinationScene: null, destinationInfo: null, route: [] }
            ]
        },

        /* ══════ 2ND FLOOR (Coming Soon) ══════ */
        '2nd Floor': {
            labs: [
                { id: '2f-comp', label: 'L-201 Computer Lab', destinationScene: null, destinationInfo: null, route: [] },
                { id: '2f-ai', label: 'L-202 AI & Machine Learning Lab', destinationScene: null, destinationInfo: null, route: [] }
            ]
        },

        /* ══════ 3RD FLOOR (Coming Soon) ══════ */
        '3rd Floor': {
            labs: [
                { id: '3f-db', label: 'L-301 Database Lab', destinationScene: null, destinationInfo: null, route: [] },
                { id: '3f-cyber', label: 'L-302 Cyber Security Lab', destinationScene: null, destinationInfo: null, route: [] }
            ]
        },

        /* ══════ 4TH FLOOR (Coming Soon) ══════ */
        '4th Floor': {
            labs: [
                { id: '4f-elec', label: 'L-401 Electronics Lab', destinationScene: null, destinationInfo: null, route: [] },
                { id: '4f-robo', label: 'L-402 Robotics Lab', destinationScene: null, destinationInfo: null, route: [] }
            ]
        },

        /* ══════ 5TH FLOOR (Coming Soon) ══════ */
        '5th Floor': {
            labs: [
                { id: '5f-research', label: 'L-501 Research Lab', destinationScene: null, destinationInfo: null, route: [] },
                { id: '5f-project', label: 'L-502 Project Lab', destinationScene: null, destinationInfo: null, route: [] }
            ]
        },

        /* ══════ 6TH FLOOR (Coming Soon) ══════ */
        '6th Floor': {
            labs: [
                { id: '6f-conf', label: 'Conference Hall', destinationScene: null, destinationInfo: null, route: [] },
                { id: '6f-lib', label: 'Digital Library', destinationScene: null, destinationInfo: null, route: [] }
            ]
        },

        /* ══════ 7TH FLOOR (Coming Soon) ══════ */
        '7th Floor': {
            labs: [
                { id: '7f-sem', label: 'Seminar Room', destinationScene: null, destinationInfo: null, route: [] },
                { id: '7f-innov', label: 'Innovation Hub', destinationScene: null, destinationInfo: null, route: [] }
            ]
        }
    };

    /* State */
    let navActive = false;
    let activeRoute = null;
    let activeLabData = null;
    let currentStepIndex = 0;
    let selectedFloorKey = '';

    /* ── Panel open/close ── */
    function openNavGuide() {
        closeHelp(); closeGrid();
        dom.navGuidePanel.classList.add('open');
        dom.btnNavGuide.classList.add('active');
    }
    function closeNavGuide() {
        dom.navGuidePanel.classList.remove('open');
        dom.btnNavGuide.classList.remove('active');
    }
    function toggleNavGuide() {
        dom.navGuidePanel.classList.contains('open') ? closeNavGuide() : openNavGuide();
    }

    dom.btnNavGuide.addEventListener('click', toggleNavGuide);
    dom.navGuideClose.addEventListener('click', closeNavGuide);

    /* ── Populate floor dropdown ── */
    Object.keys(FLOOR_DATA).forEach(floor => {
        const opt = document.createElement('option');
        opt.value = floor;
        opt.textContent = floor;
        dom.floorSelect.appendChild(opt);
    });

    /* ── Floor change → load floor environment OR show Coming Soon ── */
    dom.floorSelect.addEventListener('change', function () {
        const floor = this.value;
        selectedFloorKey = floor;

        /* Reset lab dropdown */
        dom.labSelect.innerHTML = '<option value="">Select Destination</option>';
        dom.labSelect.disabled = true;
        dom.navGuideGo.disabled = true;

        /* Clear any active navigation */
        if (navActive) clearNavigation();

        /* Hide Coming Soon by default */
        dom.navComingSoon.style.display = 'none';

        if (!floor) return;

        /* Check if this floor has 360° data */
        if (!FLOOR_AVAILABLE[floor]) {
            /* Floor not yet available — show Coming Soon, keep lab dropdown disabled */
            dom.navComingSoon.style.display = 'flex';
            dom.navGuideGo.style.display = 'none';
            return;
        }

        /* Floor IS available */
        dom.navGuideGo.style.display = 'inline-flex';

        /* Load the floor's corridor scene in the viewer */
        const corridorScene = FLOOR_CORRIDOR_MAP[floor];
        if (corridorScene && viewer && viewer.getScene() !== corridorScene) {
            viewer.loadScene(corridorScene);
        }

        /* Populate labs */
        if (FLOOR_DATA[floor]) {
            FLOOR_DATA[floor].labs.forEach(lab => {
                const opt = document.createElement('option');
                opt.value = lab.id;
                opt.textContent = lab.label;
                dom.labSelect.appendChild(opt);
            });
            dom.labSelect.disabled = false;
        }
    });

    /* ── Lab change → enable Go ── */
    dom.labSelect.addEventListener('change', function () {
        dom.navGuideGo.disabled = !this.value;
    });

    /* ── Show Path (Go) ── */
    dom.navGuideGo.addEventListener('click', function () {
        const floor = dom.floorSelect.value;
        const labId = dom.labSelect.value;
        if (!floor || !labId) return;

        /* Safety check — don't navigate to unavailable floors */
        if (!FLOOR_AVAILABLE[floor]) return;

        const floorData = FLOOR_DATA[floor];
        const lab = floorData.labs.find(l => l.id === labId);
        if (!lab || !lab.route || lab.route.length === 0) return;

        activeLabData = lab;
        activeRoute = lab.route;

        navActive = true;

        /* Find which step matches the current scene, or start at 0 */
        const curScene = viewer ? viewer.getScene() : currentSceneId;
        const matchIdx = activeRoute.findIndex(s => s.scene === curScene);
        currentStepIndex = matchIdx >= 0 ? matchIdx : 0;

        /* If the user is not on the route's first scene, navigate there */
        if (matchIdx < 0 && activeRoute.length > 0) {
            const firstStep = activeRoute[0];
            if (viewer && viewer.getScene() !== firstStep.scene) {
                viewer.loadScene(firstStep.scene);
            }
        }

        /* Add nav-active class to panorama for dimming non-highlighted */
        const pano = document.getElementById('panorama');
        if (pano) pano.classList.add('nav-active');

        /* Show clear button, hide go */
        dom.navGuideGo.style.display = 'none';
        dom.navGuideClear.style.display = 'inline-flex';

        applyHighlights();
        showDirectionBanner();
        closeNavGuide();
    });

    /* ── Clear navigation ── */
    dom.navGuideClear.addEventListener('click', clearNavigation);

    function clearNavigation() {
        navActive = false;
        activeRoute = null;
        activeLabData = null;
        currentStepIndex = 0;

        removeAllHighlights();
        hideDirectionBanner();

        const pano = document.getElementById('panorama');
        if (pano) pano.classList.remove('nav-active');

        dom.navGuideGo.style.display = 'inline-flex';
        dom.navGuideClear.style.display = 'none';
        dom.navGuideGo.disabled = !dom.labSelect.value;
        dom.navComingSoon.style.display = 'none';
    }

    /* ── Apply highlights to hotspots in the current scene ── */
    function applyHighlights() {
        removeAllHighlights();
        if (!navActive || !activeRoute || !viewer) return;

        const curScene = viewer.getScene();
        const step = activeRoute.find(s => s.scene === curScene);
        if (!step) return;

        /* Highlight the arrow hotspot that points toward arrowTarget */
        if (step.arrowTarget) {
            if (configData && configData.scenes[curScene]) {
                const sceneHotspots = configData.scenes[curScene].hotSpots || [];
                const allHs = document.querySelectorAll('#panorama .pnlm-hotspot');
                sceneHotspots.forEach((hsCfg, idx) => {
                    if (hsCfg.clickHandlerArgs && hsCfg.clickHandlerArgs.sceneId === step.arrowTarget) {
                        if (allHs[idx]) {
                            allHs[idx].classList.add('highlight-path');
                        }
                    }
                });
            }
        }

        /* Highlight destination info hotspot (blinking) */
        if (curScene === activeLabData.destinationScene && activeLabData.destinationInfo) {
            if (configData && configData.scenes[curScene]) {
                const sceneHotspots = configData.scenes[curScene].hotSpots || [];
                const allHs = document.querySelectorAll('#panorama .pnlm-hotspot');
                sceneHotspots.forEach((hsCfg, idx) => {
                    if (hsCfg.type === 'info' && hsCfg.clickHandlerArgs &&
                        hsCfg.clickHandlerArgs.title === activeLabData.destinationInfo) {
                        if (allHs[idx]) {
                            allHs[idx].classList.add('highlight-destination');
                        }
                    }
                });
            }
        }
    }

    function removeAllHighlights() {
        document.querySelectorAll('.highlight-path').forEach(el => el.classList.remove('highlight-path'));
        document.querySelectorAll('.highlight-destination').forEach(el => el.classList.remove('highlight-destination'));
    }

    /* ── Direction banner ── */
    function showDirectionBanner() {
        if (!activeRoute || !activeLabData) return;
        updateDirectionStep();
        dom.directionBanner.classList.add('show');
    }

    function hideDirectionBanner() {
        dom.directionBanner.classList.remove('show');
    }

    function updateDirectionStep() {
        if (!activeRoute) return;
        const step = activeRoute[currentStepIndex];
        if (!step) return;

        dom.dirStepNum.textContent = currentStepIndex + 1;
        dom.dirStepTotal.textContent = '/ ' + activeRoute.length;
        dom.dirInstruction.textContent = step.direction;
        dom.dirDestination.textContent = '→ ' + activeLabData.label;

        dom.dirPrev.disabled = currentStepIndex <= 0;
        dom.dirNext.disabled = currentStepIndex >= activeRoute.length - 1;
    }

    dom.dirPrev.addEventListener('click', function () {
        if (currentStepIndex > 0) {
            currentStepIndex--;
            updateDirectionStep();
            /* Navigate viewer to the step's scene */
            const step = activeRoute[currentStepIndex];
            if (step && viewer && viewer.getScene() !== step.scene) {
                viewer.loadScene(step.scene);
            }
        }
    });

    dom.dirNext.addEventListener('click', function () {
        if (currentStepIndex < activeRoute.length - 1) {
            currentStepIndex++;
            updateDirectionStep();
            const step = activeRoute[currentStepIndex];
            if (step && viewer && viewer.getScene() !== step.scene) {
                viewer.loadScene(step.scene);
            }
        }
    });

    /* ── Re-apply highlights on scene change ── */
    function onSceneChangeNav(sceneId) {
        if (!navActive || !activeRoute) return;
        const matchIdx = activeRoute.findIndex(s => s.scene === sceneId);
        if (matchIdx >= 0) {
            currentStepIndex = matchIdx;
            updateDirectionStep();
        }
        /* Delay highlight application to allow Pannellum to render hotspots */
        setTimeout(applyHighlights, 200);
    }

    /* ─────────────────────────────────────────────
       PRELOAD
       ───────────────────────────────────────────── */
    function preloadImages(config) {
        for (const id in config.scenes) {
            const src = config.scenes[id].panorama;
            if (src) { const img = new Image(); img.src = src; }
        }
    }

    /* ─────────────────────────────────────────────
       HFOV LOCK (original logic)
       ───────────────────────────────────────────── */
    function lockHfov(target) {
        let done = false, last = null, stable = 0;
        (function tick() {
            if (!viewer || done) return;
            const c = viewer.getHfov();
            if (last !== null && Math.abs(c - last) < 0.01) stable++; else stable = 0;
            last = c;
            if (stable >= 5) { viewer.setHfov(target, false); done = true; return; }
            requestAnimationFrame(tick);
        })();
    }

    /* ─────────────────────────────────────────────
       MAIN INIT
       ───────────────────────────────────────────── */
    runLoader(function (ready) {
        fetch('config.json')
            .then((r) => r.json())
            .then((config) => {
                configData = config;
                sceneKeys = Object.keys(config.scenes);
                totalScenes = sceneKeys.length;

                /* Wire up hotspots */
                for (const id in config.scenes) {
                    const hs = config.scenes[id].hotSpots;
                    if (!hs) continue;
                    hs.forEach((h) => {
                        if (h.cssClass && h.cssClass.includes('nav-btn') && h.clickHandlerArgs?.sceneId) {
                            h.clickHandlerFunc = smoothTransition;
                        } else if (h.cssClass && h.cssClass.includes('nav-btn')) {
                            h.cssClass = 'hidden-hotspot';
                        }
                        if (h.type === 'info') {
                            h.clickHandlerFunc = showInfo;
                        } else {
                            if (!h.createTooltipArgs) h.createTooltipArgs = h.text;
                            h.createTooltipFunc = hotspotText;
                        }
                    });
                }

                /* Mobile config tweaks */
                if (!config.default) config.default = {};
                if (window.innerWidth < 768) {
                    Object.assign(config.default, { minPitch: -100, maxPitch: 100, hfov: 100, minHfov: 50, maxHfov: 120 });
                }

                const TARGET_HFOV = window.innerWidth < 768 ? 100 : 110;

                /* Create viewer */
                viewer = pannellum.viewer('panorama', config);
                window.viewer = viewer;

                /* Initial UI */
                const first = config.default.firstScene || sceneKeys[0];
                updateUI(first);
                buildGrid(config);

                viewer.on('scenechange', function (sceneId) {
                    updateUI(sceneId);
                    onSceneChangeNav(sceneId);
                });

                /* ── Record entry position for the first scene (config defaults) ── */
                const firstScene = config.scenes[first];
                sceneEntryPositions[first] = {
                    pitch: firstScene.pitch || 0,
                    yaw: firstScene.yaw || 0,
                    hfov: firstScene.hfov || TARGET_HFOV
                };

                /* ── Compass click → reset to ENTRY position ── */
                viewer.on('load', function () {
                    const compass = document.querySelector('.pnlm-compass');
                    if (compass) {
                        compass.style.cursor = 'pointer';
                        compass.title = 'Reset to original view';

                        compass.addEventListener('click', function (e) {
                            e.stopPropagation();

                            // Stay in the SAME scene — reset to the direction user entered from
                            const id = viewer.getScene();
                            const pos = sceneEntryPositions[id];

                            if (pos) {
                                viewer.setPitch(pos.pitch, true);  // true = animated
                                viewer.setYaw(pos.yaw, true);      // entry yaw (targetYaw or config default)
                                viewer.setHfov(pos.hfov, true);
                            }

                            // Visual click feedback — pulse animation
                            compass.classList.remove('compass-pulse');
                            void compass.offsetWidth;            // force reflow
                            compass.classList.add('compass-pulse');
                            compass.addEventListener('animationend', function () {
                                compass.classList.remove('compass-pulse');
                            }, { once: true });
                        });
                    }
                });

                /* Move info popup inside panorama for fullscreen support */
                if (window.innerWidth > 768) {
                    const pano = document.getElementById('panorama');
                    if (pano && dom.infoPopup) pano.appendChild(dom.infoPopup);
                }

                lockHfov(TARGET_HFOV);
                setTimeout(() => preloadImages(config), 800);
                ready();
            })
            .catch((err) => { console.error(err); ready(); });
    });
})();