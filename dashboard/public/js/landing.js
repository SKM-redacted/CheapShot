/**
 * CheapShot Landing Page
 * Particle configuration and button handlers
 */

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

// tsParticles configuration
const particlesConfig = {
    fullScreen: false,
    background: {
        color: { value: "#000000" }
    },
    fpsLimit: 60,
    particles: {
        number: {
            value: 80,
            density: {
                enable: true,
                area: 800
            }
        },
        color: {
            value: ["#ff2d2d", "#ff4444", "#ffffff", "#333333"]
        },
        shape: {
            type: "circle"
        },
        opacity: {
            value: { min: 0.1, max: 0.5 },
            animation: {
                enable: true,
                speed: 0.5,
                minimumValue: 0.1,
                sync: false
            }
        },
        size: {
            value: { min: 1, max: 3 },
            animation: {
                enable: true,
                speed: 2,
                minimumValue: 0.5,
                sync: false
            }
        },
        links: {
            enable: true,
            distance: 120,
            color: "#ff2d2d",
            opacity: 0.08,
            width: 1
        },
        move: {
            enable: true,
            speed: 0.8,
            direction: "none",
            random: true,
            straight: false,
            outModes: {
                default: "out"
            },
            attract: {
                enable: true,
                rotateX: 600,
                rotateY: 1200
            }
        }
    },
    interactivity: {
        detectsOn: "window",
        events: {
            onHover: {
                enable: true,
                mode: "grab"
            },
            onClick: {
                enable: true,
                mode: "push"
            },
            resize: true
        },
        modes: {
            grab: {
                distance: 180,
                links: {
                    opacity: 0.25,
                    color: "#ff2d2d"
                }
            },
            push: {
                quantity: 3
            },
            repulse: {
                distance: 150,
                duration: 0.4
            }
        }
    },
    detectRetina: true
};

// Initialize particles
async function initParticles() {
    try {
        await tsParticles.load("tsparticles", particlesConfig);
        console.log("✅ Particles loaded");
    } catch (error) {
        console.error("Failed to load particles:", error);
    }
}

// Button handlers
function setupButtonHandlers() {
    // Add to Discord
    document.getElementById('add-btn')?.addEventListener('click', () => {
        window.open(CONFIG.botInviteUrl, '_blank');
    });

    // Dashboard / Login buttons
    document.getElementById('dashboard-btn')?.addEventListener('click', () => {
        window.location.href = CONFIG.oauthUrl;
    });

    document.getElementById('nav-login')?.addEventListener('click', () => {
        window.location.href = CONFIG.oauthUrl;
    });
}

// Check if already logged in
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/user', { credentials: 'include' });
        if (response.ok) {
            // Already logged in, redirect to dashboard
            window.location.href = '/dashboard.html';
        }
    } catch (error) {
        // Not logged in, stay on landing page
    }
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
    initParticles();
    setupButtonHandlers();
    checkAuth();
});
