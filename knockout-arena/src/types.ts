export type GameStatus = 'waiting' | 'counting_down' | 'planning' | 'executing' | 'finished';

export interface InputVector {
  angle: number;
  power: number;
}

export interface Player {
  uid: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isAlive: boolean;
  isReady: boolean;
  inputVector?: InputVector;
  color: string;
}

export interface Room {
  id: string;
  status: GameStatus;
  timer: number;
  platformSize: number;
  winnerId?: string;
  roundCount: number;
}

export interface LeaderboardEntry {
  uid: string;
  name: string;
  wins: number;
}
