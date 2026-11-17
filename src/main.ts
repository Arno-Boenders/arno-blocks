import './style.css';
import { experience, projects } from './data';
import { onSheet, openRef, showSection } from './ui';

// ---- Blocks and textures -------------------------------------------------

const T = { Air: 0, Grass: 1, Dirt: 2, Stone: 3, Bedrock: 4, Log: 5, Leaves: 6, Ore: 7, Sign: 8, Chest: 9 } as const;
type Block = (typeof T)[keyof typeof T];
const HARDNESS: Partial<Record<Block, number>> = { [T.Grass]: 0.45, [T.Dirt]: 0.4, [T.Stone]: 0.85, [T.Log]: 0.75, [T.Leaves]: 0.2, [T.Ore]: 1.1 };

interface OreDef { ref: string; label: string; color: string }
// Newest work first: it ends up closest to the surface.
const ORES: OreDef[] = [
    { ref: 'job:0', label: experience[0].company, color: experience[0].color },
    ...projects.slice(0, 3).map((p) => ({ ref: `project:${p.slug}`, label: p.title, color: p.color })),
    { ref: 'job:1', label: experience[1].company, color: experience[1].color },
    ...projects.slice(3).map((p) => ({ ref: `project:${p.slug}`, label: p.title, color: p.color })),
];

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = <E extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as E;

function mulberry32(seed: number) {
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const tone = (hex: string, f: number) => {
    const n = parseInt(hex.slice(1), 16);
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

// Every texture is a 16×16 canvas painted from a seed, then scaled up without smoothing.
type Set = (x: number, y: number, color: string) => void;
function texture(seed: number, paint: (set: Set, rnd: () => number) => void) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const g = canvas.getContext('2d')!;
    paint((x, y, color) => { g.fillStyle = color; g.fillRect(x, y, 1, 1); }, mulberry32(seed));
    return canvas;
}
const each = (fn: (x: number, y: number) => void) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) fn(x, y); };

const paintDirt = (set: Set, rnd: () => number) => {
    each((x, y) => set(x, y, tone('#7b5537', 0.8 + rnd() * 0.32)));
    for (let i = 0; i < 10; i++) set((rnd() * 16) | 0, (rnd() * 16) | 0, tone('#5a3c25', 0.9 + rnd() * 0.2));
};
const paintStone = (set: Set, rnd: () => number) => {
    each((x, y) => set(x, y, tone('#848484', 0.84 + rnd() * 0.28)));
    for (let i = 0; i < 7; i++) {
        const x = (rnd() * 15) | 0, y = (rnd() * 16) | 0;
        set(x, y, tone('#686868', 0.9 + rnd() * 0.2)); set(x + 1, y, tone('#686868', 0.9 + rnd() * 0.2));
    }
};

const TEX = {
    dirt: texture(1, paintDirt),
    grass: texture(2, (set, rnd) => {
        paintDirt(set, rnd);
        for (let x = 0; x < 16; x++) {
            const depth = 3 + (rnd() < 0.5 ? 1 : 0) + (rnd() < 0.2 ? 1 : 0);
            for (let y = 0; y < depth; y++) set(x, y, tone('#5e9d3b', 0.8 + rnd() * 0.34));
        }
    }),
    stone: texture(3, paintStone),
    bedrock: texture(4, (set, rnd) => each((x, y) => set(x, y, rnd() < 0.5 ? tone('#3b3b3b', 0.5 + rnd() * 0.6) : tone('#5c5c5c', 0.7 + rnd() * 0.4)))),
    log: texture(5, (set, rnd) => each((x, y) => set(x, y, x % 4 === 0 || (x % 4 === 2 && rnd() < 0.3) ? tone('#4a3520', 0.85 + rnd() * 0.3) : tone('#6d5033', 0.85 + rnd() * 0.3)))),
    leaves: texture(6, (set, rnd) => each((x, y) => set(x, y, rnd() < 0.18 ? tone('#23501a', 0.8 + rnd() * 0.3) : tone('#3e7f2b', 0.75 + rnd() * 0.4)))),
    sign: texture(7, (set, rnd) => {
        for (let y = 2; y <= 9; y++) for (let x = 1; x <= 14; x++) {
            const edge = y === 2 || y === 9 || x === 1 || x === 14;
            set(x, y, edge ? '#6b4b25' : tone('#a97d45', 0.88 + rnd() * 0.2));
        }
        for (const y of [4, 6, 7]) for (let x = 3; x <= 12; x++) if (rnd() < 0.72) set(x, y, '#3d2a14');
        for (let y = 10; y <= 15; y++) { set(7, y, '#6b4b25'); set(8, y, '#5a3e1e'); }
    }),
    chest: texture(8, (set, rnd) => {
        for (let y = 3; y <= 15; y++) for (let x = 1; x <= 14; x++) {
            const edge = y === 3 || y === 15 || x === 1 || x === 14 || y === 8;
            set(x, y, edge ? '#3f2810' : tone('#9a6630', 0.86 + rnd() * 0.2));
        }
        for (let y = 7; y <= 10; y++) for (let x = 7; x <= 8; x++) set(x, y, y === 7 ? '#fff1b0' : '#d9b84e');
    }),
};

