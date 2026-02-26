import { AudioManager } from './js/audio-manager.js';
import { WindowManager } from './js/window-manager.js';
import { UIController } from './js/ui-controller.js';
import { Logger } from './js/logger.js';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Logger
    const logger = new Logger('logArea');
    logger.init();

    const audioPlayer = document.getElementById('audioPlayer');

    // Initialize Audio Manager
    const audioManager = new AudioManager(audioPlayer);
    audioManager.init();

    // Initialize Window Manager
    const windowManager = new WindowManager();
    windowManager.init();

    // Initialize UI Controller
    const uiController = new UIController(audioManager, windowManager);
    uiController.init();

    console.log('VibeAmp Streamer initialized in modular mode.');
});
