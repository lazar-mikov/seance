const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

const MAX_PARTICIPANTS = 5;
let session = {
  participants: {},
  screenSocketId: null,
  phase: 'waiting',
  flatlineTriggered: false,
  startTime: null,
};

function getParticipantCount() { return Object.keys(session.participants).length; }
function getHoldingCount() { return Object.values(session.participants).filter(p => p.holding).length; }

function buildStateSnapshot() {
  const participants = Object.entries(session.participants).map(([id, p]) => ({
    id, name: p.name, holding: p.holding, slot: p.slot,
  }));
  return {
    phase: session.phase,
    participants,
    participantCount: getParticipantCount(),
    holdingCount: getHoldingCount(),
    maxParticipants: MAX_PARTICIPANTS,
  };
}

function broadcastState() { io.emit('state', buildStateSnapshot()); }

function assignSlot() {
  const usedSlots = Object.values(session.participants).map(p => p.slot);
  for (let i = 1; i <= MAX_PARTICIPANTS; i++) { if (!usedSlots.includes(i)) return i; }
  return null;
}

io.on('connection', (socket) => {
  console.log('connected:', socket.id);

  socket.on('register:screen', () => {
    session.screenSocketId = socket.id;
    socket.emit('state', buildStateSnapshot());
  });

  socket.on('register:phone', ({ name }) => {
    if (getParticipantCount() >= MAX_PARTICIPANTS) {
      socket.emit('error', { message: 'Session is full (5/5)' }); return;
    }
    const slot = assignSlot();
    session.participants[socket.id] = { name: name || `Participant ${slot}`, holding: false, slot };
    console.log(`${name} joined slot ${slot}`);
    socket.emit('registered', { slot, name: session.participants[socket.id].name });
    broadcastState();
  });

  socket.on('hold', () => {
    if (!session.participants[socket.id]) return;
    session.participants[socket.id].holding = true;
    if (session.phase === 'waiting' || session.phase === 'flatlined') {
      session.phase = 'active';
      session.flatlineTriggered = false;
      if (!session.startTime) session.startTime = Date.now();
    }
    broadcastState();
  });

  socket.on('release', () => {
    if (!session.participants[socket.id]) return;
    session.participants[socket.id].holding = false;
    if (getHoldingCount() === 0 && getParticipantCount() > 0 && session.phase === 'active') {
      session.phase = 'flatlined';
      session.flatlineTriggered = true;
      io.emit('flatline', { message: 'the channel is closed.' });
      console.log('FLATLINE — all released');
    }
    broadcastState();
  });

  socket.on('admin:reset', () => {
    session = { participants: {}, screenSocketId: null, phase: 'waiting', flatlineTriggered: false, startTime: null };
    io.emit('reset');
    console.log('Session reset');
  });

  socket.on('disconnect', () => {
    if (socket.id === session.screenSocketId) { session.screenSocketId = null; return; }
    if (session.participants[socket.id]) {
      const p = session.participants[socket.id];
      delete session.participants[socket.id];
      if (getHoldingCount() === 0 && getParticipantCount() > 0 && session.phase === 'active') {
        session.phase = 'flatlined';
        session.flatlineTriggered = true;
        io.emit('flatline', { message: 'the channel is closed.' });
      }
      broadcastState();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`HAUNTED running on http://localhost:${PORT}`));