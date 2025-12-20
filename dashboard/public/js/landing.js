/**
 * CheapShot Landing Page
 * Custom circuit board background animation + handlers
 * No libraries - pure math and canvas
 */

// ============================================================
// CIRCUIT BOARD BACKGROUND - Pure Math Animation
// ============================================================

class CircuitBoard {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.nodes = [];
        this.traces = [];
        this.pulses = [];
        this.time = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.width = this.canvas.width = window.innerWidth;
        this.height = this.canvas.height = window.innerHeight;
        this.generateCircuit();
    }

    generateCircuit() {
        this.nodes = [];
        this.traces = [];

        // Create grid of potential node positions
        const gridSize = 80;
        const cols = Math.ceil(this.width / gridSize) + 1;
        const rows = Math.ceil(this.height / gridSize) + 1;

        // Generate nodes with some randomness
        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                if (Math.random() > 0.7) { // 30% chance of node
                    const node = {
                        x: i * gridSize + (Math.random() - 0.5) * 30,
                        y: j * gridSize + (Math.random() - 0.5) * 30,
                        size: 2 + Math.random() * 3,
                        type: Math.random() > 0.8 ? 'hub' : 'point', // 20% are hubs
                        pulse: Math.random() * Math.PI * 2,
                        connections: []
                    };
                    this.nodes.push(node);
                }
            }
        }

        // Connect nearby nodes with traces
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const maxConnections = node.type === 'hub' ? 5 : 2;

            for (let j = i + 1; j < this.nodes.length; j++) {
                if (node.connections.length >= maxConnections) break;

                const other = this.nodes[j];
                const dx = other.x - node.x;
                const dy = other.y - node.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Connect if within range and not too many connections
                if (dist < 150 && dist > 30 && other.connections.length < maxConnections) {
                    // Only connect horizontally or vertically (circuit style)
                    if (Math.random() > 0.3) {
                        const trace = {
                            start: node,
                            end: other,
                            path: this.generateTracePath(node, other),
                            alpha: 0.1 + Math.random() * 0.2
                        };
                        this.traces.push(trace);
                        node.connections.push(trace);
                        other.connections.push(trace);
                    }
                }
            }
        }
    }

    generateTracePath(start, end) {
        // Create an L-shaped or straight path (like PCB traces)
        const path = [{ x: start.x, y: start.y }];

        if (Math.random() > 0.5) {
            // Horizontal then vertical
            path.push({ x: end.x, y: start.y });
        } else {
            // Vertical then horizontal
            path.push({ x: start.x, y: end.y });
        }

        path.push({ x: end.x, y: end.y });
        return path;
    }

    spawnPulse() {
        if (this.traces.length === 0) return;

        const trace = this.traces[Math.floor(Math.random() * this.traces.length)];
        this.pulses.push({
            trace: trace,
            progress: 0,
            speed: 0.01 + Math.random() * 0.02,
            size: 3 + Math.random() * 4,
            reverse: Math.random() > 0.5
        });
    }

    update() {
        this.time += 0.016; // ~60fps

        // Spawn new pulses occasionally
        if (Math.random() < 0.05) {
            this.spawnPulse();
        }

        // Update pulses
        for (let i = this.pulses.length - 1; i >= 0; i--) {
            const pulse = this.pulses[i];
            pulse.progress += pulse.speed;

            if (pulse.progress >= 1) {
                this.pulses.splice(i, 1);
            }
        }
    }

    draw() {
        const ctx = this.ctx;

        // Clear with fade effect
        ctx.fillStyle = 'rgba(2, 4, 8, 0.3)';
        ctx.fillRect(0, 0, this.width, this.height);

        // Draw traces
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        for (const trace of this.traces) {
            ctx.beginPath();
            ctx.moveTo(trace.path[0].x, trace.path[0].y);

            for (let i = 1; i < trace.path.length; i++) {
                ctx.lineTo(trace.path[i].x, trace.path[i].y);
            }

            ctx.strokeStyle = `rgba(0, 212, 255, ${trace.alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Draw pulses
        for (const pulse of this.pulses) {
            const path = pulse.trace.path;
            const totalLength = this.getPathLength(path);
            const currentDist = (pulse.reverse ? 1 - pulse.progress : pulse.progress) * totalLength;
            const pos = this.getPointAlongPath(path, currentDist);

            // Glow
            const gradient = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, pulse.size * 3);
            gradient.addColorStop(0, 'rgba(0, 255, 136, 0.8)');
            gradient.addColorStop(0.5, 'rgba(0, 212, 255, 0.3)');
            gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, pulse.size * 3, 0, Math.PI * 2);
            ctx.fillStyle = gradient;
            ctx.fill();

            // Core
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, pulse.size, 0, Math.PI * 2);
            ctx.fillStyle = '#00ff88';
            ctx.fill();
        }

        // Draw nodes
        for (const node of this.nodes) {
            const pulseAmount = Math.sin(this.time * 2 + node.pulse) * 0.3 + 0.7;

            if (node.type === 'hub') {
                // Hub nodes - larger with glow
                const size = node.size * 1.5;

                // Outer glow
                const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, size * 4);
                gradient.addColorStop(0, `rgba(0, 212, 255, ${0.3 * pulseAmount})`);
                gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');

                ctx.beginPath();
                ctx.arc(node.x, node.y, size * 4, 0, Math.PI * 2);
                ctx.fillStyle = gradient;
                ctx.fill();

                // Inner square (circuit junction style)
                ctx.fillStyle = `rgba(0, 212, 255, ${0.8 * pulseAmount})`;
                ctx.fillRect(node.x - size, node.y - size, size * 2, size * 2);

                // Center dot
                ctx.fillStyle = '#00ff88';
                ctx.fillRect(node.x - size / 2, node.y - size / 2, size, size);
            } else {
                // Regular nodes - small circles
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.size * pulseAmount, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(0, 212, 255, ${0.5 * pulseAmount})`;
                ctx.fill();
            }
        }

        // Draw scan line effect
        const scanY = (this.time * 50) % (this.height + 100) - 50;
        const scanGradient = ctx.createLinearGradient(0, scanY - 50, 0, scanY + 50);
        scanGradient.addColorStop(0, 'rgba(0, 212, 255, 0)');
        scanGradient.addColorStop(0.5, 'rgba(0, 212, 255, 0.03)');
        scanGradient.addColorStop(1, 'rgba(0, 212, 255, 0)');

        ctx.fillStyle = scanGradient;
        ctx.fillRect(0, scanY - 50, this.width, 100);
    }

    getPathLength(path) {
        let length = 0;
        for (let i = 1; i < path.length; i++) {
            const dx = path[i].x - path[i - 1].x;
            const dy = path[i].y - path[i - 1].y;
            length += Math.sqrt(dx * dx + dy * dy);
        }
        return length;
    }

    getPointAlongPath(path, distance) {
        let traveled = 0;

        for (let i = 1; i < path.length; i++) {
            const dx = path[i].x - path[i - 1].x;
            const dy = path[i].y - path[i - 1].y;
            const segmentLength = Math.sqrt(dx * dx + dy * dy);

            if (traveled + segmentLength >= distance) {
                const t = (distance - traveled) / segmentLength;
                return {
                    x: path[i - 1].x + dx * t,
                    y: path[i - 1].y + dy * t
                };
            }

            traveled += segmentLength;
        }

        return path[path.length - 1];
    }

    animate() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