const oreTextures = new Map<string, HTMLCanvasElement>();
function oreTexture(color: string) {
    let tex = oreTextures.get(color);
    if (!tex) {
        tex = texture(parseInt(color.slice(1), 16), (set, rnd) => {
            paintStone(set, rnd);
            // Six bold clusters with a dark rim and a bright centre, so ore stands out from plain stone.
            for (let k = 0; k < 6; k++) {
                const cx = 1 + ((rnd() * 12) | 0), cy = 1 + ((rnd() * 12) | 0);
                for (const [dx, dy] of [[-1, 0], [2, 0], [0, -1], [1, -1], [0, 2], [1, 2]]) if (rnd() < 0.7) set(cx + dx, cy + dy, tone(color, 0.45));
                for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) set(cx + dx, cy + dy, tone(color, 0.85 + rnd() * 0.3));
                set(cx, cy, tone(color, 1.5));
            }
        });
        oreTextures.set(color, tex);
    }
    return tex;
}

// Crack overlay: a fixed list of pixels, revealed in ten stages while a block is being mined.
const CRACK: [number, number][] = [];
{
    const rnd = mulberry32(99);
    for (let s = 0; s < 6; s++) {
        let x = 6 + ((rnd() * 4) | 0), y = 6 + ((rnd() * 4) | 0);
        for (let step = 0; step < 9; step++) {
            CRACK.push([x, y]);
            x = Math.max(0, Math.min(15, x + ((rnd() * 3) | 0) - 1));
            y = Math.max(0, Math.min(15, y + ((rnd() * 3) | 0) - 1));
        }
    }
}

// Random pixel colours of a texture, for break particles.
const palettes = new Map<HTMLCanvasElement, string[]>();
function sample(tex: HTMLCanvasElement) {
    let colors = palettes.get(tex);
    if (!colors) {
        const data = tex.getContext('2d')!.getImageData(0, 0, 16, 16).data;
        colors = [];
        for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 0) colors.push(`rgb(${data[i]},${data[i + 1]},${data[i + 2]})`);
        palettes.set(tex, colors);
    }
    return colors[(Math.random() * colors.length) | 0];
}

// ---- World ---------------------------------------------------------------

const canvas = $<HTMLCanvasElement>('#world');
const ctx = canvas.getContext('2d')!;
let W = 0, H = 0, B = 48, cols = 0, rows = 0, top = 4;
let grid = new Uint8Array(0);
let surface: number[] = [];
const oreAt = new Map<number, OreDef>();
let signCell = 0;
let clouds: { x: number; y: number; w: number }[] = [];
let stars: { x: number; y: number }[] = [];

const idx = (c: number, r: number) => r * cols + c;
const inside = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;
const colOf = (i: number) => i % cols, rowOf = (i: number) => Math.floor(i / cols);

