/**
 * CheapShot Landing Page
 * Custom mathematical background - no libraries
 * 
 * Creates a flowing neural network visualization representing AI intelligence
 */

// === CONFIGURATION ===
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

// === CANVAS SETUP ===
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let width, height;
let mouse = { x: null, y: null };
let time = 0;

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}

// === SIMPLEX NOISE (Custom Implementation) ===
// Mathematical noise for organic flow
class SimplexNoise {
    constructor() {
        this.p = new Uint8Array(256);
        for (let i = 0; i < 256; i++) this.p[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
        }
        this.perm = new Uint8Array(512);
        for (let i = 0; i < 512; i++) this.perm[i] = this.p[i & 255];
    }

    dot2(g, x, y) {
        return g[0] * x + g[1] * y;
    }

    noise2D(x, y) {
        const G2 = (3 - Math.sqrt(3)) / 6;
        const F2 = (Math.sqrt(3) - 1) / 2;

        const s = (x + y) * F2;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const t = (i + j) * G2;

        const X0 = i - t;
        const Y0 = j - t;
        const x0 = x - X0;
        const y0 = y - Y0;

        const i1 = x0 > y0 ? 1 : 0;
        const j1 = x0 > y0 ? 0 : 1;

        const x1 = x0 - i1 + G2;
        const y1 = y0 - j1 + G2;
        const x2 = x0 - 1 + 2 * G2;
        const y2 = y0 - 1 + 2 * G2;

        const ii = i & 255;
        const jj = j & 255;

        const grad3 = [
            [1, 1], [-1, 1], [1, -1], [-1, -1],
            [1, 0], [-1, 0], [0, 1], [0, -1]
        ];

        const gi0 = this.perm[ii + this.perm[jj]] % 8;
        const gi1 = this.perm[ii + i1 + this.perm[jj + j1]] % 8;
        const gi2 = this.perm[ii + 1 + this.perm[jj + 1]] % 8;

        let n0 = 0, n1 = 0, n2 = 0;

        let t0 = 0.5 - x0 * x0 - y0 * y0;
        if (t0 >= 0) {
            t0 *= t0;
            n0 = t0 * t0 * this.dot2(grad3[gi0], x0, y0);
        }

        let t1 = 0.5 - x1 * x1 - y1 * y1;
        if (t1 >= 0) {
            t1 *= t1;
            n1 = t1 * t1 * this.dot2(grad3[gi1], x1, y1);
        }

        let t2 = 0.5 - x2 * x2 - y2 * y2;
        if (t2 >= 0) {
            t2 *= t2;
            n2 = t2 * t2 * this.dot2(grad3[gi2], x2, y2);
        }

        return 70 * (n0 + n1 + n2);
    }
}

const noise = new SimplexNoise();

// === NEURAL NODES ===
class Node {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.baseX = x;
        this.baseY = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = 1.5 + Math.random() * 2;
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.pulseSpeed = 0.02 + Math.random() * 0.02;
        this.connections = [];
        this.energy = 0;
        this.targetEnergy = 0;
    }

    update(t) {
        // Noise-based organic movement
        const noiseScale = 0.002;
        const noiseStrength = 30;

        const nx = noise.noise2D(this.baseX * noiseScale + t * 0.0003, this.baseY * noiseScale);
        const ny = noise.noise2D(this.baseX * noiseScale, this.baseY * noiseScale + t * 0.0003);

        const targetX = this.baseX + nx * noiseStrength;
        const targetY = this.baseY + ny * noiseStrength;

        // Mouse interaction
        if (mouse.x !== null) {
            const dx = this.x - mouse.x;
            const dy = this.y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxDist = 200;

            if (dist < maxDist) {
                const force = (1 - dist / maxDist) * 50;
                this.vx += (dx / dist) * force * 0.05;
                this.vy += (dy / dist) * force * 0.05;
                this.targetEnergy = 1;
            }
        }

        // Apply forces
        this.vx += (targetX - this.x) * 0.02;
        this.vy += (targetY - this.y) * 0.02;
        this.vx *= 0.92;
        this.vy *= 0.92;
        this.x += this.vx;
        this.y += this.vy;

        // Energy decay
        this.energy += (this.targetEnergy - this.energy) * 0.1;
        this.targetEnergy *= 0.95;

        // Pulse
        this.pulsePhase += this.pulseSpeed;
    }

    draw() {
        const pulse = Math.sin(this.pulsePhase) * 0.3 + 1;
        const r = this.radius * pulse;
        const alpha = 0.3 + this.energy * 0.7;

        // Glow
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r * 4);
        gradient.addColorStop(0, `rgba(255, 45, 45, ${0.3 * alpha})`);
        gradient.addColorStop(1, 'rgba(255, 45, 45, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r * 4, 0, Math.PI * 2);
        ctx.fill();

        // Core
        ctx.fillStyle = `rgba(255, ${100 + this.energy * 100}, ${100 + this.energy * 100}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

// === CONNECTION LINES ===
function drawConnections(nodes) {
    const maxDist = 150;

    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < maxDist) {
                const alpha = (1 - dist / maxDist) * 0.15;
                const energy = (a.energy + b.energy) / 2;

                ctx.strokeStyle = `rgba(255, ${50 + energy * 50}, ${50 + energy * 50}, ${alpha + energy * 0.2})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }
    }
}

