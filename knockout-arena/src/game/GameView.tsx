import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Player, Room, InputVector } from '../types';
import { 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  PLAYER_RADIUS, 
  MAX_POWER, 
  PLANNING_TIME, 
  EXECUTION_TIME, 
  COUNTDOWN_TIME 
} from './constants';
import { updatePhysics } from './physics';
import { motion, AnimatePresence } from 'motion/react';
import { auth } from '../firebase';

interface GameViewProps {
  room: Room;
  players: Player[];
  myPlayer: Player | null;
  isMaster: boolean;
  onSubmitVector: (vector: InputVector) => void;
  onFinishRound: (finalPlayers: Player[]) => void;
}

export default function GameView({ 
  room, 
  players, 
  myPlayer, 
  isMaster, 
  onSubmitVector, 
  onFinishRound 
}: GameViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number, y: number } | null>(null);
  const [shake, setShake] = useState(0);
  
  const localPlayersRef = useRef<Player[]>([]);
  const lastTimeRef = useRef<number>(0);
  const executionTimerRef = useRef<number>(0);
  const submittedRef = useRef(false);
  
  // Initialize local players when phase changes to executing
  useEffect(() => {
    if (room.status === 'executing') {
      localPlayersRef.current = players.map(p => {
        const pCopy = { ...p };
        if (pCopy.inputVector) {
          const angle = pCopy.inputVector.angle;
          const power = pCopy.inputVector.power * MAX_POWER;
          pCopy.vx = Math.cos(angle) * power;
          pCopy.vy = Math.sin(angle) * power;
        }
        return pCopy;
      });
      executionTimerRef.current = EXECUTION_TIME;
      lastTimeRef.current = performance.now();
    } else if (room.status === 'planning') {
      submittedRef.current = false;
    }
  }, [room.status, players]);
  
  // Game Loop
  useEffect(() => {
    let animationFrameId: number;
    
    const loop = (time: number) => {
      const deltaTime = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Clear
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      
      // Draw Platform
      const halfSize = room.platformSize / 2;
      const centerX = GAME_WIDTH / 2;
      const centerY = GAME_HEIGHT / 2;
      
      ctx.fillStyle = '#2C3E50';
      ctx.fillRect(centerX - halfSize, centerY - halfSize, room.platformSize, room.platformSize);
      ctx.strokeStyle = '#34495E';
      ctx.lineWidth = 10;
      ctx.strokeRect(centerX - halfSize, centerY - halfSize, room.platformSize, room.platformSize);
      
      // Update and Draw Players
      const currentPlayers = room.status === 'executing' ? localPlayersRef.current : players;
      
      if (room.status === 'executing') {
        updatePhysics(localPlayersRef.current, room.platformSize);
        executionTimerRef.current -= deltaTime;
        
        if (executionTimerRef.current <= 0 && isMaster) {
          onFinishRound(localPlayersRef.current);
        }
      }
      
      for (const p of currentPlayers) {
        if (!p.isAlive) continue;
        
        // Draw Player
        ctx.save();
        if (shake > 0) {
          ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        }
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.stroke();
        
        // Draw front indicator
        const angle = p.vx !== 0 || p.vy !== 0 ? Math.atan2(p.vy, p.vx) : 0;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(angle) * PLAYER_RADIUS, p.y + Math.sin(angle) * PLAYER_RADIUS);
        ctx.lineTo(p.x + Math.cos(angle) * (PLAYER_RADIUS + 10), p.y + Math.sin(angle) * (PLAYER_RADIUS + 10));
        ctx.strokeStyle = 'white';
        ctx.stroke();
        
        // Draw Name
        ctx.fillStyle = 'white';
        ctx.font = 'bold 20px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${p.name}${p.isReady ? ' ✓' : ''}`, p.x, p.y - PLAYER_RADIUS - 10);
        
        ctx.restore();
      }
      
      // Draw Input Vector (Planning Phase)
      if (room.status === 'planning' && myPlayer && myPlayer.isAlive && dragStart && dragCurrent) {
        const dx = dragCurrent.x - dragStart.x;
        const dy = dragCurrent.y - dragStart.y;
        const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 200);
        const angle = Math.atan2(dy, dx);
        
        ctx.beginPath();
        ctx.setLineDash([10, 5]);
        ctx.moveTo(myPlayer.x, myPlayer.y);
        ctx.lineTo(myPlayer.x + Math.cos(angle) * dist, myPlayer.y + Math.sin(angle) * dist);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Arrow head
        ctx.beginPath();
        ctx.moveTo(myPlayer.x + Math.cos(angle) * dist, myPlayer.y + Math.sin(angle) * dist);
        ctx.lineTo(
          myPlayer.x + Math.cos(angle) * dist - Math.cos(angle - 0.5) * 20,
          myPlayer.y + Math.sin(angle) * dist - Math.sin(angle - 0.5) * 20
        );
        ctx.lineTo(
          myPlayer.x + Math.cos(angle) * dist - Math.cos(angle + 0.5) * 20,
          myPlayer.y + Math.sin(angle) * dist - Math.sin(angle + 0.5) * 20
        );
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.fill();
      }
      
      if (shake > 0) setShake(s => Math.max(0, s - 0.5));
      
      animationFrameId = requestAnimationFrame(loop);
    };
    
    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [room, players, myPlayer, dragStart, dragCurrent, shake, isMaster, onFinishRound]);
  
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    if (room.status !== 'planning' || !myPlayer || !myPlayer.isAlive || submittedRef.current) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    setDragStart({ x, y });
    setDragCurrent({ x, y });
  };
  
  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!dragStart) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;
    
    setDragCurrent({ x, y });
  };
  
  const handleTouchEnd = () => {
    if (!dragStart || !dragCurrent) return;
    
    const dx = dragCurrent.x - dragStart.x;
    const dy = dragCurrent.y - dragStart.y;
    const dist = Math.min(Math.sqrt(dx * dx + dy * dy), 200);
    const angle = Math.atan2(dy, dx);
    const power = dist / 200; // 0 to 1
    
    onSubmitVector({ angle, power });
    submittedRef.current = true;
    setDragStart(null);
    setDragCurrent(null);
  };

  const handleManualReady = () => {
    if (!dragStart || !dragCurrent) return;
    handleTouchEnd();
  };
  
  const timeLeft = Math.max(0, Math.ceil((room.timer - Date.now()) / 1000));
  
  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-900 overflow-hidden">
      {/* HUD */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none z-10">
        <div className="bg-black/50 backdrop-blur-md p-4 rounded-2xl border border-white/10">
          <h2 className="text-white font-bold text-lg">Round {room.roundCount + 1}</h2>
          <p className="text-white/70 text-sm">{players.filter(p => p.isAlive).length} Players Alive</p>
        </div>
        
        <div className="flex flex-col items-end gap-2">
          <div className="bg-black/50 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-center min-w-[100px]">
            <p className="text-white/50 text-xs uppercase tracking-widest font-bold">
              {room.status === 'planning' ? 'Planning' : room.status === 'executing' ? 'Launching' : 'Waiting'}
            </p>
            {room.status !== 'planning' && <p className="text-white text-3xl font-black">{timeLeft}s</p>}
            {room.status === 'planning' && (
              <p className="text-white text-3xl font-black">
                {players.filter(p => p.isAlive && p.isReady).length}/{players.filter(p => p.isAlive).length}
              </p>
            )}
          </div>
          
          {room.status === 'planning' && !submittedRef.current && myPlayer?.isAlive && (
            <div className="bg-orange-500 text-white px-4 py-2 rounded-full text-sm font-bold animate-pulse">
              Set Vector & Press Ready!
            </div>
          )}
          {submittedRef.current && (
            <div className="bg-green-500 text-white px-4 py-2 rounded-full text-sm font-bold">
              Ready!
            </div>
          )}
        </div>
      </div>
      
      {/* Canvas Container */}
      <div className="relative aspect-square w-full max-w-[90vh] max-h-[90vw] shadow-2xl border-4 border-white/10 rounded-lg overflow-hidden">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="w-full h-full touch-none"
          onMouseDown={handleTouchStart}
          onMouseMove={handleTouchMove}
          onMouseUp={handleTouchEnd}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
      </div>
      
      {/* Overlays */}
      <AnimatePresence>
        {room.status === 'counting_down' && (
          <motion.div 
            initial={{ opacity: 0, scale: 2 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-20"
          >
            <h1 className="text-white text-9xl font-black italic">{timeLeft}</h1>
          </motion.div>
        )}
        
        {room.status === 'planning' && myPlayer?.isAlive && !submittedRef.current && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
            <button
              onClick={handleTouchEnd}
              disabled={!dragStart || !dragCurrent}
              className="bg-green-500 text-white px-12 py-4 rounded-full font-black text-xl shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
            >
              READY
            </button>
          </div>
        )}
        
        {room.status === 'finished' && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-30 p-8 text-center"
          >
            <h1 className="text-white text-6xl font-black mb-4">GAME OVER</h1>
            <div className="bg-white/10 p-8 rounded-3xl border border-white/20 mb-8">
              <p className="text-white/60 uppercase tracking-widest font-bold mb-2">Winner</p>
              <h2 className="text-white text-4xl font-bold">
                {players.find(p => p.uid === room.winnerId)?.name || 'No One'}
              </h2>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="bg-white text-black px-12 py-4 rounded-full font-black text-xl hover:scale-105 transition-transform"
            >
              BACK TO LOBBY
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