function build() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    B = Math.max(32, Math.min(64, Math.floor(Math.min(W / 22, H / 14))));
    cols = Math.ceil(W / B); rows = Math.ceil(H / B);
    top = Math.max(3, Math.round(rows * 0.3));
    grid = new Uint8Array(cols * rows);
    oreAt.clear();
    const rnd = mulberry32(7);

    surface = Array.from({ length: cols }, (_, c) => top + Math.round(Math.sin(c * 0.31) * 0.9 + Math.sin(c * 0.11 + 2) * 0.8));
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            const s = surface[c];
            grid[idx(c, r)] = r < s ? T.Air : r === s ? T.Grass : r < s + 3 ? T.Dirt
                : r >= rows - 1 || (r === rows - 2 && rnd() < 0.35) ? T.Bedrock : T.Stone;
        }
    }

    // Landmarks on the surface: a sign (about me), a chest (contact and CV) and two trees.
    const signC = Math.max(1, Math.round(cols * 0.1));
    signCell = idx(signC, surface[signC] - 1);
    grid[signCell] = T.Sign;
    const chestC = Math.min(cols - 1, signC + 2);
    grid[idx(chestC, surface[chestC] - 1)] = T.Chest;
    for (const tc of [Math.round(cols * 0.46), Math.round(cols * 0.82)]) {
        if (tc <= chestC + 2 || tc >= cols - 1) continue;
        const ground = surface[tc], crown = ground - 3;
        if (crown - 2 < 0) continue;   // no room for the crown under the top of the screen
        for (let h = 1; h <= 3; h++) if (inside(tc, ground - h)) grid[idx(tc, ground - h)] = T.Log;
        for (let dy = -2; dy <= 0; dy++) for (let dx = -2; dx <= 2; dx++) {
            if (Math.abs(dx) === 2 && dy === -2) continue;
            const c = tc + dx, r = crown + dy;
            if (inside(c, r) && grid[idx(c, r)] === T.Air) grid[idx(c, r)] = T.Leaves;
        }
        for (let dx = -1; dx <= 1; dx++) if (inside(tc + dx, crown - 3)) grid[idx(tc + dx, crown - 3)] = T.Leaves;
    }

    // Ores: spread across the width in a shuffled order, deeper for older work.
    const slots = ORES.map((_, i) => Math.min(cols - 1, Math.round(((i + 0.5) * cols) / ORES.length)));
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    ORES.forEach((ore, i) => {
        const c = slots[i];
        const shallow = surface[c] + 3, deep = Math.max(shallow, rows - 3);
        const r = Math.round(shallow + (i / Math.max(1, ORES.length - 1)) * (deep - shallow));
        grid[idx(c, r)] = T.Ore;
        oreAt.set(idx(c, r), ore);
    });

    clouds = Array.from({ length: Math.max(3, Math.round(cols / 6)) }, () => ({ x: rnd() * W, y: (0.3 + rnd() * Math.max(0.5, top - 2.8)) * B, w: 3 + Math.floor(rnd() * 4) }));
    stars = Array.from({ length: 70 }, () => ({ x: rnd() * W, y: rnd() * top * B }));
    placeHint();
}

let resizeTimer = 0;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(build, 200); });

// ---- Player state --------------------------------------------------------

const store = {
    get<V>(key: string, fallback: V): V { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as V : fallback; } catch { return fallback; } },
    set(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
};
const found = new Set<string>(store.get<string[]>('arno-blocks-found', []).filter((r) => ORES.some((o) => o.ref === r)));

const HOTBAR = [
    { key: 'dirt', label: 'Dirt', block: T.Dirt as Block, tex: TEX.dirt },
    { key: 'stone', label: 'Stone', block: T.Stone as Block, tex: TEX.stone },
    { key: 'wood', label: 'Wood', block: T.Log as Block, tex: TEX.log },
    { key: 'leaves', label: 'Leaves', block: T.Leaves as Block, tex: TEX.leaves },
];
const inventory: Record<string, number> = { dirt: 0, stone: 0, wood: 0, leaves: 0 };
let selected = 0;

let hover: number | null = null;
let mining = false, target: number | null = null, progress = 0, paused = false;
let night = matchMedia('(prefers-color-scheme: dark)').matches;
let pointer = { x: 0, y: 0 };

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }
const particles: Particle[] = [];

function texFor(i: number, t: number) {
    switch (t) {
        case T.Grass: return TEX.grass;
        case T.Dirt: return TEX.dirt;
        case T.Stone: return TEX.stone;
        case T.Bedrock: return TEX.bedrock;
        case T.Log: return TEX.log;
        case T.Leaves: return TEX.leaves;
        case T.Sign: return TEX.sign;
        case T.Chest: return TEX.chest;
        case T.Ore: return oreTexture(oreAt.get(i)?.color ?? '#ffffff');
        default: return null;
    }
}

const passable = (t: number) => t === T.Air || t === T.Sign || t === T.Chest;

