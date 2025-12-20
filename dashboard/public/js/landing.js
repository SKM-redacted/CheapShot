/**
 * CheapShot Landing Page
 * Custom circuit board animation + terminal typing effect
 * No external libraries - pure JavaScript + Canvas
 */

// =============================================================================
// CONFIGURATION
// =============================================================================
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

// =============================================================================
// CIRCUIT BOARD ANIMATION
// =============================================================================
class CircuitBoard {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.nodes = [];
        this.connections = [];
        this.pulses = [];
        this.gridSize = 60;
        this.time = 0;

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.generateCircuit();
    }

    generateCircuit() {
        this.nodes = [];
        this.connections = [];

        const cols = Math.ceil(this.canvas.width / this.gridSize) + 1;
        const rows = Math.ceil(this.canvas.height / this.gridSize) + 1;

        // Create grid nodes with some randomness
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                // Only create nodes at ~30% of grid intersections
                if (Math.random() > 0.7) {
                    const node = {
                        x: x * this.gridSize + (Math.random() - 0.5) * 20,
                        y: y * this.gridSize + (Math.random() - 0.5) * 20,
                        radius: 2 + Math.random() * 3,
                        pulse: Math.random() * Math.PI * 2,
                        pulseSpeed: 0.02 + Math.random() * 0.03,
                        isJunction: Math.random() > 0.7
                    };
                    this.nodes.push(node);
                }
            }
        }

        // Create connections between nearby nodes
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];

            // Find nearby nodes to connect to
            for (let j = i + 1; j < this.nodes.length; j++) {
                const other = this.nodes[j];
                const dx = other.x - node.x;
                const dy = other.y - node.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                // Connect if within range and limit connections per node
                if (dist < this.gridSize * 2 && Math.random() > 0.5) {
                    this.connections.push({
                        from: node,
                        to: other,
                        pulseOffset: Math.random() * 100
                    });
                }
            }
        }
    }

    spawnPulse() {
        if (this.connections.length === 0) return;

        // Spawn a pulse on a random connection
        const conn = this.connections[Math.floor(Math.random() * this.connections.length)];
        this.pulses.push({
            connection: conn,
            progress: 0,
            speed: 0.01 + Math.random() * 0.02,
            reverse: Math.random() > 0.5
        });
    }

    update() {
        this.time += 0.016; // ~60fps

        // Spawn new pulses periodically
        if (Math.random() > 0.95) {
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
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Clear with fade effect
        ctx.fillStyle = 'rgba(5, 5, 7, 0.1)';
        ctx.fillRect(0, 0, w, h);

        // Draw connections
        ctx.lineWidth = 1;
        for (const conn of this.connections) {
            const alpha = 0.08 + Math.sin(this.time + conn.pulseOffset) * 0.03;
            ctx.strokeStyle = `rgba(255, 45, 45, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(conn.from.x, conn.from.y);

            // Draw with right angles (circuit style)
            const midX = (conn.from.x + conn.to.x) / 2;
            if (Math.abs(conn.to.x - conn.from.x) > Math.abs(conn.to.y - conn.from.y)) {
                ctx.lineTo(midX, conn.from.y);
                ctx.lineTo(midX, conn.to.y);
            } else {
                const midY = (conn.from.y + conn.to.y) / 2;
                ctx.lineTo(conn.from.x, midY);
                ctx.lineTo(conn.to.x, midY);
            }
            ctx.lineTo(conn.to.x, conn.to.y);
            ctx.stroke();
        }

        // Draw pulses traveling along connections
        for (const pulse of this.pulses) {
            const conn = pulse.connection;
            const t = pulse.reverse ? 1 - pulse.progress : pulse.progress;

            // Calculate position along the path
            let x, y;
            if (t < 0.5) {
                const midX = (conn.from.x + conn.to.x) / 2;
                if (Math.abs(conn.to.x - conn.from.x) > Math.abs(conn.to.y - conn.from.y)) {
                    x = conn.from.x + (midX - conn.from.x) * (t * 2);
                    y = conn.from.y;
                } else {
                    const midY = (conn.from.y + conn.to.y) / 2;
                    x = conn.from.x;
                    y = conn.from.y + (midY - conn.from.y) * (t * 2);
                }
            } else {
                const midX = (conn.from.x + conn.to.x) / 2;
                if (Math.abs(conn.to.x - conn.from.x) > Math.abs(conn.to.y - conn.from.y)) {
                    x = midX;
                    y = conn.from.y + (conn.to.y - conn.from.y) * ((t - 0.5) * 2);
                } else {
                    const midY = (conn.from.y + conn.to.y) / 2;
                    x = conn.from.x + (conn.to.x - conn.from.x) * ((t - 0.5) * 2);
                    y = midY;
                }
            }

            // Draw pulse glow
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, 20);
            gradient.addColorStop(0, 'rgba(255, 45, 45, 0.8)');
            gradient.addColorStop(0.5, 'rgba(255, 45, 45, 0.2)');
            gradient.addColorStop(1, 'rgba(255, 45, 45, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, 20, 0, Math.PI * 2);
            ctx.fill();

            // Draw pulse core
            ctx.fillStyle = '#ff2d2d';
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw nodes
        for (const node of this.nodes) {
            const pulse = Math.sin(this.time * node.pulseSpeed * 60 + node.pulse);
            const alpha = 0.3 + pulse * 0.2;
            const radius = node.radius + pulse * 1;

            if (node.isJunction) {
                // Junction nodes - larger, brighter
                ctx.fillStyle = `rgba(255, 45, 45, ${alpha + 0.3})`;
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius + 2, 0, Math.PI * 2);
                ctx.fill();

                // Inner glow
                ctx.fillStyle = `rgba(255, 100, 100, ${alpha + 0.4})`;
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // Regular nodes
                ctx.fillStyle = `rgba(255, 45, 45, ${alpha})`;
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    animate() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

// =============================================================================
// TERMINAL TYPING EFFECT
// =============================================================================
class TerminalTyper {
    constructor(element) {
        this.element = element;
        this.phrases = [
            'create a voice channel called gaming',
            'set up roles for my gaming server',
            'make #announcements read-only',
            'generate an image of a sunset',
            'organize my channels by category',
            'timeout @spammer for 10 minutes',
            'delete all empty channels',
            'create a welcome message'
        ];
        this.currentPhrase = 0;
        this.currentChar = 0;
        this.isDeleting = false;
        this.pauseTime = 0;
    }

    update() {
        const phrase = this.phrases[this.currentPhrase];

        if (this.pauseTime > 0) {
            this.pauseTime--;
            return;
        }

        if (this.isDeleting) {
            // Delete characters
            this.currentChar--;
            this.element.textContent = phrase.substring(0, this.currentChar);

            if (this.currentChar === 0) {
                this.isDeleting = false;
                this.currentPhrase = (this.currentPhrase + 1) % this.phrases.length;
                this.pauseTime = 30; // Pause before typing next
            }
        } else {
            // Type characters
            this.currentChar++;
            this.element.textContent = phrase.substring(0, this.currentChar);

            if (this.currentChar === phrase.length) {
                this.isDeleting = true;
                this.pauseTime = 120; // Pause at end of phrase
            }
        }
    }

    start() {
        setInterval(() => this.update(), 50);
    }
}

// =============================================================================
// INITIALIZATION
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Start circuit animation
    const canvas = document.getElementById('circuit');
    if (canvas) {
        const circuit = new CircuitBoard(canvas);
        circuit.animate();
    }

    // Start typing effect
    const typingElement = document.getElementById('typing');
    if (typingElement) {
        const typer = new TerminalTyper(typingElement);
        typer.start();
    }

    // Button handlers
    document.getElementById('add-btn')?.addEventListener('click', () => {
        window.open(CONFIG.botInviteUrl, '_blank');
    });

    document.getElementById('dashboard-btn')?.addEventListener('click', () => {
        window.location.href = CONFIG.oauthUrl;
    });

    document.getElementById('login-btn')?.addEventListener('click', () => {
        window.location.href = CONFIG.oauthUrl;
    });

    // Check if already logged in
    fetch('/api/auth/user', { credentials: 'include' })
        .then(r => r.ok && (window.location.href = '/dashboard.html'))
        .catch(() => { });
});
