const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');

const {
  updateSettings,
  handleDisconnect,
  handlePlayer,
  getWordFor,
  handleVote,
  handleGame,
  createGameState,
  getState,
  getClientsFromSameRoom
} = require('./gameManager');

const clientIdToSocket = new Map();
let onlineRooms = {};

const setUpIo = () => {
  io.on('connection', (socket) => {
 console.log('user connected');
  const clientId = socket.id;
  clientIdToSocket.set(clientId, socket);
  socket.on('createRoom', () => {
    const roomID = Math.random().toString(36).substring(2, 7); 
    onlineRooms[roomID] = [];
    socket.join(roomID); 
    socket.emit('roomCreated', roomID); 
  });

  socket.on('joinRoom', (roomID) => {
    if (onlineRooms.hasOwnProperty(roomID)) {
      socket.join(roomID);
      onlineRooms[roomID].push(clientId); 
      io.to(roomID).emit('userJoined', clientId); 
      socket.emit('joinedRoom', roomID); 
    } else {
      socket.emit('roomNotFound'); 
    }
  });
  socket.on('message', (message, roomId) => {
    const parsedMessage = JSON.parse(message.toString());
    const state = getState(parsedMessage?.roomId?.toUpperCase());
    if(!state){
      return;
    }
    if(parsedMessage.topic === 'player'){
      const response = handlePlayer(parsedMessage, parsedMessage.roomId, clientId);
      io.to(roomId).emit('message', JSON.stringify(response));
    }else if(parsedMessage.topic === 'settings'){
      const response = updateSettings(parsedMessage, clientId);
      io.to(roomId).emit('message', JSON.stringify(response));
    }else if(parsedMessage.topic === 'game'){
      const response = handleGame(clientId, parsedMessage);
      const roomClients = getClientsFromSameRoom(clientId);
      io.to(roomId).emit('message', JSON.stringify(response));
      if(parsedMessage.subtopic === 'start'){
        roomClients.forEach((client) => {
          const word = getWordFor(client, state);
          const currSocket = clientIdToSocket.get(client);
          currSocket.emit('message',JSON.stringify(word));
        });
      }
    }else if(parsedMessage.topic === 'vote'){
      const response = handleVote(parsedMessage, clientId);
      if(response){
        io.to(roomId).emit('message',JSON.stringify(response));
      }
    }
    
  });

  socket.on('disconnect', () => {
    let roomId;
    for(const roomID in onlineRooms){
      if(onlineRooms[roomID].includes(clientId)){
        roomId = roomID;
        break;
      }
    }
    const response = handleDisconnect(clientId);
    clientIdToSocket.delete(clientId);
    if(response.data?.length > 0){
      io.to(roomId).emit('message',JSON.stringify(response));
    }
    
  });
  });
}


setUpIo();
app.use(express.static(path.join(__dirname, '../../app')));



http.listen(3000,()=>{
  console.log('server listening on port 3000');
})

