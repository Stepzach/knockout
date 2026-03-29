import React, { useState } from 'react';
import { useGame } from './game/useGame';
import Lobby from './components/Lobby';
import GameView from './game/GameView';

export default function App() {
  const [roomId, setRoomId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  
  const { 
    room, 
    players, 
    myPlayer, 
    isMaster, 
    joinRoom, 
    startGame, 
    submitVector, 
    finishRound 
  } = useGame(roomId, playerName);
  
  const handleJoin = async (name: string) => {
    setPlayerName(name);
    setIsJoining(true);
    const id = await joinRoom(name);
    if (id) setRoomId(id);
  };
  
  if (!roomId || !room || room.status === 'waiting') {
    return (
      <Lobby 
        onJoin={handleJoin} 
        players={players} 
        onStart={startGame} 
        isMaster={isMaster}
        isJoining={isJoining}
      />
    );
  }
  
  return (
    <GameView 
      room={room}
      players={players}
      myPlayer={myPlayer}
      isMaster={isMaster}
      onSubmitVector={submitVector}
      onFinishRound={finishRound}
    />
  );
}