/** A block can be mined when one of its sides is open, so you dig down from the surface. */
function minable(i: number) {
    const t = grid[i];
    if (passable(t) || t === T.Bedrock) return false;
    const c = colOf(i), r = rowOf(i);
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const cc = c + dx, rr = r + dy;
        return inside(cc, rr) ? passable(grid[idx(cc, rr)]) : rr < 0;
    });
}

function cellAt(x: number, y: number) {
    const c = Math.floor(x / B), r = Math.floor(y / B);
    return inside(c, r) ? idx(c, r) : null;
}

function burst(i: number, tex: HTMLCanvasElement, count = 14) {
    const cx = (colOf(i) + 0.5) * B, cy = (rowOf(i) + 0.5) * B;
    for (let k = 0; k < count; k++) {
        particles.push({
            x: cx + (Math.random() - 0.5) * B * 0.6, y: cy + (Math.random() - 0.5) * B * 0.6,
            vx: (Math.random() - 0.5) * 220, vy: -60 - Math.random() * 220,
            life: 0.5 + Math.random() * 0.5, color: sample(tex), size: B / 8 + Math.random() * (B / 10),
        });
    }
}

function breakAt(i: number) {
    const t = grid[i];
    const tex = texFor(i, t);
    if (tex) burst(i, tex);
    grid[i] = T.Air;
    if (t === T.Grass || t === T.Dirt) inventory.dirt++;
    else if (t === T.Stone) inventory.stone++;
    else if (t === T.Log) inventory.wood++;
    else if (t === T.Leaves && Math.random() < 0.5) inventory.leaves++;
    else if (t === T.Ore) {
        const ore = oreAt.get(i)!;
        oreAt.delete(i);
        discover(ore);
    }
    renderHotbar();
    dismissHint();
}

function discover(ore: OreDef) {
    const first = !found.has(ore.ref);
    found.add(ore.ref);
    store.set('arno-blocks-found', [...found]);
    renderCollection(ore.ref);
    toast(first ? `Found ${ore.label}` : ore.label, ore.ref, ore.color);
    setTimeout(() => openRef(ore.ref), reduce ? 0 : 450);
    if (first && found.size === ORES.length) {
        setTimeout(() => toast('You dug up everything. My contact details are in the chest.', 'section:contact', '#2ec27e'), 1200);
    }
}

function place(i: number) {
    if (grid[i] !== T.Air) return;
    const c = colOf(i), r = rowOf(i);
    const touching = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(c + dx, r + dy) && !passable(grid[idx(c + dx, r + dy)]));
    const slot = HOTBAR[selected];
    if (!touching) return;
    if (inventory[slot.key] <= 0) { toast(`No ${slot.label.toLowerCase()} yet. Mine some first.`, undefined, '#a3abbb'); return; }
    grid[i] = slot.block;
    inventory[slot.key]--;
    renderHotbar();
}

// ---- Input ---------------------------------------------------------------

