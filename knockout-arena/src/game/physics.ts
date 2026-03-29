import { Player } from '../types';
import { FRICTION, PLAYER_RADIUS, GAME_WIDTH, GAME_HEIGHT } from './constants';

export function updatePhysics(players: Player[], platformSize: number) {
  const alivePlayers = players.filter(p => p.isAlive);
  
  // Update positions
  for (const p of alivePlayers) {
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= FRICTION;
    p.vy *= FRICTION;
    
    // Check if out of bounds
    const halfSize = platformSize / 2;
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    
    if (
      p.x < centerX - halfSize || 
      p.x > centerX + halfSize || 
      p.y < centerY - halfSize || 
      p.y > centerY + halfSize
    ) {
      p.isAlive = false;
    }
  }
  
  // Check collisions
  for (let i = 0; i < alivePlayers.length; i++) {
    for (let j = i + 1; j < alivePlayers.length; j++) {
      const p1 = alivePlayers[i];
      const p2 = alivePlayers[j];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance = PLAYER_RADIUS * 2;
      
      if (distance < minDistance) {
        // Collision detected
        // Normal vector
        const nx = dx / distance;
        const ny = dy / distance;
        
        // Relative velocity
        const rvx = p2.vx - p1.vx;
        const rvy = p2.vy - p1.vy;
        
        // Relative velocity along normal
        const velAlongNormal = rvx * nx + rvy * ny;
        
        // Do not resolve if velocities are separating
        if (velAlongNormal > 0) continue;
        
        // Restitution (inelasticity)
        const e = 0.8; // Slightly bouncy but inelastic
        
        // Impulse scalar
        let jImpulse = -(1 + e) * velAlongNormal;
        jImpulse /= 1 / 1 + 1 / 1; // Assuming equal mass (1)
        
        // Apply impulse
        const impulseX = jImpulse * nx;
        const impulseY = jImpulse * ny;
        
        p1.vx -= impulseX;
        p1.vy -= impulseY;
        p2.vx += impulseX;
        p2.vy += impulseY;
        
        // Positional correction to prevent sticking
        const percent = 0.2;
        const slop = 0.01;
        const penetration = minDistance - distance;
        const correction = Math.max(penetration - slop, 0) / (1 / 1 + 1 / 1) * percent;
        const cx = nx * correction;
        const cy = ny * correction;
        
        p1.x -= cx;
        p1.y -= cy;
        p2.x += cx;
        p2.y += cy;
      }
    }
  }
}
