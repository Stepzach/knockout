import React, { useState, useEffect } from 'react';
import { auth, db } from '../firebase';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { LeaderboardEntry, Player } from '../types';
import { Trophy, Play, User, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We don't throw here to avoid crashing the whole app, but we log it
}

interface LobbyProps {
  onJoin: (name: string) => void;
  players: Player[];
  onStart: () => void;
  isMaster: boolean;
  isJoining: boolean;
}

export default function Lobby({ onJoin, players, onStart, isMaster, isJoining }: LobbyProps) {
  const [name, setName] = useState('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        await signInAnonymously(auth);
      }
      setUser(user);
      setIsAuthReady(true);
    });
    
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Subscribe to leaderboard
    const lbCol = collection(db, 'leaderboard');
    const q = query(lbCol, orderBy('wins', 'desc'), limit(10));
    const unsubscribeLb = onSnapshot(q, (snapshot) => {
      setLeaderboard(snapshot.docs.map(d => ({ ...d.data(), uid: d.id } as LeaderboardEntry)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'leaderboard');
    });
    
    return () => unsubscribeLb();
  }, [user]);
  
  const handleJoin = () => {
    if (name.trim()) {
      onJoin(name.trim());
    }
  };
  
  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col items-center justify-center p-4 overflow-hidden relative">
      {/* Background Accents */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] aspect-square bg-blue-500 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] aspect-square bg-purple-500 rounded-full blur-[120px]" />
      </div>
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md z-10"
      >
        <div className="text-center mb-12">
          <h1 className="text-7xl font-black italic tracking-tighter mb-2 text-transparent bg-clip-text bg-gradient-to-br from-white to-white/40">
            KNOCKOUT
          </h1>
          <p className="text-blue-400 font-bold uppercase tracking-[0.3em] text-xs">Arena Multiplayer</p>
        </div>
        
        <AnimatePresence mode="wait">
          {!isJoining ? (
            <motion.div 
              key="join"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="relative group">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-blue-400 transition-colors" size={20} />
                <input 
                  type="text" 
                  placeholder="ENTER DISPLAY NAME"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-5 pl-12 pr-6 text-xl font-bold focus:outline-none focus:border-blue-500/50 focus:bg-white/10 transition-all placeholder:text-white/20"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={handleJoin}
                  disabled={!name.trim()}
                  className="bg-white text-black py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-2 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                >
                  <Play size={24} fill="black" />
                  JOIN
                </button>
                <button 
                  onClick={() => setShowLeaderboard(true)}
                  className="bg-white/5 border border-white/10 py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-2 hover:bg-white/10 transition-all"
                >
                  <Trophy size={24} className="text-yellow-400" />
                  STATS
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="lobby"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
                    <Users size={20} />
                  </div>
                  <div>
                    <h2 className="font-black text-xl">LOBBY</h2>
                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest">{players.length} PLAYERS READY</p>
                  </div>
                </div>
                {players.length >= 2 && (
                  <button 
                    onClick={onStart}
                    className="bg-green-500 text-white px-6 py-3 rounded-xl font-black text-sm hover:scale-105 active:scale-95 transition-all shadow-lg shadow-green-500/20"
                  >
                    START GAME
                  </button>
                )}
              </div>
              
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {players.map((p, i) => (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={p.uid} 
                    className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full" style={{ backgroundColor: p.color }} />
                      <span className="font-bold">{p.name} {p.uid === auth.currentUser?.uid && '(YOU)'}</span>
                    </div>
                    {i === 0 && <span className="text-[10px] font-black bg-blue-500/20 text-blue-400 px-2 py-1 rounded-md uppercase">Master</span>}
                  </motion.div>
                ))}
              </div>
              
              {players.length < 2 && (
                <p className="text-center text-white/30 text-xs font-bold mt-6 animate-pulse">
                  WAITING FOR MORE PLAYERS...
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      
      {/* Leaderboard Modal */}
      <AnimatePresence>
        {showLeaderboard && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-slate-900 border border-white/10 rounded-[2.5rem] p-8 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />
              
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-black italic">LEADERBOARD</h2>
                <button 
                  onClick={() => setShowLeaderboard(false)}
                  className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-all font-bold"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-4">
                {leaderboard.length > 0 ? leaderboard.map((entry, i) => (
                  <div key={entry.uid} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-4">
                      <span className={`w-8 h-8 flex items-center justify-center font-black rounded-lg ${i === 0 ? 'bg-yellow-500 text-black' : i === 1 ? 'bg-slate-300 text-black' : i === 2 ? 'bg-amber-600 text-black' : 'bg-white/10 text-white/50'}`}>
                        {i + 1}
                      </span>
                      <span className="font-bold text-lg">{entry.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-blue-400">{entry.wins}</span>
                      <span className="text-[10px] font-black text-white/30 uppercase">Wins</span>
                    </div>
                  </div>
                )) : (
                  <p className="text-center text-white/30 py-12 font-bold italic">No legends yet...</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