canvas.addEventListener('pointerdown', (e) => {
    if (paused) return;
    pointer = { x: e.clientX, y: e.clientY };
    const i = cellAt(e.clientX, e.clientY);
    if (i === null) return;
    if (e.button === 2) { place(i); return; }
    if (grid[i] === T.Sign) { dismissHint(); showSection('about'); return; }
    if (grid[i] === T.Chest) { dismissHint(); showSection('contact'); return; }
    canvas.setPointerCapture(e.pointerId);
    mining = true; target = i; progress = 0;
});
canvas.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    hover = cellAt(e.clientX, e.clientY);
    if (mining && hover !== target) { target = hover; progress = 0; }
    renderTip();
});
const stop = () => { mining = false; target = null; progress = 0; };
canvas.addEventListener('pointerup', stop);
canvas.addEventListener('pointercancel', stop);
canvas.addEventListener('pointerleave', () => { stop(); hover = null; renderTip(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { selected = (selected + (e.deltaY > 0 ? 1 : HOTBAR.length - 1)) % HOTBAR.length; renderHotbar(); }, { passive: true });
addEventListener('keydown', (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= HOTBAR.length) { selected = n - 1; renderHotbar(); }
});
onSheet((open) => { paused = open; stop(); });

$('#daynight').addEventListener('click', () => { night = !night; renderDayNight(); });
$('#help').addEventListener('click', () => { $('#hint').hidden = false; placeHint(); });
$('#hint-close').addEventListener('click', dismissHint);

// ---- HUD -----------------------------------------------------------------

const icon = (tex: HTMLCanvasElement) => tex.toDataURL();

function renderHotbar() {
    $('#hotbar').innerHTML = HOTBAR.map((s, i) => `
        <button type="button" class="slot${i === selected ? ' on' : ''}" data-slot="${i}" aria-label="${s.label}, ${inventory[s.key]}" aria-pressed="${i === selected}">
            <img src="${icon(s.tex)}" alt=""><b>${inventory[s.key] || ''}</b><small>${i + 1}</small>
        </button>`).join('');
}
$('#hotbar').addEventListener('click', (e) => {
    const slot = (e.target as Element).closest<HTMLElement>('[data-slot]');
    if (slot) { selected = Number(slot.dataset.slot); renderHotbar(); }
});

// Found items show the picture from their card; jobs (no picture) show their initial in their colour.
const pictures = new Map(projects.map((p) => [`project:${p.slug}`, p]));
function renderCollection(fresh?: string) {
    $('#collection').innerHTML = ORES.map((o) => {
        if (!found.has(o.ref)) return `<span class="slot" title="Still buried"><b aria-hidden="true">?</b><span class="sr">Still buried</span></span>`;
        const p = pictures.get(o.ref);
        const face = p?.image ? `<img class="photo" src="${p.image}" alt="" style="object-position:${p.position ?? '50% 0%'}">` : `<b class="initial">${o.label[0]}</b>`;
        return `<button type="button" class="slot found${o.ref === fresh ? ' fresh' : ''}" data-open="${o.ref}" title="${o.label}" aria-label="${o.label}" style="--c:${o.color}">${face}</button>`;
    }).join('');
    $('#found-count').textContent = `${found.size}/${ORES.length}`;
}
function renderTip() {
    const tip = $('#tip');
    const i = hover;
    let text = '';
    if (i !== null) {
        const t = grid[i];
        if (t === T.Ore) text = `${oreAt.get(i)?.label ?? ''} · ${minable(i) ? 'hold to mine' : 'dig down to reach it'}`;
        else if (t === T.Sign) text = 'Sign · click to read';
        else if (t === T.Chest) text = 'Chest · click to open';
        else if (t === T.Bedrock) text = 'Bedrock · too hard to mine';
    }
    tip.hidden = !text;
    if (text) {
        tip.textContent = text;
        tip.style.translate = `${Math.min(pointer.x + 16, W - tip.offsetWidth - 8)}px ${pointer.y + 18}px`;
    }
}

function toast(text: string, ref: string | undefined, color: string) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.setProperty('--c', color);
    el.innerHTML = `<i aria-hidden="true"></i><span>${text}</span>${ref ? `<button type="button" data-open="${ref}">Open</button>` : ''}`;
    $('#toasts').append(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3600);
}

function placeHint() {
    const hint = $('#hint');
    if (hint.hidden || !cols) return;
    const x = (colOf(signCell) + 0.5) * B, y = rowOf(signCell) * B - 8;
    hint.style.left = `${Math.max(12, Math.min(W - hint.offsetWidth - 12, x - 28))}px`;
    hint.style.top = `${Math.max(64, y - hint.offsetHeight)}px`;
}
function dismissHint() {
    if ($('#hint').hidden) return;
    $('#hint').hidden = true;
    store.set('arno-blocks-hint-seen', true);
}

function renderDayNight() {
    document.documentElement.dataset.time = night ? 'night' : 'day';
    $('#daynight').setAttribute('aria-label', night ? 'Switch to day' : 'Switch to night');
}

// ---- Loop ----------------------------------------------------------------

