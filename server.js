const { log } = require('console');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');


const app = express();
const cors = require('cors');
app.use(cors({
  origin: '*', // Allow all origins for testing
  methods: ['GET', 'POST'],
  credentials: true
}));
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Hardcoded users with roles (replace with database in production)
const users = [
  { username: 'user1', password: 'P', role: 'Technician' },
  { username: 'user2', password: 'P', role: 'Expert' },
  { username: 'user4', password: 'P', role: 'Expert' },
    { username: 'uuser7', password: 'P', role: 'Expert' },
    { username: 'user5', password: 'P', role: 'Expert' },
  { username: 'user3', password: 'p3', role: 'Expert' },
];

app.use(express.json()); // Parse JSON request bodies

// Login endpoint
app.post('/login', (req, res) => {
  log("herre login")
  const { username, password } = req.body;
  const user = users.find(
    (u) => u.username === username && u.password === password
  );

  if (user) {
    res.json({ userId: username, role: user.role, message: 'Login successful' });
  } else {
    res.status(401).json({ message: 'Invalid username or password' });
  }
});

// Get list of users with Expert role
app.get('/api/experts', (req, res) => {
  console.log('get expert');
  const experts = users.filter(user => user.role === 'Expert');
  const expertsList = experts.map((expert) => ({
    id: expert.username,
    username: expert.username,
    role: expert.role,
    status: userSockets.has(expert.username) ? 'online' : 'offline',
  }));

  res.json({
    totalExperts: expertsList.length,
    experts: expertsList,
  });
});

// Create call endpoint for Technicians
app.post('/api/create-call', (req, res) => {
  const { userId } = req.body;
  console.log("-----------------------")
  console.log(userId)
  const user = users.find(u => u.username === userId && u.role === 'Technician');
  console.log(user)

  if (!user) {
    return res.status(403).json({ message: 'Only Technicians can create calls' });
  }
  const callId = uuidv4();
  console.log(callId)
  activeCalls.set(callId, { users: [userId], startTime: Date.now(), annotations: [], status: 'pending' });
  console.log("-----------------------")

  res.json({ callId });
});

const activeCalls = new Map();
const userSockets = new Map();

// Function to broadcast user status change to all clients
function broadcastUserStatusChange(userId, status) {
  console.log(`Broadcasting status change: ${userId} is now ${status}`);
  io.emit('user-status-change', { userId, status });
}