// ============================================================
// INITIALIZATION
// ============================================================

// Discord OAuth configuration
const CONFIG = {
    clientId: '1447587559604486417',
    get redirectUri() {
        return encodeURIComponent(window.location.origin + '/callback');
    },
    get oauthUrl() {
        return `https://discord.com/oauth2/authorize?client_id=${this.clientId}&response_type=code&redirect_uri=${this.redirectUri}&scope=${encodeURIComponent('identify guilds guilds.members.read')}`;
    },
    get botInviteUrl() {
        return `https://discord.com/api/oauth2/authorize?client_id=${this.clientId}&permissions=8&scope=bot%20applications.commands`;
    }
};

// Initialize circuit board background
const canvas = document.getElementById('circuit-bg');
if (canvas) {
    const circuit = new CircuitBoard(canvas);
    circuit.animate();
}

// Button handlers
document.getElementById('add-btn')?.addEventListener('click', () => {
    window.open(CONFIG.botInviteUrl, '_blank');
});

document.getElementById('dashboard-btn')?.addEventListener('click', () => {
    window.location.href = CONFIG.oauthUrl;
});

document.getElementById('nav-login')?.addEventListener('click', () => {
    window.location.href = CONFIG.oauthUrl;
});

// Check if already logged in
fetch('/api/auth/user', { credentials: 'include' })
    .then(r => r.ok && (window.location.href = '/dashboard.html'))
    .catch(() => { });

// Typing animation for the "new way" text
const phrases = [
    '"Ban that spammer for a week"',
    '"Create a voice channel for gaming"',
    '"Set up roles for my server"',
    '"Make an announcement channel"',
    '"Generate an image of a sunset"'
];

let phraseIndex = 0;
let charIndex = 0;
let isDeleting = false;
let typeSpeed = 50;

function typeEffect() {
    const element = document.querySelector('.new-way span:first-child');
    if (!element) return;

    const currentPhrase = phrases[phraseIndex];

    if (isDeleting) {
        element.textContent = currentPhrase.substring(0, charIndex - 1);
        charIndex--;
        typeSpeed = 30;
    } else {
        element.textContent = currentPhrase.substring(0, charIndex + 1);
        charIndex++;
        typeSpeed = 50 + Math.random() * 50;
    }

    if (!isDeleting && charIndex === currentPhrase.length) {
        isDeleting = true;
        typeSpeed = 2000; // Pause at end
    } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        phraseIndex = (phraseIndex + 1) % phrases.length;
        typeSpeed = 500; // Pause before next phrase
    }

    setTimeout(typeEffect, typeSpeed);
}

// Start typing animation after a delay
setTimeout(typeEffect, 1500);
