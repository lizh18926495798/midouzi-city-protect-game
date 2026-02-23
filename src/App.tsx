/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Target, Trophy, AlertTriangle, RefreshCw, Languages } from 'lucide-react';

// --- Types & Constants ---

type Language = 'en' | 'zh';

interface Point {
  x: number;
  y: number;
}

interface Entity extends Point {
  id: string;
}

interface Rocket extends Entity {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  speed: number;
  progress: number;
  hit?: boolean;
  isSplitter?: boolean;
}

interface Missile extends Entity {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  speed: number;
  progress: number;
}

interface Explosion extends Point {
  id: string;
  radius: number;
  maxRadius: number;
  growth: number; // 1 for growing, -1 for shrinking
}

interface City extends Point {
  id: string;
  alive: boolean;
}

interface Battery extends Point {
  id: string;
  ammo: number;
  maxAmmo: number;
  alive: boolean;
}

interface FloatingText extends Point {
  id: string;
  text: string;
  opacity: number;
  life: number;
}

const TARGET_SCORE = 1000;
const ROCKET_SCORE = 20;
const INITIAL_CITIES = 6;
const EXPLOSION_MAX_RADIUS = 50;
const EXPLOSION_SPEED = 1.0;
const MISSILE_SPEED = 0.06;
const ROCKET_SPEED_MIN = 0.00005;
const ROCKET_SPEED_MAX = 0.00015;
const ROCKET_RADIUS = 10;

// --- Sound Manager ---
const createSoundManager = () => {
  let audioCtx: AudioContext | null = null;

  const init = () => {
    if (!audioCtx) audioCtx = new AudioContext();
  };

  const playTone = (freq: number, type: OscillatorType, duration: number, volume: number) => {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  };

  return {
    init,
    playExplosion: () => playTone(150, 'sawtooth', 0.4, 0.2),
    playDamage: () => playTone(60, 'square', 0.5, 0.3),
  };
};

const soundManager = createSoundManager();

const TRANSLATIONS = {
  en: {
    title: "Nezuko Tower Defense",
    start: "Start Game",
    gameOver: "Game Over",
    victory: "Victory!",
    score: "Score",
    target: "Target",
    ammo: "Ammo",
    playAgain: "Play Again",
    allBatteriesDestroyed: "All batteries destroyed!",
    missionAccomplished: "Mission Accomplished: 1000 Points Reached",
    instructions: "Click to launch interceptor missiles. Protect the cities!",
  },
  zh: {
    title: "祢豆子塔防游戏",
    start: "开始游戏",
    gameOver: "游戏结束",
    victory: "胜利！",
    score: "得分",
    target: "目标",
    ammo: "弹药",
    playAgain: "再玩一次",
    allBatteriesDestroyed: "所有炮台已被摧毁！",
    missionAccomplished: "任务完成：达到1000分",
    instructions: "点击发射拦截导弹。保护城市！",
  }
};