// === FLOW FIELD ===
function drawFlowField(t) {
    const cellSize = 50;
    const cols = Math.ceil(width / cellSize);
    const rows = Math.ceil(height / cellSize);

    ctx.strokeStyle = 'rgba(255, 45, 45, 0.03)';
    ctx.lineWidth = 1;

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const x = i * cellSize + cellSize / 2;
            const y = j * cellSize + cellSize / 2;

            const angle = noise.noise2D(x * 0.005 + t * 0.0002, y * 0.005) * Math.PI * 2;
            const length = 20;

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
            ctx.stroke();
        }
    }
}

// === WAVE INTERFERENCE ===
function drawWaves(t) {
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.strokeStyle = 'rgba(255, 45, 45, 0.02)';
    ctx.lineWidth = 1;

    for (let r = 50; r < Math.max(width, height); r += 80) {
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 2; a += 0.02) {
            const wave = Math.sin(r * 0.01 + t * 0.001 + a * 3) * 20;
            const px = centerX + Math.cos(a) * (r + wave);
            const py = centerY + Math.sin(a) * (r + wave);

            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
    }
}

// === INITIALIZE ===
let nodes = [];

function init() {
    resize();
    nodes = [];

    // Create grid of nodes
    const spacing = 80;
    const cols = Math.ceil(width / spacing) + 1;
    const rows = Math.ceil(height / spacing) + 1;

    for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
            const x = i * spacing + (Math.random() - 0.5) * spacing * 0.5;
            const y = j * spacing + (Math.random() - 0.5) * spacing * 0.5;
            nodes.push(new Node(x, y));
        }
    }
}

// === ANIMATION LOOP ===
function animate() {
    time++;

    // Fade effect
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(0, 0, width, height);

    // Draw layers
    drawWaves(time);
    drawFlowField(time);
    drawConnections(nodes);

    // Update and draw nodes
    nodes.forEach(node => {
        node.update(time);
        node.draw();
    });

    requestAnimationFrame(animate);
}

// === EVENT LISTENERS ===
window.addEventListener('resize', () => {
    resize();
    init();
});

canvas.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

canvas.addEventListener('mouseleave', () => {
    mouse.x = null;
    mouse.y = null;
});

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    mouse.x = e.touches[0].clientX;
    mouse.y = e.touches[0].clientY;
}, { passive: false });

canvas.addEventListener('touchend', () => {
    mouse.x = null;
    mouse.y = null;
});

// === BUTTON HANDLERS ===
document.getElementById('add')?.addEventListener('click', () => {
    window.open(CONFIG.botInviteUrl, '_blank');
});

document.getElementById('dashboard')?.addEventListener('click', () => {
    window.location.href = CONFIG.oauthUrl;
});

document.getElementById('signin')?.addEventListener('click', () => {
    window.location.href = CONFIG.oauthUrl;
});

// === AUTH CHECK ===
fetch('/api/auth/user', { credentials: 'include' })
    .then(r => r.ok && (window.location.href = '/dashboard.html'))
    .catch(() => { });

// === START ===
init();
animate();