function update(dt: number) {
    if (mining && target !== null && !paused) {
        const t = grid[target] as Block;
        if (minable(target)) {
            progress += dt / (HARDNESS[t] ?? 1);
            if (progress >= 1) { breakAt(target); progress = 0; renderTip(); }
        } else progress = 0;
    }
    for (const p of particles) { p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
    for (const c of clouds) { c.x += 8 * (B / 48) * dt; if (c.x > W + B) c.x = -c.w * B; }
}

function draw(now: number) {
    ctx.imageSmoothingEnabled = false;
    const sky = ctx.createLinearGradient(0, 0, 0, (top + 2) * B);
    sky.addColorStop(0, night ? '#070b1f' : '#6fb2ff');
    sky.addColorStop(1, night ? '#1b2552' : '#cfe8ff');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    if (night) {
        stars.forEach((s, i) => {
            ctx.fillStyle = `rgba(255,255,255,${0.45 + 0.4 * Math.sin(now / 700 + i)})`;
            ctx.fillRect(s.x, s.y, 2, 2);
        });
    }
    const orbX = W * 0.8, orbY = B * 0.9, orb = B * 1.3;
    if (night) {
        ctx.fillStyle = '#e9ecf5'; ctx.fillRect(orbX, orbY, orb, orb);
        ctx.fillStyle = '#c4c9d8'; ctx.fillRect(orbX + orb * 0.2, orbY + orb * 0.25, orb * 0.22, orb * 0.22); ctx.fillRect(orbX + orb * 0.6, orbY + orb * 0.55, orb * 0.18, orb * 0.18);
    } else {
        ctx.fillStyle = 'rgba(255,224,102,.35)'; ctx.fillRect(orbX - orb * 0.25, orbY - orb * 0.25, orb * 1.5, orb * 1.5);
        ctx.fillStyle = '#fff3a3'; ctx.fillRect(orbX, orbY, orb, orb);
    }
    ctx.fillStyle = night ? 'rgba(190,200,255,.16)' : 'rgba(255,255,255,.92)';
    for (const c of clouds) {
        ctx.fillRect(c.x, c.y, c.w * B, B * 0.5);
        ctx.fillRect(c.x + B * 0.5, c.y - B * 0.25, (c.w - 1.5) * B, B * 0.3);
    }

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const i = idx(c, r), t = grid[i], x = c * B, y = r * B;
            if (passable(t) && r > surface[c]) {
                // A dug-out space shows a dark wall behind it, so holes read as caves.
                ctx.drawImage(r <= surface[c] + 2 ? TEX.dirt : TEX.stone, x, y, B, B);
                ctx.fillStyle = 'rgba(8,10,16,.62)';
                ctx.fillRect(x, y, B, B);
            }
            const tex = texFor(i, t);
            if (tex) ctx.drawImage(tex, x, y, B, B);
            if (t === T.Ore) {
                // A slow glint so ores catch the eye.
                const a = Math.max(0, Math.sin(now / 520 + i));
                ctx.fillStyle = `rgba(255,255,255,${a * 0.75})`;
                const g = B / 16;
                ctx.fillRect(x + g * (3 + (i % 9)), y + g * (3 + ((i >> 3) % 9)), g, g);
            }
        }
    }
    const depth = ctx.createLinearGradient(0, (top + 3) * B, 0, H);
    depth.addColorStop(0, 'rgba(0,0,0,0)');
    depth.addColorStop(1, 'rgba(0,0,0,.38)');
    ctx.fillStyle = depth;
    ctx.fillRect(0, (top + 3) * B, W, H);
    if (night) { ctx.fillStyle = 'rgba(10,16,40,.32)'; ctx.fillRect(0, 0, W, H); }

    if (hover !== null && !paused) {
        const t = grid[hover];
        const active = minable(hover) || t === T.Sign || t === T.Chest;
        ctx.lineWidth = 2;
        ctx.strokeStyle = active ? 'rgba(255,255,255,.95)' : 'rgba(0,0,0,.45)';
        ctx.strokeRect(colOf(hover) * B + 1, rowOf(hover) * B + 1, B - 2, B - 2);
    }
    if (mining && target !== null && progress > 0) {
        const shown = Math.ceil(((Math.min(9, Math.floor(progress * 10)) + 1) / 10) * CRACK.length);
        const g = B / 16, x = colOf(target) * B, y = rowOf(target) * B;
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        for (const [px, py] of CRACK.slice(0, shown)) ctx.fillRect(x + px * g, y + py * g, Math.ceil(g), Math.ceil(g));
    }
    for (const p of particles) {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
}

let last = performance.now();
function frame(now: number) {
    update(Math.min((now - last) / 1000, 1 / 30));
    last = now;
    draw(now);
    requestAnimationFrame(frame);
}

if (store.get('arno-blocks-hint-seen', false)) $('#hint').hidden = true;
build();
renderHotbar();
renderCollection();
renderDayNight();
requestAnimationFrame(frame);

// Handle for checking the world from the browser console while developing. Not included in production builds.
if (import.meta.env.DEV) Object.assign(window, { __blocks: { get grid() { return grid; }, get cols() { return cols; }, get B() { return B; }, oreAt } });