// --- Game Logic ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lang, setLang] = useState<Language>('zh');
  const [gameState, setGameState] = useState<'menu' | 'playing' | 'gameOver' | 'victory'>('menu');
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [damageFlash, setDamageFlash] = useState(false);
  
  // Game state refs for the loop
  const scoreRef = useRef(0);
  const levelRef = useRef(1);
  const rocketsRef = useRef<Rocket[]>([]);
  const missilesRef = useRef<Missile[]>([]);
  const explosionsRef = useRef<Explosion[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const citiesRef = useRef<City[]>([]);
  const batteriesRef = useRef<Battery[]>([]);
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const requestRef = useRef<number>(0);

  const t = TRANSLATIONS[lang];

  // Initialize game entities
  const initGame = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // 6 Cities
    const cities: City[] = [];
    const citySpacing = width / 10;
    const cityStart = width / 2 - (citySpacing * 2.5);
    for (let i = 0; i < INITIAL_CITIES; i++) {
      cities.push({
        id: `city-${i}`,
        x: cityStart + i * citySpacing + (i >= 3 ? citySpacing : 0), // Gap for middle battery
        y: height - 40,
        alive: true
      });
    }
    citiesRef.current = cities;

    // 3 Batteries
    batteriesRef.current = [
      { id: 'bat-left', x: 40, y: height - 50, ammo: 40, maxAmmo: 40, alive: true },
      { id: 'bat-mid', x: width / 2, y: height - 50, ammo: 80, maxAmmo: 80, alive: true },
      { id: 'bat-right', x: width - 40, y: height - 50, ammo: 40, maxAmmo: 40, alive: true },
    ];

    rocketsRef.current = [];
    missilesRef.current = [];
    explosionsRef.current = [];
    floatingTextsRef.current = [];
    scoreRef.current = 0;
    levelRef.current = 1;
    setScore(0);
    setLevel(1);
    setDamageFlash(false);
    spawnTimerRef.current = 0;
  }, []);

  const spawnRocket = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Pick a target from alive cities or batteries
    const targets = [
      ...citiesRef.current.filter(c => c.alive),
      ...batteriesRef.current.filter(b => b.alive)
    ];
    
    if (targets.length === 0) return;
    
    const target = targets[Math.floor(Math.random() * targets.length)];
    const startX = Math.random() * width;
    
    rocketsRef.current.push({
      id: Math.random().toString(36).substr(2, 9),
      x: startX,
      y: 0,
      startX: startX,
      startY: 0,
      targetX: target.x,
      targetY: target.y,
      speed: ROCKET_SPEED_MIN + Math.random() * (ROCKET_SPEED_MAX - ROCKET_SPEED_MIN) * (1 + levelRef.current * 0.1),
      progress: 0
    });
  }, []);

  const fireMissile = (targetX: number, targetY: number) => {
    if (gameState !== 'playing') return;

    // Find all batteries that are alive and have ammo
    const candidates = batteriesRef.current.filter(b => b.alive && b.ammo > 0);
    
    if (candidates.length === 0) return;

    // Find the one closest to the target
    let bestBattery = candidates[0];
    let minDist = Infinity;

    for (const b of candidates) {
      const dist = Math.sqrt(Math.pow(b.x - targetX, 2) + Math.pow(b.y - targetY, 2));
      if (dist < minDist) {
        minDist = dist;
        bestBattery = b;
      }
    }

    if (bestBattery && bestBattery.ammo > 0) {
      bestBattery.ammo -= 1;
      missilesRef.current.push({
        id: Math.random().toString(36).substr(2, 9),
        x: bestBattery.x,
        y: bestBattery.y,
        startX: bestBattery.x,
        startY: bestBattery.y,
        targetX,
        targetY,
        speed: MISSILE_SPEED,
        progress: 0
      });
    }
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#fdf2f8'; // pink-50
    ctx.fillRect(0, 0, width, height);

    // Draw Background Decorations
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw "祢豆子"
    ctx.font = 'bold 80px "Inter", sans-serif';
    ctx.fillStyle = 'rgba(219, 39, 119, 0.1)'; // pink-600 with low opacity
    ctx.fillText('祢豆子', width / 2, height / 2);
    
    // Draw Stars and Hearts around the text
    const decorations = [
      { char: '⭐', x: -120, y: -60, size: 24 },
      { char: '❤', x: 120, y: -40, size: 22 },
      { char: '✨', x: -100, y: 60, size: 26 },
      { char: '💖', x: 100, y: 80, size: 24 },
      { char: '🌸', x: 0, y: -100, size: 28 },
      { char: '⭐', x: 180, y: 20, size: 20 },
      { char: '❤', x: -180, y: -10, size: 20 },
      { char: '✨', x: 50, y: 120, size: 22 },
      { char: '💖', x: -50, y: -130, size: 22 },
    ];
    
    decorations.forEach(d => {
      ctx.font = `${d.size}px serif`;
      ctx.globalAlpha = 0.15;
      ctx.fillText(d.char, width / 2 + d.x, height / 2 + d.y);
    });
    ctx.restore();

    // Draw Ground
    ctx.fillStyle = '#fbcfe8'; // pink-200
    ctx.fillRect(0, height - 30, width, 30);

    // Draw Cities
    citiesRef.current.forEach(c => {
      if (!c.alive) return;
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(c.x - 15, c.y - 10, 30, 10);
      ctx.fillRect(c.x - 10, c.y - 15, 20, 5);
    });

    // Draw Batteries
    batteriesRef.current.forEach(b => {
      if (!b.alive) {
        ctx.fillStyle = '#4b5563'; // gray-600
        ctx.beginPath();
        ctx.arc(b.x, b.y, 15, Math.PI, 0);
        ctx.fill();
        return;
      }
      ctx.fillStyle = '#10b981';
      // Base
      ctx.beginPath();
      ctx.arc(b.x, b.y, 20, Math.PI, 0);
      ctx.fill();
      // Ammo count text
      ctx.fillStyle = '#ef4444'; // Red
      ctx.font = 'bold 16px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(b.ammo.toString(), b.x, b.y + 15);
    });

    // Draw Rockets
    ctx.lineWidth = 1;
    rocketsRef.current.forEach(r => {
      ctx.strokeStyle = '#ef4444';
      ctx.beginPath();
      ctx.moveTo(r.x - (r.targetX - r.x) * 0.1, r.y - (r.targetY - r.y) * 0.1);
      ctx.lineTo(r.x, r.y);
      ctx.stroke();
      
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(r.x, r.y, ROCKET_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Floating Texts
    ctx.textAlign = 'center';
    floatingTextsRef.current.forEach(ft => {
      ctx.fillStyle = `rgba(16, 185, 129, ${ft.opacity})`;
      ctx.font = 'bold 14px font-sans';
      ctx.fillText(ft.text, ft.x, ft.y);
    });

    // Draw Missiles
    missilesRef.current.forEach(m => {
      ctx.strokeStyle = '#facc15';
      ctx.beginPath();
      ctx.moveTo(m.startX, m.startY);
      ctx.lineTo(m.x, m.y);
      ctx.stroke();
      
      // Draw target X
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m.targetX - 5, m.targetY - 5);
      ctx.lineTo(m.targetX + 5, m.targetY + 5);
      ctx.moveTo(m.targetX + 5, m.targetY - 5);
      ctx.lineTo(m.targetX - 5, m.targetY + 5);
      ctx.stroke();
    });

    // Draw Explosions
    explosionsRef.current.forEach(e => {
      const gradient = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.radius);
      gradient.addColorStop(0, 'white');
      gradient.addColorStop(0.4, '#fde047');
      gradient.addColorStop(0.7, '#f97316');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
      
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }, []);

  const update = useCallback((time: number) => {
    // Only continue if playing
    if (gameState !== 'playing') return;
    
    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    // Spawn rockets
    spawnTimerRef.current += deltaTime;
    const spawnInterval = Math.max(500, 2000 - levelRef.current * 100);
    if (spawnTimerRef.current > spawnInterval) {
      spawnRocket();
      spawnTimerRef.current = 0;
    }

    // Update Rockets
    rocketsRef.current.forEach(r => {
      r.progress += r.speed * deltaTime;
      r.x = r.startX + (r.targetX - r.startX) * r.progress;
      r.y = r.startY + (r.targetY - r.startY) * r.progress;
      
      // Check if reached target
      if (r.progress >= 1) {
        // Impact!
        soundManager.playDamage();
        setDamageFlash(true);
        setTimeout(() => setDamageFlash(false), 150);
        
        explosionsRef.current.push({
          id: `impact-${r.id}`,
          x: r.targetX,
          y: r.targetY,
          radius: 2,
          maxRadius: EXPLOSION_MAX_RADIUS,
          growth: 1
        });
        
        // Destroy target
        const city = citiesRef.current.find(c => c.x === r.targetX && c.y === r.targetY);
        if (city) city.alive = false;
        const battery = batteriesRef.current.find(b => b.x === r.targetX && b.y === r.targetY);
        if (battery) battery.alive = false;
      }
    });
    rocketsRef.current = rocketsRef.current.filter(r => r.progress < 1);

    // Update Missiles
    missilesRef.current.forEach(m => {
      m.progress += m.speed * (deltaTime / 16); // Normalize to 60fps
      if (m.progress >= 1) {
        explosionsRef.current.push({
          id: `exp-${m.id}`,
          x: m.targetX,
          y: m.targetY,
          radius: 2,
          maxRadius: EXPLOSION_MAX_RADIUS,
          growth: 1
        });
      } else {
        m.x = m.startX + (m.targetX - m.startX) * m.progress;
        m.y = m.startY + (m.targetY - m.startY) * m.progress;
      }
    });
    missilesRef.current = missilesRef.current.filter(m => m.progress < 1);

    // Update Explosions
    explosionsRef.current.forEach(e => {
      if (e.growth > 0) {
        e.radius += EXPLOSION_SPEED * (deltaTime / 16);
        if (e.radius >= e.maxRadius) e.growth = -1;
      } else {
        e.radius -= EXPLOSION_SPEED * (deltaTime / 16);
      }
      
      // Collision with rockets
      rocketsRef.current.forEach(r => {
        if (r.hit) return;
        const dist = Math.sqrt(Math.pow(r.x - e.x, 2) + Math.pow(r.y - e.y, 2));
        if (dist < e.radius + ROCKET_RADIUS) {
          r.hit = true;
          r.progress = 2; // Mark for removal
          soundManager.playExplosion();
          
          scoreRef.current += ROCKET_SCORE;
          setScore(scoreRef.current);
          if (scoreRef.current >= TARGET_SCORE) {
            setGameState('victory');
            return; // Stop processing this frame
          }
          
          // Add Good! text
          floatingTextsRef.current.push({
            id: Math.random().toString(),
            x: r.x,
            y: r.y,
            text: 'Good!',
            opacity: 1,
            life: 1000
          });

          // Chain explosion
          explosionsRef.current.push({
            id: `chain-${r.id}`,
            x: r.x,
            y: r.y,
            radius: 2,
            maxRadius: EXPLOSION_MAX_RADIUS * 0.8,
            growth: 1
          });
        }
      });
    });
    explosionsRef.current = explosionsRef.current.filter(e => e.radius > 0);
    rocketsRef.current = rocketsRef.current.filter(r => r.progress < 1.5);

    // Update Floating Texts
    floatingTextsRef.current.forEach(ft => {
      ft.life -= deltaTime;
      ft.y -= 0.5 * (deltaTime / 16);
      ft.opacity = ft.life / 1000;
    });
    floatingTextsRef.current = floatingTextsRef.current.filter(ft => ft.life > 0);

    // Check Game Over
    if (batteriesRef.current.every(b => !b.alive)) {
      setGameState('gameOver');
      return; // Stop processing this frame
    }

    // Level up every 200 points
    const newLevel = Math.floor(scoreRef.current / 200) + 1;
    if (newLevel > levelRef.current) {
      levelRef.current = newLevel;
      setLevel(newLevel);
    }

    draw();
    requestRef.current = requestAnimationFrame(update);
  }, [gameState, spawnRocket, draw]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        if (gameState === 'menu') {
          initGame();
        }
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    if (gameState === 'playing') {
      requestRef.current = requestAnimationFrame(update);
    } else {
      draw(); // Draw static frame for other states
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(requestRef.current);
    };
  }, [gameState, initGame, update, draw]);

  const startGame = () => {
    soundManager.init();
    initGame();
    setGameState('playing');
    lastTimeRef.current = performance.now();
  };

  return (
    <div className="relative w-full h-screen font-sans bg-pink-50 overflow-hidden">
      {/* Damage Flash Overlay */}
      <AnimatePresence>
        {damageFlash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 pointer-events-none z-40 border-[40px] border-red-500/60 shadow-[inset_0_0_150px_rgba(239,68,68,0.7)]"
          />
        )}
      </AnimatePresence>

      {/* Game Canvas */}
      <canvas
        ref={canvasRef}
        style={{ cursor: 'url(\'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><line x1="10" y1="0" x2="10" y2="20" stroke="black" stroke-width="2"/><line x1="0" y1="10" x2="20" y2="10" stroke="black" stroke-width="2"/></svg>\') 10 10, crosshair' }}
        className="block w-full h-full"
        onClick={(e) => fireMissile(e.clientX, e.clientY)}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          fireMissile(touch.clientX, touch.clientY);
        }}
      />

      {/* UI Overlay: Stats */}
      {gameState === 'playing' && (
        <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
          <div className="flex flex-col gap-2">
            <div className="bg-white/80 backdrop-blur-md border border-pink-200 p-4 rounded-2xl shadow-xl flex items-center gap-4">
              <div className="p-2 bg-pink-500/20 rounded-lg">
                <Trophy className="w-5 h-5 text-pink-600" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-pink-600 font-bold">{t.score}</p>
                <p className="text-2xl font-mono font-bold text-pink-950 leading-none">{score.toString().padStart(4, '0')}</p>
              </div>
            </div>
            <div className="bg-white/80 backdrop-blur-md border border-pink-200 p-4 rounded-2xl shadow-xl flex items-center gap-4">
              <div className="p-2 bg-emerald-500/20 rounded-lg">
                <Target className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-pink-600 font-bold">{t.target}</p>
                <p className="text-2xl font-mono font-bold text-pink-950 leading-none">{TARGET_SCORE}</p>
              </div>
            </div>
          </div>

          <button 
            onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')}
            className="pointer-events-auto p-3 bg-white/80 backdrop-blur-md border border-pink-200 rounded-full hover:bg-white transition-colors shadow-lg"
          >
            <Languages className="w-5 h-5 text-pink-600" />
          </button>
        </div>
      )}

      {/* Screens */}
      <AnimatePresence>
        {gameState !== 'playing' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-pink-900/40 backdrop-blur-sm flex items-center justify-center p-6 z-50"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-white border border-pink-100 p-8 rounded-[32px] shadow-2xl text-center"
            >
              {gameState === 'menu' && (
                <>
                  <h1 className="text-4xl font-bold mb-2 tracking-tight text-pink-950">{t.title}</h1>
                  <p className="text-pink-700 mb-8 text-sm leading-relaxed">{t.instructions}</p>
                  <button
                    onClick={startGame}
                    className="w-full py-4 bg-pink-600 hover:bg-pink-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-pink-600/20 flex items-center justify-center gap-2"
                  >
                    <Shield className="w-5 h-5" />
                    {t.start}
                  </button>
                </>
              )}

              {gameState === 'gameOver' && (
                <>
                  <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <AlertTriangle className="w-10 h-10 text-red-500" />
                  </div>
                  <h2 className="text-3xl font-bold mb-2 text-pink-950">{t.gameOver}</h2>
                  <p className="text-pink-700 mb-8 text-sm">{t.allBatteriesDestroyed}</p>
                  <div className="bg-pink-50 p-4 rounded-2xl mb-8 border border-pink-100">
                    <p className="text-xs text-pink-500 uppercase tracking-widest mb-1">{t.score}</p>
                    <p className="text-4xl font-mono font-bold text-pink-950">{score}</p>
                  </div>
                  <button
                    onClick={startGame}
                    className="w-full py-4 bg-pink-950 hover:bg-pink-900 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-5 h-5" />
                    {t.playAgain}
                  </button>
                </>
              )}

              {gameState === 'victory' && (
                <>
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Trophy className="w-10 h-10 text-emerald-500" />
                  </div>
                  <h2 className="text-3xl font-bold mb-2 text-pink-950">{t.victory}</h2>
                  <p className="text-pink-700 mb-8 text-sm">{t.missionAccomplished}</p>
                  <div className="bg-pink-50 p-4 rounded-2xl mb-8 border border-pink-100">
                    <p className="text-xs text-pink-500 uppercase tracking-widest mb-1">{t.score}</p>
                    <p className="text-4xl font-mono font-bold text-pink-950">{score}</p>
                  </div>
                  <button
                    onClick={startGame}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-5 h-5" />
                    {t.playAgain}
                  </button>
                </>
              )}

              <button 
                onClick={() => setLang(l => l === 'en' ? 'zh' : 'en')}
                className="mt-6 text-pink-500 hover:text-pink-700 text-xs font-medium flex items-center justify-center gap-2 mx-auto"
              >
                <Languages className="w-4 h-4" />
                {lang === 'en' ? '切换到中文' : 'Switch to English'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Hint */}
      <div className="absolute bottom-10 left-0 right-0 text-center pointer-events-none sm:hidden">
        <p className="text-[10px] text-pink-400 uppercase tracking-[0.2em]">Tap to defend</p>
      </div>
    </div>
  );
}