io.on('connection', (socket) => {
  console.log('User connected:------->', socket.id);

  socket.on('register', (data) => {
    const { userId } = data;
    console.log('register work',userId)

    if (userId) {
      const oldSocketId = userSockets.get(userId);
      if (oldSocketId && oldSocketId !== socket.id) {
        console.log(`User ${userId} reconnecting with new socket ID: ${socket.id} (old: ${oldSocketId})`);
      }
      
      userSockets.set(userId, socket.id);
      socket.userId = userId;
      broadcastUserStatusChange(userId, 'online');
      console.log(`User ${userId} registered with socket ID: ${socket.id} - STATUS: ONLINE`);
    }
  });

  socket.on('call-request', (data) => {

    const { callId, from, to } = data;
    console.log('call request:', callId, from, to);

    if (!callId || !from || !to) {
      socket.emit('error', { message: 'Missing callId, from, or to' });
      return;
    }

    const call = activeCalls.get(callId);
    if (!call || call.status !== 'pending') {
      socket.emit('error', { message: 'Invalid or non-pending call' });
      return;
    }

    console.log(`Call request from ${from} to ${to} for call ${callId}`);
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-request', { callId, from });
    } else {
      socket.emit('error', { message: `User ${to} not found` });
    }
  });

  socket.on('call-response', (data) => {

    const { callId, from, to, accepted } = data;
    console.log('call response:', callId, from, to, accepted);

    if (!callId || !from || !to || accepted === undefined) {
      socket.emit('error', { message: 'Missing callId, from, to, or accepted' });
      return;
    }

    const call = activeCalls.get(callId);
    if (!call) {
      socket.emit('error', { message: 'Call not found' });
      return;
    }

    console.log(`Call response from ${from} to ${to}: ${accepted ? 'Accepted' : 'Cancelled'}`);
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call-response', { callId, from, accepted });
      if (accepted) {
        call.status = 'active';
        call.users.push(from);
        socket.join(callId);
        io.to(callId).emit('user-joined', {
          userId: from,
          role: 'Expert',
          socketId: socket.id,
          totalUsers: call.users.length,
        });
      } else {
        activeCalls.delete(callId);
      }
    } else {
      socket.emit('error', { message: `User ${to} not found` });
    }
  });

  socket.on('join-call', (data) => {

    const { callId, userId, role } = data;
    console.log('join call:', callId, userId, role );

    if (!callId || !userId || !role) {
      socket.emit('error', { message: 'Missing callId, userId, or role' });
      return;
    }

    console.log('=== User Started/Joined Call ===');
    console.log(`User ID: ${userId}`);
    console.log(`Role: ${role}`);
    console.log(`Call ID: ${callId}`);
    console.log(`Socket ID: ${socket.id}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log(`Total Users in Call: ${activeCalls.has(callId) ? activeCalls.get(callId).users.length + 1 : 1}`);
    console.log('==============================');

    userSockets.set(userId, socket.id);
    socket.userId = userId;
    socket.role = role;
    socket.join(callId);

    if (!activeCalls.has(callId)) {
      activeCalls.set(callId, { users: [], startTime: Date.now(), annotations: [], status: 'active' });
    }

    const call = activeCalls.get(callId);
    if (!call.users.includes(userId)) {
      call.users.push(userId);
    }

    socket.to(callId).emit('user-joined', {
      userId,
      role,
      socketId: socket.id,
      totalUsers: call.users.length,
    });

    socket.emit('existing-users', { users: call.users.filter(id => id !== userId) });
    socket.emit('existing-annotations', { annotations: call.annotations });
    console.log(`Call ${callId} now has ${call.users.length} users:`, call.users);
  });

  socket.on('offer', (data) => {
    console.log('call offer:', data);

    const { callId, offer, to } = data;
    if (!callId || !offer || !to) {
      socket.emit('error', { message: 'Missing required fields in offer' });
      return;
    }

    console.log(`Forwarding offer in call ${callId} to ${to}`);
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('offer', { offer, from: socket.userId, callId });
    } else {
      socket.emit('error', { message: `User ${to} not found` });
    }
  });

  socket.on('answer', (data) => {
    console.log('call answer:', data);

    const { callId, answer, to } = data;
    if (!callId || !answer || !to) {
      socket.emit('error', { message: 'Missing required fields in answer' });
      return;
    }

    console.log(`Forwarding answer in call ${callId} to ${to}`);
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('answer', { answer, from: socket.userId, callId });
    } else {
      socket.emit('error', { message: `User ${to} not found` });
    }
  });

  socket.on('ice-candidate', (data) => {
    console.log('call candidate:', data);

    const { callId, candidate, to } = data;
    if (!callId || !candidate || !to) {
      socket.emit('error', { message: 'Missing required fields in ICE candidate' });
      return;
    }

    console.log(`Forwarding ICE candidate in call ${callId} to ${to}`);
    const targetSocketId = userSockets.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', { candidate, from: socket.userId, callId });
    } else {
      socket.emit('error', { message: `User ${to} not found` });
    }
  });

  socket.on('annotation', (data) => {
    console.log('call annotations:', data);

    const { callId, id, text, x, y, from, objectId } = data;
    if (!callId || !id || !text || x === undefined || y === undefined || !from) {
      socket.emit('error', { message: 'Missing required fields in annotation' });
      return;
    }

    console.log(`Forwarding annotation in call ${callId} from ${from} for object ${objectId || 'none'}`);
    const call = activeCalls.get(callId);
    if (call) {
      call.annotations = call.annotations || [];
      const existing = call.annotations.find(a => a.id === id);
      if (existing) {
        existing.text = text;
        existing.x = x;
        existing.y = y;
        existing.objectId = objectId;
      } else {
        call.annotations.push({ id, text, x, y, from, objectId });
      }
      socket.to(callId).emit('annotation', { id, text, x, y, from, objectId });
    }
  });

  socket.on('end-call', (data) => {
    console.log('call end:', data);

    const { callId, to } = data;
    console.log(`User ${socket.userId} ending call ${callId}`);
    
    // Leave the call room
    socket.leave(callId);
    
    // Notify other user that call ended
    if (to) {
      const targetSocketId = userSockets.get(to);
      if (targetSocketId) {
        io.to(targetSocketId).emit('call-ended', { from: socket.userId, callId });
      }
    }
    
    // Cleanup user from call but maintain socket connection
    cleanupUserFromCall(socket.userId, callId);
    
    // Emit call-ended-successfully to confirm the user is still connected
    socket.emit('call-ended-successfully', { 
      userId: socket.userId, 
      callId,
      message: 'Call ended successfully, you remain connected' 
    });
    
    console.log(`User ${socket.userId} ended call but remains connected`);
  });

  socket.on('logout', (data) => {
    const { userId } = data;
    if (userId && userSockets.has(userId)) {
      userSockets.delete(userId);
      broadcastUserStatusChange(userId, 'offline');
      console.log(`User ${userId} logged out - STATUS: OFFLINE`);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.userId) {
      console.log(`User ${socket.userId} socket disconnected, checking for reconnection...`);
      
      // Give the user a chance to reconnect (delay before marking offline)
      setTimeout(() => {
        // Check if user has reconnected with a new socket
        if (!userSockets.has(socket.userId) || userSockets.get(socket.userId) === socket.id) {
          // User hasn't reconnected, mark as offline
          console.log(`User ${socket.userId} didn't reconnect, marking as offline`);
          
          // Remove user from any active calls
          activeCalls.forEach((call, callId) => {
            if (call.users.includes(socket.userId)) {
              socket.to(callId).emit('user-left', { userId: socket.userId, callId });
              cleanupUserFromCall(socket.userId, callId);
            }
          });
          
          // Remove from userSockets and broadcast offline status
          userSockets.delete(socket.userId);
          broadcastUserStatusChange(socket.userId, 'offline');
          console.log(`User ${socket.userId} disconnected - STATUS: OFFLINE`);
        } else {
          console.log(`User ${socket.userId} has reconnected with new socket`);
        }
      }, 2000);// 2 second delay to allow reconnection
    
    
    }
  });

  function cleanupUserFromCall(userId, callId) {
    const call = activeCalls.get(callId);
    if (call) {
      call.users = call.users.filter(id => id !== userId);
      if (call.users.length === 0) {
        activeCalls.delete(callId);
        console.log(`Call ${callId} removed - no users left`);
      } else {
        console.log(`Call ${callId} now has ${call.users.length} users:`, call.users);
      }
    }
  }

  // Heartbeat mechanism to keep connection alive
  socket.on('ping', () => {
    socket.emit('pong');
  });

  // Handle reconnection after call end
  socket.on('reconnect-after-call', (data) => {
    const { userId } = data;
    if (userId) {
      userSockets.set(userId, socket.id);
      socket.userId = userId;
      broadcastUserStatusChange(userId, 'online');
      socket.emit('reconnect-success', { userId, message: 'Reconnected successfully' });
      console.log(`User ${userId} reconnected after call with socket ID: ${socket.id}`);
    }
  });
});

app.get('/api/calls', (req, res) => {
  const calls = Array.from(activeCalls.entries()).map(([callId, call]) => ({
    callId,
    users: call.users,
    startTime: call.startTime,
    duration: Date.now() - call.startTime,
    annotations: call.annotations,
    status: call.status,
  }));

  res.json({
    totalCalls: calls.length,
    totalUsers: Array.from(userSockets.keys()).length,
    calls,
  });
});

app.get('/api/users/status', (req, res) => {
  const usersWithStatus = users.map(user => ({
    username: user.username,
    role: user.role,
    status: userSockets.has(user.username) ? 'online' : 'offline'
  }));

  res.json({
    totalUsers: usersWithStatus.length,
    onlineUsers: usersWithStatus.filter(u => u.status === 'online').length,
    users: usersWithStatus
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Active calls: http://localhost:${PORT}/api/calls`);
  console.log(`Users status: http://localhost:${PORT}/api/users/status`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
    // process.exit(0);

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  // process.exit(0);

  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});