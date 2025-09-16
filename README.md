

A real-time communication system built with Node.js, Socket.IO, and WebRTC for connecting Technicians with Experts in remote assistance scenarios. This project enables video calling, real-time annotations, and user presence management.

## 🚀 Features

- **Real-time Video Communication**: WebRTC-based peer-to-peer video calling
- **Role-based Access Control**: Separate roles for Technicians and Experts
- **Real-time Annotations**: Live drawing and annotation capabilities during calls
- **User Presence Management**: Online/offline status tracking
- **Call Management**: Create, join, and end calls with proper cleanup
- **Reconnection Handling**: Automatic reconnection support with status preservation

## 🛠️ Technology Stack

- **Backend**: Node.js, Express.js
- **Real-time Communication**: Socket.IO
- **WebRTC**: Peer-to-peer video/audio communication
- **Authentication**: Simple username/password authentication
- **CORS**: Enabled for cross-origin requests

## 📋 Prerequisites

- Node.js (version 14 or higher)
- npm (Node Package Manager)
- Git

## 🔧 Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/romdhanimedali28/MobiMaint-WebRTC.git
cd MobiMaint-WebRTC
```

### 2. Install Dependencies

```bash
npm install
```

The main dependencies include:

- `express`: Web application framework
- `socket.io`: Real-time bidirectional event-based communication
- `cors`: Cross-Origin Resource Sharing middleware
- `uuid`: Unique identifier generation

### 3. Run the Server

```bash
node server.js
```

The server will start on port 3000 (or the port specified in the PORT environment variable).

### 4. Access the Application

- **Health Check**: `http://localhost:3000/health`
- **Active Calls**: `http://localhost:3000/api/calls`
- **Users Status**: `http://localhost:3000/api/users/status`
- **Experts List**: `http://localhost:3000/api/experts`

## 🔐 Default Users

The system comes with predefined users for testing:

|Username|Password|Role|
|---|---|---|
|user1|P|Technician|
|user2|P|Expert|
|user3|p3|Expert|
|user4|P|Expert|
|user5|P|Expert|
|uuser7|P|Expert|

## 🌐 How WebRTC Works in This System

### WebRTC Architecture

```
┌─────────────┐    Signaling    ┌─────────────┐
│ Technician  │◄──────────────►│   Expert    │
│  (Client A) │                 │ (Client B)  │
└─────────────┘                 └─────────────┘
       │                               │
       │          ┌─────────────┐      │
       └─────────►│   Server    │◄─────┘
                  │ (Socket.IO) │
                  └─────────────┘
```

### WebRTC Flow

1. **Signaling Phase**: Clients exchange session descriptions and network information through the Socket.IO server
2. **Peer Connection**: Direct peer-to-peer connection established between clients
3. **Media Exchange**: Audio/video streams flow directly between peers (bypassing server)

### Key WebRTC Events Handled

- **Offer/Answer Exchange**: Session description protocol (SDP) negotiation
- **ICE Candidates**: Network connectivity information exchange
- **Connection States**: Monitoring connection quality and status

## 🔄 Server Architecture & Socket Handling

### Core Components

#### 1. User Management

```javascript
const userSockets = new Map(); // userId -> socketId mapping
const users = [...]; // Hardcoded user database
```

#### 2. Call Management

```javascript
const activeCalls = new Map(); // callId -> call object mapping
```

### Socket Event Flow

#### Connection & Registration

```
Client Connect → 'register' event → Store socket mapping → Broadcast status
```

#### Call Creation & Management

```
Technician → 'create-call' → Generate callId → Store in activeCalls
Expert → 'call-request' → Forward to target user
Expert → 'call-response' → Handle accept/reject
Users → 'join-call' → Add to call room → Notify other participants
```

#### WebRTC Signaling

```
Client A → 'offer' → Server → Forward to Client B
Client B → 'answer' → Server → Forward to Client A  
Both → 'ice-candidate' → Server → Forward to peer
```

#### Real-time Features

```
User → 'annotation' → Store in call → Broadcast to call room
User → 'end-call' → Leave room → Notify participants → Cleanup
```

#### Connection Management

```
User → 'disconnect' → 2-second grace period → Mark offline → Cleanup calls
User → 'reconnect-after-call' → Re-register → Update status
```

## 📡 API Endpoints

### Authentication

- `POST /login` - User authentication

### Call Management

- `POST /api/create-call` - Create new call (Technicians only)
- `GET /api/calls` - List active calls

### User Management

- `GET /api/experts` - List available experts with status
- `GET /api/users/status` - All users with online/offline status

### System Health

- `GET /health` - Server health check

## 🔌 Socket Events

### Client → Server Events

- `register` - Register user with socket
- `call-request` - Request call to specific user
- `call-response` - Accept/reject incoming call
- `join-call` - Join existing call
- `offer` - WebRTC offer exchange
- `answer` - WebRTC answer exchange
- `ice-candidate` - ICE candidate exchange
- `annotation` - Real-time annotation data
- `end-call` - End current call
- `logout` - User logout
- `ping` - Heartbeat mechanism

### Server → Client Events

- `user-status-change` - User online/offline status updates
- `call-request` - Incoming call notification
- `call-response` - Call acceptance/rejection response
- `user-joined` - User joined call notification
- `user-left` - User left call notification
- `existing-users` - Current call participants
- `existing-annotations` - Current call annotations
- `offer` - WebRTC offer from peer
- `answer` - WebRTC answer from peer
- `ice-candidate` - ICE candidate from peer
- `annotation` - Real-time annotation updates
- `call-ended` - Call termination notification
- `error` - Error messages
- `pong` - Heartbeat response

## 🔧 Configuration

### Environment Variables

- `PORT`: Server port (default: 3000)

### CORS Configuration

```javascript
cors: {
  origin: '*',
  methods: ['GET', 'POST'],
  credentials: true
}
```

## 🚦 Server Request & Socket Flow

### 1. HTTP Request Handling

The server handles REST API requests for:

- User authentication (`/login`)
- Call creation (`/api/create-call`)
- System information (`/api/calls`, `/api/experts`, `/health`)

### 2. Socket Connection Lifecycle

```
Connection → Registration → Event Listening → Real-time Communication → Cleanup
```

### 3. Call State Management

```
pending → active → ended
```

### 4. User Status Broadcasting

When user status changes, the server broadcasts updates to all connected clients to maintain real-time presence information.

### 5. Graceful Cleanup

- **Call End**: Remove user from call, maintain socket connection
- **Disconnect**: 2-second grace period for reconnection
- **Process Termination**: Graceful server shutdown on SIGTERM/SIGINT

## 🐛 Error Handling

The server includes comprehensive error handling for:

- Missing required fields in socket events
- Invalid call states and user permissions
- User not found scenarios
- WebRTC signaling errors

## 📝 Development Notes

- **Security**: Replace hardcoded users with proper database authentication
- **Scalability**: Consider Redis for session management in production
- **STUN/TURN**: Add STUN/TURN servers for WebRTC in production environments
- **SSL/TLS**: Enable HTTPS for production deployments

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License.

---

For questions or support, please open an issue on the GitHub repository.
