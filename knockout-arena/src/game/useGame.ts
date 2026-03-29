import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  deleteDoc,
  serverTimestamp,
  increment,
  getDoc
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Player, Room, GameStatus, InputVector } from '../types';
import { 
  GAME_WIDTH, 
  GAME_HEIGHT, 
  PLANNING_TIME, 
  COUNTDOWN_TIME, 
  EXECUTION_TIME, 
  SHRINK_FACTOR, 
  INITIAL_PLATFORM_SIZE,
  MIN_PLAYERS,
  MAX_POWER,
  COLORS
} from './constants';
import { updatePhysics } from './physics';

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
}

export function useGame(roomId: string | null, playerName: string) {
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayer, setMyPlayer] = useState<Player | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const playersRef = useRef<Player[]>([]);
  const roomRef = useRef<Room | null>(null);
  
  useEffect(() => {
    if (!roomId || !auth.currentUser) return;
    
    const roomDoc = doc(db, 'rooms', roomId);
    const playersCol = collection(db, 'rooms', roomId, 'players');
    
    // Subscribe to room
    const unsubscribeRoom = onSnapshot(roomDoc, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as Room;
        setRoom({ ...data, id: snapshot.id });
        roomRef.current = { ...data, id: snapshot.id };
      } else {
        setError('Room not found');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`);
    });
    
    // Subscribe to players
    const unsubscribePlayers = onSnapshot(playersCol, (snapshot) => {
      const pList = snapshot.docs.map(d => ({ ...d.data(), uid: d.id } as Player));
      setPlayers(pList);
      playersRef.current = pList;
      
      const me = pList.find(p => p.uid === auth.currentUser?.uid);
      setMyPlayer(me || null);
      
      // Master is the first player in the list (sorted by uid)
      const sorted = [...pList].sort((a, b) => a.uid.localeCompare(b.uid));
      setIsMaster(sorted[0]?.uid === auth.currentUser?.uid);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `rooms/${roomId}/players`);
    });
    
    return () => {
      unsubscribeRoom();
      unsubscribePlayers();
    };
  }, [roomId]);
  
  const joinRoom = useCallback(async (name: string) => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;
    
    // Find an available room or create one
    const roomsCol = collection(db, 'rooms');
    const q = query(roomsCol, where('status', '==', 'waiting'));
    const snapshot = await getDocs(q);
    
    let targetRoomId = '';
    if (snapshot.empty) {
      // Create new room
      const newRoomRef = doc(roomsCol);
      targetRoomId = newRoomRef.id;
      await setDoc(newRoomRef, {
        status: 'waiting',
        timer: Date.now(),
        platformSize: INITIAL_PLATFORM_SIZE,
        roundCount: 0
      });
    } else {
      targetRoomId = snapshot.docs[0].id;
    }
    
    // Join as player
    const playerDoc = doc(db, 'rooms', targetRoomId, 'players', uid);
    await setDoc(playerDoc, {
      name,
      x: GAME_WIDTH / 2 + (Math.random() - 0.5) * 200,
      y: GAME_HEIGHT / 2 + (Math.random() - 0.5) * 200,
      vx: 0,
      vy: 0,
      isAlive: true,
      isReady: false,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    });
    
    return targetRoomId;
  }, []);
  
  const startGame = useCallback(async () => {
    if (!roomId) return;
    await updateDoc(doc(db, 'rooms', roomId), {
      status: 'counting_down',
      timer: Date.now() + COUNTDOWN_TIME * 1000
    });
  }, [roomId]);
  
  const setInputVector = useCallback(async (vector: InputVector) => {
    if (!roomId || !auth.currentUser) return;
    // We only push to Firebase at the end of planning phase
    // But for now, let's store it locally
  }, [roomId]);
  
  const submitVector = useCallback(async (vector: InputVector) => {
    if (!roomId || !auth.currentUser) return;
    await updateDoc(doc(db, 'rooms', roomId, 'players', auth.currentUser.uid), {
      inputVector: vector,
      isReady: true
    });
  }, [roomId]);
  
  const updateRoomStatus = useCallback(async (status: GameStatus, nextTimerSeconds: number) => {
    if (!roomId || !isMaster) return;
    await updateDoc(doc(db, 'rooms', roomId), {
      status,
      timer: Date.now() + nextTimerSeconds * 1000
    });
  }, [roomId, isMaster]);
  
  // Phase Transitions
  useEffect(() => {
    if (!roomId || !isMaster || !room) return;
    
    const interval = setInterval(async () => {
      const now = Date.now();
      const timeLeft = room.timer - now;
      
      if (room.status === 'counting_down' && timeLeft <= 0) {
        await updateRoomStatus('planning', 0); // No fixed timer for planning
      } else if (room.status === 'planning') {
        const alivePlayers = playersRef.current.filter(p => p.isAlive);
        const allReady = alivePlayers.length > 0 && alivePlayers.every(p => p.isReady);
        if (allReady) {
          await updateRoomStatus('executing', EXECUTION_TIME);
        }
      } else if (room.status === 'executing' && timeLeft <= 0) {
        // Handled by finishRound in GameView
      }
    }, 500);
    
    return () => clearInterval(interval);
  }, [roomId, isMaster, room, updateRoomStatus]);
  
  const finishRound = useCallback(async (finalPlayers: Player[]) => {
    if (!roomId || !isMaster) return;
    
    const alive = finalPlayers.filter(p => p.isAlive);
    const roomDoc = doc(db, 'rooms', roomId);
    const currentRoom = roomRef.current;
    
    if (!currentRoom) return;
    
    if (alive.length <= 1) {
      // Game over
      const winner = alive[0];
      await updateDoc(roomDoc, {
        status: 'finished',
        winnerId: winner ? winner.uid : 'none',
        timer: Date.now()
      });
      
      if (winner) {
        // Update leaderboard
        const lbDoc = doc(db, 'leaderboard', winner.uid);
        const lbSnap = await getDoc(lbDoc);
        if (lbSnap.exists()) {
          await updateDoc(lbDoc, { wins: increment(1) });
        } else {
          await setDoc(lbDoc, { name: winner.name, wins: 1 });
        }
      }
    } else {
      // Next round: shrink platform
      const newSize = currentRoom.platformSize * SHRINK_FACTOR;
      
      // Push players towards center if they are outside new bounds
      const halfSize = newSize / 2;
      const centerX = GAME_WIDTH / 2;
      const centerY = GAME_HEIGHT / 2;
      
      const updates = finalPlayers.map(async (p) => {
        let { x, y } = p;
        if (p.isAlive) {
          x = Math.max(centerX - halfSize + 50, Math.min(centerX + halfSize - 50, x));
          y = Math.max(centerY - halfSize + 50, Math.min(centerY + halfSize - 50, y));
        }
        
        return updateDoc(doc(db, 'rooms', roomId, 'players', p.uid), {
          x, y, vx: 0, vy: 0, inputVector: null, isReady: false
        });
      });
      
      await Promise.all(updates);
      await updateDoc(roomDoc, {
        status: 'planning',
        platformSize: newSize,
        timer: Date.now() + PLANNING_TIME * 1000,
        roundCount: increment(1)
      });
    }
  }, [roomId, isMaster]);
  
  return {
    room,
    players,
    myPlayer,
    isMaster,
    error,
    joinRoom,
    startGame,
    submitVector,
    updateRoomStatus,
    finishRound
  };
}
