/* ============================================================
   360° PANORAMA VIEWER — HIGH-PERFORMANCE ENGINE
   Three.js WebGL | Smart Buffering | Scene Caching
   ============================================================ */
(function () {
    'use strict';

    /* ──────────────────────────────────────────────
       CONFIGURATION
       ────────────────────────────────────────────── */
    const CONFIG = {
        MAX_CACHE_SIZE: 5,
        PRELOAD_COUNT: 2,
        SCENE_FILE: 'scenes.json',
        MOUSE_SENSITIVITY: 0.15,
        TOUCH_SENSITIVITY: 0.25,
        INERTIA_DAMPING: 0.92,
        MIN_FOV: 30,
        MAX_FOV: 100,
        DEFAULT_FOV: 75,
        ZOOM_SPEED: 2,
        AUTO_ROTATE_SPEED: 0.05,
        AUTO_ROTATE_DELAY: 8000,   // ms before auto-rotate kicks in
        FADE_DURATION: 400,
    };

    /* ──────────────────────────────────────────────
       DOM REFERENCES
       ────────────────────────────────────────────── */
    const $ = (id) => document.getElementById(id);

    const dom = {
        container: $('viewer-container'),
        loadingScreen: $('loadingScreen'),
        loaderBar: $('loaderProgressBar'),
        sceneOverlay: $('sceneLoadingOverlay'),

        sceneInfo: $('sceneInfo'),
        sceneBadge: $('sceneBadge'),
        sceneTitle: $('sceneTitle'),
        sceneCounter: $('sceneCounter'),

        cacheStatus: $('cacheStatus'),
        cacheText: $('cacheText'),

        timelineBar: $('timelineBar'),
        timelineFill: $('timelineFill'),

        progressDots: $('progressDots'),
        thumbnailStrip: $('thumbnailStrip'),
        gridBody: $('gridBody'),
        gridOverlay: $('gridOverlay'),
        gridClose: $('gridClose'),
        toastContainer: $('toastContainer'),

        shortcutsPanel: $('shortcutsPanel'),

        btnPrev: $('btnPrev'),
        btnNext: $('btnNext'),
        btnFirst: $('btnFirst'),
        btnLast: $('btnLast'),
        btnGrid: $('btnGrid'),
        btnFullscreen: $('btnFullscreen'),
        btnShortcuts: $('btnShortcuts'),
    };

    /* ──────────────────────────────────────────────
       STATE
       ────────────────────────────────────────────── */
    let scenes = [];
    let sceneMap = {};
    let settings = {};
    let currentSceneIndex = 0;
    let totalScenes = 0;

    // Three.js
    let renderer, camera, scene3D, sphereGeometry, sphereMaterial, sphereMesh;
    let animFrameId = null;

    // Interaction
    let isUserInteracting = false;
    let pointerX = 0, pointerY = 0;
    let lon = 0, lat = 0;
    let targetLon = 0, targetLat = 0;
    let velocityLon = 0, velocityLat = 0;
    let phi = 0, theta = 0;
    let pinchStartDist = 0;

    // Auto-rotate
    let autoRotateTimer = null;
    let isAutoRotating = false;

    // Cache & Preloading
    const textureCache = new Map();  // sceneId → THREE.Texture
    const imageCache = new Map();    // sceneId → HTMLImageElement (preloaded)
    const loadingPromises = new Map();

    /* ──────────────────────────────────────────────
       INITIALIZATION
       ────────────────────────────────────────────── */
    async function init() {
        setLoaderProgress(10);

        // Load scene data
        const data = await fetchJSON(CONFIG.SCENE_FILE);
        settings = data.settings || {};
        scenes = data.scenes || [];
        totalScenes = scenes.length;

        // Build lookup map
        scenes.forEach((s, i) => {
            sceneMap[s.id] = i;
        });

        setLoaderProgress(30);

        // Initialize Three.js
        initThreeJS();
        setLoaderProgress(50);

        // Build UI components
        buildProgressDots();
        buildGrid();
        buildThumbnailStrip();

        setLoaderProgress(70);

        // Load the first scene
        const startId = settings.defaultScene || 1;
        await loadScene(sceneMap[startId] !== undefined ? sceneMap[startId] : 0);

        setLoaderProgress(100);

        // Hide loading screen
        setTimeout(() => {
            dom.loadingScreen.classList.add('hidden');
        }, 300);

        // Bind all events
        bindEvents();

        // Start render loop
        animate();

        // Start auto-rotate timer
        resetAutoRotateTimer();

        // Start preloading neighbors
        preloadNeighbors(currentSceneIndex);
    }

    /* ──────────────────────────────────────────────
       THREE.JS SETUP
       ────────────────────────────────────────────── */
    function initThreeJS() {
        // Renderer
        renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.outputEncoding = THREE.sRGBEncoding;
        dom.container.appendChild(renderer.domElement);

        // Camera
        camera = new THREE.PerspectiveCamera(
            CONFIG.DEFAULT_FOV,
            window.innerWidth / window.innerHeight,
            0.1,
            1100
        );

        // Scene
        scene3D = new THREE.Scene();

        // Sphere geometry (inside-out sphere for equirectangular projection)
        sphereGeometry = new THREE.SphereGeometry(500, 60, 40);
        sphereGeometry.scale(-1, 1, 1); // Invert to view from inside

        // Material with placeholder
        sphereMaterial = new THREE.MeshBasicMaterial({
            color: 0x111118,
            side: THREE.FrontSide,
        });

        sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
        scene3D.add(sphereMesh);
    }

    /* ──────────────────────────────────────────────
       RENDER LOOP
       ────────────────────────────────────────────── */
    function animate() {
        animFrameId = requestAnimationFrame(animate);

        // Auto-rotate
        if (isAutoRotating && !isUserInteracting) {
            targetLon += CONFIG.AUTO_ROTATE_SPEED;
        }

        // Smooth inertia
        if (!isUserInteracting) {
            velocityLon *= CONFIG.INERTIA_DAMPING;
            velocityLat *= CONFIG.INERTIA_DAMPING;
            targetLon += velocityLon;
            targetLat += velocityLat;

            if (Math.abs(velocityLon) < 0.001) velocityLon = 0;
            if (Math.abs(velocityLat) < 0.001) velocityLat = 0;
        }

        // Lerp to target
        lon += (targetLon - lon) * 0.15;
        lat += (targetLat - lat) * 0.15;

        // Clamp latitude
        lat = Math.max(-85, Math.min(85, lat));
        targetLat = Math.max(-85, Math.min(85, targetLat));

        // Spherical to Cartesian
        phi = THREE.MathUtils.degToRad(90 - lat);
        theta = THREE.MathUtils.degToRad(lon);

        const x = 500 * Math.sin(phi) * Math.cos(theta);
        const y = 500 * Math.cos(phi);
        const z = 500 * Math.sin(phi) * Math.sin(theta);

        camera.lookAt(x, y, z);
        renderer.render(scene3D, camera);
    }

    /* ──────────────────────────────────────────────
       SCENE LOADING
       ────────────────────────────────────────────── */
    async function loadScene(index, showOverlay = false) {
        if (index < 0 || index >= totalScenes) return;
        if (index === currentSceneIndex && sphereMaterial.map) return;

        const sceneData = scenes[index];
        const sceneId = sceneData.id;

        // Show loading overlay for uncached scenes
        if (showOverlay && !textureCache.has(sceneId)) {
            dom.sceneOverlay.classList.add('visible');
        }

        let texture;

        // Check texture cache first
        if (textureCache.has(sceneId)) {
            texture = textureCache.get(sceneId);
        }
        // Check if image is preloaded in image cache
        else if (imageCache.has(sceneId)) {
            const img = imageCache.get(sceneId);
            texture = createTextureFromImage(img);
            textureCache.set(sceneId, texture);
            imageCache.delete(sceneId); // Move from image cache to texture cache
        }
        // Load fresh
        else {
            const img = await loadImage(sceneData);
            texture = createTextureFromImage(img);
            textureCache.set(sceneId, texture);
        }

        // Apply texture to sphere
        if (sphereMaterial.map && sphereMaterial.map !== texture) {
            // Don't dispose — it might still be in cache
        }
        sphereMaterial.map = texture;
        sphereMaterial.color.set(0xffffff);
        sphereMaterial.needsUpdate = true;

        // Update state
        currentSceneIndex = index;

        // Update UI
        updateSceneUI(sceneData, index);

        // Hide loading overlay
        dom.sceneOverlay.classList.remove('visible');

        // Enforce cache limit
        enforceCacheLimit(sceneId);

        // Update cache status
        updateCacheStatus();

        // Preload neighbors in idle time
        schedulePreload(index);

        // Reset auto-rotate
        resetAutoRotateTimer();
    }

    function createTextureFromImage(img) {
        const texture = new THREE.Texture(img);
        texture.encoding = THREE.sRGBEncoding;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return texture;
    }

    /* ──────────────────────────────────────────────
       IMAGE LOADING
       ────────────────────────────────────────────── */
    function getImagePath(sceneData) {
        const basePath = settings.imageBasePath || 'images/';
        return basePath + sceneData.image;
    }

    function loadImage(sceneData) {
        const sceneId = sceneData.id;
        const url = getImagePath(sceneData);

        // Return existing promise if already loading
        if (loadingPromises.has(sceneId)) {
            return loadingPromises.get(sceneId);
        }

        const promise = new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                loadingPromises.delete(sceneId);
                resolve(img);
            };

            img.onerror = () => {
                loadingPromises.delete(sceneId);
                console.warn(`Failed to load image: ${url}`);
                // Create a fallback canvas
                const canvas = document.createElement('canvas');
                canvas.width = 2048;
                canvas.height = 1024;
                const ctx = canvas.getContext('2d');
                const gradient = ctx.createLinearGradient(0, 0, 2048, 1024);
                gradient.addColorStop(0, '#1a1a2e');
                gradient.addColorStop(0.5, '#16213e');
                gradient.addColorStop(1, '#0f3460');
                ctx.fillStyle = gradient;
                ctx.fillRect(0, 0, 2048, 1024);
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.font = '48px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`Scene ${sceneId} — Image not found`, 1024, 512);
                resolve(canvas);
            };

            img.src = url;
        });

        loadingPromises.set(sceneId, promise);
        return promise;
    }

    /* ──────────────────────────────────────────────
       PRELOADING SYSTEM
       ────────────────────────────────────────────── */
    function schedulePreload(centerIndex) {
        if ('requestIdleCallback' in window) {
            requestIdleCallback(() => preloadNeighbors(centerIndex), { timeout: 3000 });
        } else {
            setTimeout(() => preloadNeighbors(centerIndex), 500);
        }
    }

    async function preloadNeighbors(centerIndex) {
        const toPreload = getBufferWindow(centerIndex);

        for (const idx of toPreload) {
            const sceneData = scenes[idx];
            const sceneId = sceneData.id;

            // Skip if already cached
            if (textureCache.has(sceneId) || imageCache.has(sceneId) || loadingPromises.has(sceneId)) {
                continue;
            }

            try {
                const img = await loadImage(sceneData);
                // Only store in image cache (not texture — save GPU memory)
                if (!textureCache.has(sceneId)) {
                    imageCache.set(sceneId, img);
                }
                updateCacheStatus();
            } catch (e) {
                // Silently continue
            }
        }
    }

    function getBufferWindow(centerIndex) {
        const indices = [];
        for (let offset = 1; offset <= CONFIG.PRELOAD_COUNT; offset++) {
            const prev = centerIndex - offset;
            const next = centerIndex + offset;
            if (next < totalScenes) indices.push(next);
            if (prev >= 0) indices.push(prev);
        }
        return indices;
    }

    /* ──────────────────────────────────────────────
       MEMORY / CACHE MANAGEMENT
       ────────────────────────────────────────────── */
    function enforceCacheLimit(currentId) {
        const maxSize = CONFIG.MAX_CACHE_SIZE;

        // Combined cache check
        const totalCached = textureCache.size + imageCache.size;
        if (totalCached <= maxSize) return;

        // Build buffer zone: scenes that should stay cached
        const bufferIds = new Set();
        bufferIds.add(currentId);
        const centerIdx = sceneMap[currentId];
        for (let offset = 1; offset <= CONFIG.PRELOAD_COUNT; offset++) {
            if (centerIdx - offset >= 0) bufferIds.add(scenes[centerIdx - offset].id);
            if (centerIdx + offset < totalScenes) bufferIds.add(scenes[centerIdx + offset].id);
        }

        // Evict from image cache first (cheaper)
        for (const [id] of imageCache) {
            if (totalCached <= maxSize) break;
            if (!bufferIds.has(id)) {
                imageCache.delete(id);
            }
        }

        // Then evict textures if needed
        const updatedTotal = textureCache.size + imageCache.size;
        if (updatedTotal <= maxSize) return;

        for (const [id, tex] of textureCache) {
            if (textureCache.size + imageCache.size <= maxSize) break;
            if (!bufferIds.has(id) && id !== currentId) {
                tex.dispose();
                textureCache.delete(id);
            }
        }
    }

    /* ──────────────────────────────────────────────
       NAVIGATION
       ────────────────────────────────────────────── */
    function goToScene(index) {
        if (index < 0 || index >= totalScenes) return;
        if (index === currentSceneIndex) return;
        loadScene(index, true);
    }

    function goNext() {
        if (currentSceneIndex < totalScenes - 1) {
            goToScene(currentSceneIndex + 1);
        }
    }

    function goPrev() {
        if (currentSceneIndex > 0) {
            goToScene(currentSceneIndex - 1);
        }
    }

    function goFirst() {
        goToScene(0);
    }

    function goLast() {
        goToScene(totalScenes - 1);
    }

    /* ──────────────────────────────────────────────
       UI UPDATES
       ────────────────────────────────────────────── */
    function updateSceneUI(sceneData, index) {
        dom.sceneBadge.textContent = sceneData.id;
        dom.sceneTitle.textContent = sceneData.title;
        dom.sceneCounter.textContent = `Scene ${index + 1} of ${totalScenes}`;

        // Timeline
        const progress = ((index) / (totalScenes - 1)) * 100;
        dom.timelineFill.style.width = progress + '%';

        // Navigation buttons
        dom.btnPrev.disabled = index === 0;
        dom.btnFirst.disabled = index === 0;
        dom.btnNext.disabled = index === totalScenes - 1;
        dom.btnLast.disabled = index === totalScenes - 1;

        // Progress dots
        updateProgressDots(index);

        // Thumbnail strip
        updateThumbnailStrip(index);

        // Grid active state
        updateGridActive(index);
    }

    function updateCacheStatus() {
        const total = textureCache.size + imageCache.size;
        dom.cacheText.textContent = `Cache: ${total}/${CONFIG.MAX_CACHE_SIZE}`;
    }

    function setLoaderProgress(pct) {
        dom.loaderBar.style.width = pct + '%';
    }

    /* ── Progress Dots ── */
    function buildProgressDots() {
        dom.progressDots.innerHTML = '';
        // Show max 15 dots around the current scene
        const dotsToShow = Math.min(totalScenes, 15);
        for (let i = 0; i < dotsToShow; i++) {
            const dot = document.createElement('div');
            dot.className = 'progress-dot';
            dot.dataset.index = i;
            dot.addEventListener('click', () => {
                const mappedIndex = getMappedDotIndex(i);
                goToScene(mappedIndex);
            });
            dom.progressDots.appendChild(dot);
        }
    }

    function getMappedDotIndex(dotIndex) {
        const dotsCount = Math.min(totalScenes, 15);
        if (totalScenes <= 15) return dotIndex;

        // Map dot position to scene index
        const ratio = dotIndex / (dotsCount - 1);
        return Math.round(ratio * (totalScenes - 1));
    }

    function updateProgressDots(activeIndex) {
        const dots = dom.progressDots.children;
        const dotsCount = dots.length;

        for (let i = 0; i < dotsCount; i++) {
            const mappedIndex = getMappedDotIndex(i);
            const dot = dots[i];
            dot.classList.toggle('active', mappedIndex === activeIndex);

            // Check if this scene is cached
            const sceneId = scenes[mappedIndex]?.id;
            dot.classList.toggle('cached',
                sceneId && (textureCache.has(sceneId) || imageCache.has(sceneId)) && mappedIndex !== activeIndex
            );
        }
    }

    /* ── Thumbnail Strip ── */
    function buildThumbnailStrip() {
        dom.thumbnailStrip.innerHTML = '';
        // We'll update this dynamically based on current scene
    }

    function updateThumbnailStrip(activeIndex) {
        dom.thumbnailStrip.innerHTML = '';
        const range = 2;
        const start = Math.max(0, activeIndex - range);
        const end = Math.min(totalScenes - 1, activeIndex + range);

        for (let i = start; i <= end; i++) {
            const sceneData = scenes[i];
            const thumb = document.createElement('div');
            thumb.className = 'thumb-item' + (i === activeIndex ? ' active' : '');

            const img = document.createElement('img');
            img.src = getImagePath(sceneData);
            img.alt = sceneData.title;
            img.loading = 'lazy';

            const num = document.createElement('span');
            num.className = 'thumb-number';
            num.textContent = sceneData.id;

            thumb.appendChild(img);
            thumb.appendChild(num);
            thumb.addEventListener('click', () => goToScene(i));
            dom.thumbnailStrip.appendChild(thumb);
        }
    }

    /* ── Scene Grid ── */
    function buildGrid() {
        dom.gridBody.innerHTML = '';
        scenes.forEach((sceneData, index) => {
            const item = document.createElement('div');
            item.className = 'grid-item';
            item.dataset.sceneIndex = index;

            const img = document.createElement('img');
            img.src = getImagePath(sceneData);
            img.alt = sceneData.title;
            img.loading = 'lazy';

            const label = document.createElement('div');
            label.className = 'grid-item-label';

            const title = document.createElement('div');
            title.className = 'grid-item-title';
            title.textContent = sceneData.title;

            const idSpan = document.createElement('div');
            idSpan.className = 'grid-item-id';
            idSpan.textContent = `Scene ${sceneData.id}`;

            label.appendChild(title);
            label.appendChild(idSpan);
            item.appendChild(img);
            item.appendChild(label);

            item.addEventListener('click', () => {
                goToScene(index);
                closeGrid();
            });

            dom.gridBody.appendChild(item);
        });
    }

    function updateGridActive(activeIndex) {
        const items = dom.gridBody.querySelectorAll('.grid-item');
        items.forEach((item, i) => {
            item.classList.toggle('active', i === activeIndex);
        });
    }

    function openGrid() {
        dom.gridOverlay.classList.add('open');
        dom.btnGrid.classList.add('active');
        updateGridActive(currentSceneIndex);
    }

    function closeGrid() {
        dom.gridOverlay.classList.remove('open');
        dom.btnGrid.classList.remove('active');
    }

    function toggleGrid() {
        if (dom.gridOverlay.classList.contains('open')) {
            closeGrid();
        } else {
            closeAllPanels();
            openGrid();
        }
    }

    /* ── Shortcuts Panel ── */
    function toggleShortcuts() {
        const panel = dom.shortcutsPanel;
        if (panel.classList.contains('visible')) {
            panel.classList.remove('visible');
            dom.btnShortcuts.classList.remove('active');
        } else {
            closeAllPanels();
            panel.classList.add('visible');
            dom.btnShortcuts.classList.add('active');
        }
    }

    /* ── Fullscreen ── */
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen().catch(() => { });
        }
    }

    /* ── Close All Panels ── */
    function closeAllPanels() {
        closeGrid();
        dom.shortcutsPanel.classList.remove('visible');
        dom.btnShortcuts.classList.remove('active');
    }

    /* ── Toasts ── */
    function showToast(message, duration = 2000) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        dom.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('out');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    /* ──────────────────────────────────────────────
       TIMELINE BAR CLICK
       ────────────────────────────────────────────── */
    function handleTimelineClick(e) {
        const rect = dom.timelineBar.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        const targetIndex = Math.round(ratio * (totalScenes - 1));
        goToScene(Math.max(0, Math.min(totalScenes - 1, targetIndex)));
    }

    /* ──────────────────────────────────────────────
       AUTO-ROTATE
       ────────────────────────────────────────────── */
    function resetAutoRotateTimer() {
        isAutoRotating = false;
        clearTimeout(autoRotateTimer);
        autoRotateTimer = setTimeout(() => {
            isAutoRotating = true;
        }, CONFIG.AUTO_ROTATE_DELAY);
    }

    /* ──────────────────────────────────────────────
       EVENT BINDING
       ────────────────────────────────────────────── */
    function bindEvents() {
        // ── Mouse / Pointer Events ──
        const canvas = renderer.domElement;

        canvas.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);

        // ── Touch Events (for multi-touch zoom) ──
        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd);

        // ── Mouse Wheel (zoom) ──
        canvas.addEventListener('wheel', onWheel, { passive: false });

        // ── Keyboard ──
        document.addEventListener('keydown', onKeyDown);

        // ── Window Resize ──
        window.addEventListener('resize', onResize);

        // ── Button Clicks ──
        dom.btnPrev.addEventListener('click', goPrev);
        dom.btnNext.addEventListener('click', goNext);
        dom.btnFirst.addEventListener('click', goFirst);
        dom.btnLast.addEventListener('click', goLast);
        dom.btnGrid.addEventListener('click', toggleGrid);
        dom.btnFullscreen.addEventListener('click', toggleFullscreen);
        dom.btnShortcuts.addEventListener('click', toggleShortcuts);
        dom.gridClose.addEventListener('click', closeGrid);

        // Close grid on overlay click
        dom.gridOverlay.addEventListener('click', (e) => {
            if (e.target === dom.gridOverlay) closeGrid();
        });

        // Timeline bar click
        dom.timelineBar.addEventListener('click', handleTimelineClick);

        // Close shortcuts on outside click
        document.addEventListener('click', (e) => {
            if (dom.shortcutsPanel.classList.contains('visible') &&
                !dom.shortcutsPanel.contains(e.target) &&
                e.target !== dom.btnShortcuts &&
                !dom.btnShortcuts.contains(e.target)) {
                dom.shortcutsPanel.classList.remove('visible');
                dom.btnShortcuts.classList.remove('active');
            }
        });
    }

    /* ── Pointer Handlers ── */
    function onPointerDown(e) {
        if (e.button !== 0) return; // Left click only
        isUserInteracting = true;
        isAutoRotating = false;
        pointerX = e.clientX;
        pointerY = e.clientY;
        velocityLon = 0;
        velocityLat = 0;
    }

    function onPointerMove(e) {
        if (!isUserInteracting) return;

        const dx = (pointerX - e.clientX) * CONFIG.MOUSE_SENSITIVITY;
        const dy = (e.clientY - pointerY) * CONFIG.MOUSE_SENSITIVITY;

        velocityLon = dx;
        velocityLat = dy;

        targetLon += dx;
        targetLat += dy;

        pointerX = e.clientX;
        pointerY = e.clientY;
    }

    function onPointerUp() {
        isUserInteracting = false;
        resetAutoRotateTimer();
    }

    /* ── Touch Handlers (multi-touch zoom) ── */
    function onTouchStart(e) {
        if (e.touches.length === 1) {
            isUserInteracting = true;
            isAutoRotating = false;
            pointerX = e.touches[0].clientX;
            pointerY = e.touches[0].clientY;
            velocityLon = 0;
            velocityLat = 0;
        } else if (e.touches.length === 2) {
            pinchStartDist = getTouchDistance(e.touches);
        }
        e.preventDefault();
    }

    function onTouchMove(e) {
        if (e.touches.length === 1 && isUserInteracting) {
            const dx = (pointerX - e.touches[0].clientX) * CONFIG.TOUCH_SENSITIVITY;
            const dy = (e.touches[0].clientY - pointerY) * CONFIG.TOUCH_SENSITIVITY;

            velocityLon = dx;
            velocityLat = dy;

            targetLon += dx;
            targetLat += dy;

            pointerX = e.touches[0].clientX;
            pointerY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            const dist = getTouchDistance(e.touches);
            const delta = pinchStartDist - dist;
            camera.fov = Math.max(CONFIG.MIN_FOV, Math.min(CONFIG.MAX_FOV, camera.fov + delta * 0.05));
            camera.updateProjectionMatrix();
            pinchStartDist = dist;
        }
        e.preventDefault();
    }

    function onTouchEnd() {
        isUserInteracting = false;
        resetAutoRotateTimer();
    }

    function getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    /* ── Mouse Wheel (zoom) ── */
    function onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? CONFIG.ZOOM_SPEED : -CONFIG.ZOOM_SPEED;
        camera.fov = Math.max(CONFIG.MIN_FOV, Math.min(CONFIG.MAX_FOV, camera.fov + delta));
        camera.updateProjectionMatrix();
        resetAutoRotateTimer();
    }

    /* ── Keyboard ── */
    function onKeyDown(e) {
        // Don't handle if a panel input is focused
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                goPrev();
                break;
            case 'ArrowRight':
                e.preventDefault();
                goNext();
                break;
            case 'Home':
                e.preventDefault();
                goFirst();
                break;
            case 'End':
                e.preventDefault();
                goLast();
                break;
            case 'f':
            case 'F':
                toggleFullscreen();
                break;
            case 'g':
            case 'G':
                toggleGrid();
                break;
            case '?':
                toggleShortcuts();
                break;
            case 'Escape':
                closeAllPanels();
                break;
            case '+':
            case '=':
                camera.fov = Math.max(CONFIG.MIN_FOV, camera.fov - CONFIG.ZOOM_SPEED);
                camera.updateProjectionMatrix();
                break;
            case '-':
            case '_':
                camera.fov = Math.min(CONFIG.MAX_FOV, camera.fov + CONFIG.ZOOM_SPEED);
                camera.updateProjectionMatrix();
                break;
        }
    }

    /* ── Window Resize ── */
    function onResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /* ──────────────────────────────────────────────
       UTILITIES
       ────────────────────────────────────────────── */
    async function fetchJSON(url) {
        try {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return await resp.json();
        } catch (err) {
            console.error('Failed to load JSON:', err);
            showToast('Failed to load scene data');
            return { scenes: [], settings: {} };
        }
    }

    /* ──────────────────────────────────────────────
       BOOT
       ────────────────────────────────────────────── */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
