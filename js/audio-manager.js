export class AudioManager {
    constructor(audioPlayer) {
        this.audioPlayer = audioPlayer;
        this.ctx = null;
        this.source = null;
        this.preampGain = null;
        this.filters = [];
        this.EQ_FREQUENCIES = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];
        this.isSeeking = false;
    }

    init() {
        this.initEqualizer();
        this.setupAudioEvents();
    }

    initEqualizer() {
        if (!this.audioPlayer) return;

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();
        this.source = this.ctx.createMediaElementSource(this.audioPlayer);

        this.preampGain = this.ctx.createGain();
        this.preampGain.gain.value = 1;

        this.filters = this.EQ_FREQUENCIES.map(freq => {
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'peaking';
            filter.frequency.value = freq;
            filter.Q.value = 1.4;
            filter.gain.value = 0;
            return filter;
        });

        this.source.connect(this.preampGain);
        this.filters.reduce((prev, curr) => {
            prev.connect(curr);
            return curr;
        }, this.preampGain).connect(this.ctx.destination);

        const resumeCtx = () => {
            if (this.ctx.state === 'suspended') this.ctx.resume();
        };
        document.addEventListener('click', resumeCtx, { once: true });
        document.addEventListener('keydown', resumeCtx, { once: true });
    }

    setupAudioEvents() {
        const seekBar = document.getElementById('seekBar');
        const timeCounter = document.getElementById('timeCounter');

        if (seekBar) {
            seekBar.addEventListener('mousedown', () => { this.isSeeking = true; });
            seekBar.addEventListener('mouseup', () => { this.isSeeking = false; });
            seekBar.addEventListener('input', (e) => {
                if (this.audioPlayer.duration) {
                    this.audioPlayer.currentTime = (e.target.value / 100) * this.audioPlayer.duration;
                }
            });
        }

        this.audioPlayer.addEventListener('timeupdate', () => {
            if (!this.isSeeking && this.audioPlayer.duration && seekBar) {
                seekBar.value = (this.audioPlayer.currentTime / this.audioPlayer.duration) * 100;
            }

            if (timeCounter) {
                const currentMins = Math.floor(this.audioPlayer.currentTime / 60);
                const currentSecs = Math.floor(this.audioPlayer.currentTime % 60);
                timeCounter.textContent = `${currentMins.toString().padStart(2, '0')}:${currentSecs.toString().padStart(2, '0')}`;
            }
        });
    }

    setPreamp(db) {
        if (this.preampGain) {
            this.preampGain.gain.value = Math.pow(10, db / 20);
        }
    }

    setFilterGain(freq, gain) {
        const idx = this.EQ_FREQUENCIES.indexOf(parseInt(freq, 10));
        if (idx !== -1 && this.filters[idx]) {
            this.filters[idx].gain.value = gain;
        }
    }

    play() { this.audioPlayer.play(); }
    pause() { this.audioPlayer.pause(); }
    stop() {
        this.audioPlayer.pause();
        this.audioPlayer.currentTime = 0;
    }
    setVolume(vol) {
        this.audioPlayer.volume = vol;
    }
}
