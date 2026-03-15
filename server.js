const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// Session state
const MAX_PARTICIPANTS = 5;
let session = {
  participants: {}, // socketId -> { name, holding, connected }
  screenSocketId: null,
  phase: 'waiting', // waiting | active | flatlined | complete
  flatlineTriggered: false,
  startTime: null,
};

function getParticipantCount() {
  return Object.keys(session.participants).length;
}

function getHoldingCount() {
  return Object.values(session.participants).filter(p => p.holding).length;
}

function buildStateSnapshot() {
  const participants = Object.entries(session.participants).map(([id, p]) => ({
    id,
    name: p.name,
    holding: p.holding,
    slot: p.slot,
  }));
  return {
    phase: session.phase,
    participants,
    participantCount: getParticipantCount(),
    holdingCount: getHoldingCount(),
    maxParticipants: MAX_PARTICIPANTS,
  };
}

function broadcastState() {
  const state = buildStateSnapshot();
  io.emit('state', state);
}

function assignSlot() {
  const usedSlots = Object.values(session.participants).map(p => p.slot);
  for (let i = 1; i <= MAX_PARTICIPANTS; i++) {
    if (!usedSlots.includes(i)) return i;
  }
  return null;
}

io.on('connection', (socket) => {
  console.log('connected:', socket.id);

  // --- SCREEN CLIENT ---
  socket.on('register:screen', () => {
    session.screenSocketId = socket.id;
    console.log('Screen registered:', socket.id);
    socket.emit('state', buildStateSnapshot());
  });

  // --- PHONE CLIENT ---
  socket.on('register:phone', ({ name }) => {
    if (getParticipantCount() >= MAX_PARTICIPANTS) {
      socket.emit('error', { message: 'Session is full (5/5)' });
      return;
    }
    if (session.phase === 'flatlined') {
      socket.emit('error', { message: 'The channel is closed.' });
      return;
    }

    const slot = assignSlot();
    session.participants[socket.id] = {
      name: name || `Participant ${slot}`,
      holding: false,
      slot,
    };

    console.log(`${name} joined as slot ${slot}`);
    socket.emit('registered', { slot, name: session.participants[socket.id].name });
    broadcastState();
  });

  // --- HOLD / RELEASE ---
  socket.on('hold', () => {
    if (!session.participants[socket.id]) return;
    if (session.phase === 'flatlined') return;
    session.participants[socket.id].holding = true;

    // If all holding and we're waiting, start session
    if (session.phase === 'waiting' && getHoldingCount() === getParticipantCount() && getParticipantCount() === MAX_PARTICIPANTS) {
      session.phase = 'active';
      session.startTime = Date.now();
    }

    broadcastState();
  });

  socket.on('release', () => {
    if (!session.participants[socket.id]) return;
    if (session.phase !== 'active') return;

    session.participants[socket.id].holding = false;

    // Trigger flatline
    if (!session.flatlineTriggered) {
      session.flatlineTriggered = true;
      session.phase = 'flatlined';

      const name = session.participants[socket.id].name;
      io.emit('flatline', {
        name,
        slot: session.participants[socket.id].slot,
        message: `${name} let go.`,
      });

      console.log(`FLATLINE triggered by ${name}`);
    }

    broadcastState();
  });

  // --- ADMIN: reset session ---
  socket.on('admin:reset', () => {
    session = {
      participants: {},
      screenSocketId: null,
      phase: 'waiting',
      flatlineTriggered: false,
      startTime: null,
    };
    io.emit('reset');
    console.log('Session reset');
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    if (socket.id === session.screenSocketId) {
      session.screenSocketId = null;
      console.log('Screen disconnected');
      return;
    }

    if (session.participants[socket.id]) {
      const p = session.participants[socket.id];
      const wasHolding = p.holding;
      console.log(`${p.name} disconnected (was holding: ${wasHolding})`);

      delete session.participants[socket.id];

      // If they disconnect while holding during active session = flatline
      if (wasHolding && session.phase === 'active' && !session.flatlineTriggered) {
        session.flatlineTriggered = true;
        session.phase = 'flatlined';
        io.emit('flatline', {
          name: p.name,
          slot: p.slot,
          message: `${p.name} disconnected.`,
        });
      }

      broadcastState();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`HAUNTED server running on http://localhost:${PORT}`);
});
