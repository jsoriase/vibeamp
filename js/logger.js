export class Logger {
    constructor(logAreaId) {
        this.logArea = document.getElementById(logAreaId);
        this.originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            debug: console.debug
        };
    }

    init() {
        console.log = (...args) => this.log('info', ...args);
        console.error = (...args) => this.log('error', ...args);
        console.warn = (...args) => this.log('warn', ...args);
        console.debug = (...args) => this.log('debug', ...args);

        // Map window.onerror
        window.onerror = (message, source, lineno, colno, error) => {
            this.log('error', `Uncaught Error: ${message} at ${source}:${lineno}:${colno}`);
            return false;
        };

        this.log('info', 'Logger initialized.');
    }

    log(level, ...args) {
        // Call original console
        this.originalConsole[level === 'info' ? 'log' : level](...args);

        if (!this.logArea) return;

        const entry = document.createElement('div');
        entry.className = `log-entry ${level}`;

        const timestamp = new Date().toLocaleTimeString();
        const msg = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return '[Object]';
                }
            }
            return String(arg);
        }).join(' ');

        entry.innerHTML = `<span class="log-entry timestamp">[${timestamp}]</span>${msg}`;
        this.logArea.appendChild(entry);

        // Auto-scroll
        this.logArea.scrollTop = this.logArea.scrollHeight;

        // Limit entries to prevent memory leaks
        while (this.logArea.children.length > 200) {
            this.logArea.removeChild(this.logArea.firstChild);
        }
    }
}
