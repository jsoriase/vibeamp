export class WindowManager {
    constructor() {
        this.activeWindow = null;
        this.highestZIndex = 10;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragStartRects = new Map();
        this.activeDescendants = [];
        this.SNAP_DISTANCE = 15;
        this.parentOf = new Map();
        this.isMainDragging = false;
    }

    init() {
        this.setupDragging();
        this.setupControls();
        this.setupMainTracking();
        this.setupPointerEvents();
        this.initialSnap();
    }

    getDescendants(win) {
        let descendants = [];
        for (const [child, parent] of this.parentOf.entries()) {
            if (parent === win) {
                descendants.push(child);
                descendants = descendants.concat(this.getDescendants(child));
            }
        }
        return descendants;
    }

    setupDragging() {
        document.querySelectorAll('.vibeamp-window').forEach(win => {
            const titleBar = win.querySelector('.window-titlebar');
            titleBar.addEventListener('mousedown', (e) => {
                if (e.target.classList.contains('titlebar-controls') || e.target.closest('.titlebar-controls')) return;

                this.activeWindow = win;
                this.activeWindow.style.zIndex = ++this.highestZIndex;

                this.parentOf.delete(this.activeWindow);
                this.activeDescendants = this.getDescendants(this.activeWindow);
                this.activeDescendants.forEach(desc => {
                    desc.style.zIndex = ++this.highestZIndex;
                });

                const rect = this.activeWindow.getBoundingClientRect();
                this.dragStartX = e.clientX;
                this.dragStartY = e.clientY;

                this.dragStartRects.clear();
                this.dragStartRects.set(this.activeWindow, rect);
                this.activeDescendants.forEach(desc => {
                    this.dragStartRects.set(desc, desc.getBoundingClientRect());
                });
            });
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.activeWindow) return;

            let deltaX = e.clientX - this.dragStartX;
            let deltaY = e.clientY - this.dragStartY;

            const baseRect = this.dragStartRects.get(this.activeWindow);
            let newX = baseRect.left + deltaX;
            let newY = baseRect.top + deltaY;

            let bestX = newX;
            let bestY = newY;

            const allWindows = Array.from(document.querySelectorAll('.vibeamp-window:not(.minimized)'));
            const snapCandidates = allWindows.filter(w => w !== this.activeWindow && !this.activeDescendants.includes(w) && w.style.display !== 'none');

            for (const other of snapCandidates) {
                const oRect = other.getBoundingClientRect();
                const yOverlaps = (newY < oRect.bottom + this.SNAP_DISTANCE) && (newY + baseRect.height > oRect.top - this.SNAP_DISTANCE);
                const xOverlaps = (newX < oRect.right + this.SNAP_DISTANCE) && (newX + baseRect.width > oRect.left - this.SNAP_DISTANCE);

                if (yOverlaps) {
                    if (Math.abs(newX + baseRect.width - oRect.left) < this.SNAP_DISTANCE) bestX = oRect.left - baseRect.width;
                    else if (Math.abs(newX - oRect.right) < this.SNAP_DISTANCE) bestX = oRect.right;
                    else if (Math.abs(newX - oRect.left) < this.SNAP_DISTANCE) bestX = oRect.left;
                    else if (Math.abs(newX + baseRect.width - oRect.right) < this.SNAP_DISTANCE) bestX = oRect.right - baseRect.width;
                }

                if (xOverlaps) {
                    if (Math.abs(newY + baseRect.height - oRect.top) < this.SNAP_DISTANCE) bestY = oRect.top - baseRect.height;
                    else if (Math.abs(newY - oRect.bottom) < this.SNAP_DISTANCE) bestY = oRect.bottom;
                    else if (Math.abs(newY - oRect.top) < this.SNAP_DISTANCE) bestY = oRect.top;
                    else if (Math.abs(newY + baseRect.height - oRect.bottom) < this.SNAP_DISTANCE) bestY = oRect.bottom - baseRect.height;
                }
            }

            const screenW = window.innerWidth;
            const screenH = window.innerHeight;

            if (Math.abs(bestX) < this.SNAP_DISTANCE) bestX = 0;
            else if (Math.abs(bestX + baseRect.width - screenW) < this.SNAP_DISTANCE) bestX = screenW - baseRect.width;

            if (Math.abs(bestY) < this.SNAP_DISTANCE) bestY = 0;
            else if (Math.abs(bestY + baseRect.height - screenH) < this.SNAP_DISTANCE) bestY = screenH - baseRect.height;

            bestX = Math.max(0, Math.min(bestX, screenW - baseRect.width));
            bestY = Math.max(0, Math.min(bestY, screenH - baseRect.height));

            const finalDeltaX = bestX - baseRect.left;
            const finalDeltaY = bestY - baseRect.top;

            this.activeWindow.style.left = `${bestX}px`;
            this.activeWindow.style.top = `${bestY}px`;

            this.activeDescendants.forEach(desc => {
                const dRect = this.dragStartRects.get(desc);
                desc.style.left = `${dRect.left + finalDeltaX}px`;
                desc.style.top = `${dRect.top + finalDeltaY}px`;
            });
        });

        document.addEventListener('mouseup', () => {
            if (!this.activeWindow) return;

            const aRect = this.activeWindow.getBoundingClientRect();
            const allWindows = Array.from(document.querySelectorAll('.vibeamp-window:not(.minimized)'));
            const snapCandidates = allWindows.filter(w => w !== this.activeWindow && !this.activeDescendants.includes(w) && w.style.display !== 'none');

            let newParent = null;
            const t = 5;

            for (const other of snapCandidates) {
                const oRect = other.getBoundingClientRect();
                const touchesX = Math.abs(aRect.right - oRect.left) <= t || Math.abs(aRect.left - oRect.right) <= t || Math.abs(aRect.left - oRect.left) <= t || Math.abs(aRect.right - oRect.right) <= t;
                const touchesY = Math.abs(aRect.bottom - oRect.top) <= t || Math.abs(aRect.top - oRect.bottom) <= t || Math.abs(aRect.top - oRect.top) <= t || Math.abs(aRect.bottom - oRect.bottom) <= t;

                const overlapsX = (aRect.left <= oRect.right + t) && (aRect.right >= oRect.left - t);
                const overlapsY = (aRect.top <= oRect.bottom + t) && (aRect.bottom >= oRect.top - t);

                if ((touchesX && overlapsY) || (touchesY && overlapsX)) {
                    newParent = other;
                    break;
                }
            }

            if (newParent) {
                this.parentOf.set(this.activeWindow, newParent);
            }

            this.activeWindow = null;
            this.activeDescendants = [];
        });
    }

    setupControls() {
        document.querySelectorAll('.titlebar-controls').forEach(controls => {
            controls.addEventListener('click', (e) => {
                const win = e.target.closest('.vibeamp-window');
                if (win.id === 'playerSection') {
                    if (e.target.classList.contains('ctrl-min')) {
                        window.electronAPI.minimizeApp();
                    } else if (e.target.classList.contains('ctrl-close')) {
                        window.electronAPI.closeApp();
                    }
                    return;
                }

                const content = win.querySelector('.window-content');
                if (win.classList.contains('minimized')) {
                    win.classList.remove('minimized');
                    content.style.display = 'flex';
                } else {
                    win.classList.add('minimized');
                    content.style.display = 'none';
                    this.dockMinimizedWindow(win);
                }
            });
        });
    }

    dockMinimizedWindow(win) {
        const mainWindow = document.getElementById('playerSection');
        if (!mainWindow) return;

        const rect = mainWindow.getBoundingClientRect();
        const dockedWindows = Array.from(document.querySelectorAll('.vibeamp-window.minimized'));
        const index = dockedWindows.indexOf(win);
        const offsetY = rect.height + (index * 25);

        win.style.left = `${rect.left}px`;
        win.style.top = `${rect.top + offsetY}px`;
    }

    setupMainTracking() {
        const mainWindow = document.getElementById('playerSection');
        if (mainWindow) {
            const mainTitleBar = mainWindow.querySelector('.window-titlebar');
            mainTitleBar.addEventListener('mousedown', () => { this.isMainDragging = true; });
            document.addEventListener('mouseup', () => { this.isMainDragging = false; });
            document.addEventListener('mousemove', () => {
                if (!this.isMainDragging) return;
                document.querySelectorAll('.vibeamp-window.minimized').forEach(win => {
                    this.dockMinimizedWindow(win);
                });
            });
        }
    }

    setupPointerEvents() {
        window.addEventListener('mousemove', (e) => {
            if (e.target === document.body || e.target === document.documentElement || e.target.classList.contains('app-container')) {
                window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
            } else {
                window.electronAPI.setIgnoreMouseEvents(false);
            }
        });
    }

    initialSnap() {
        window.addEventListener('load', () => {
            const player = document.getElementById('playerSection');
            const eq = document.querySelector('.eq-window');
            const playlist = document.querySelector('.playlist-window');
            const search = document.querySelector('.search-window');
            const art = document.querySelector('.art-window');

            if (player && eq && playlist && search && art) {
                const pRect = player.getBoundingClientRect();

                eq.style.left = `${pRect.left}px`;
                eq.style.top = `${pRect.bottom}px`;
                this.parentOf.set(eq, player);

                search.style.left = `${pRect.right}px`;
                search.style.top = `${pRect.top}px`;
                this.parentOf.set(search, player);

                requestAnimationFrame(() => {
                    const eRect = eq.getBoundingClientRect();
                    playlist.style.left = `${eRect.left}px`;
                    playlist.style.top = `${eRect.bottom}px`;
                    this.parentOf.set(playlist, eq);

                    const sRect = search.getBoundingClientRect();
                    art.style.left = `${sRect.left}px`;
                    art.style.top = `${sRect.bottom}px`;
                    this.parentOf.set(art, search);
                });
            }
        });
    }

    bringToFront(win) {
        if (!win) return;
        const descendants = this.getDescendants(win);
        descendants.forEach(desc => {
            desc.style.zIndex = ++this.highestZIndex;
        });
        win.style.zIndex = ++this.highestZIndex;
    }
}
