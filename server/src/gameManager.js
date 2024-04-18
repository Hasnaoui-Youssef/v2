
const {GameState, Status} = require('./gameState')
/**
 * @property {string} roomID
 * @property {GameState} State
 */
const roomIdToStates = new Map();
const clientIdToRoomId = new Map();

/** 
 *@interface InGameInfo
 *@property {Number} turn
 *@property {string} player
 *@property {Map <string, string[]>} playerToWords
*/

/**
 * @typedef {object} Message
 * @property {string} topic
 * @property {string} subtopic
 * @property {string} [roomId]
 */

/**
 * @typedef {Message} Payload
 * @property {string} data
 */

/**
 * @typedef {Message} SettingTopicResponse
 * @property {object} data
 * @property {Number} data.underCoverCount
 * @property {Number} data.mrWhiteCountCount
 */
/**
 * @typedef {Message} PlayerResponse
 * @property {string} data
 */
/**
 * @typedef {Message} InGameResponse
 * @property {object} data
 * @property {Number} data.turn
 * @property {string} data.player
 * @property {[string, string[]][]} playerToWords
 * @property {Status} state
 */

/**
 * 
 * @param {Message} message 
 * @param {string} clientId 
 * @returns {SettingTopicResponse}
 */
const updateSettings = (message, clientId) => {
/**
 * @property {GameState} newState
 */
    const roomId = clientIdToRoomId.get(clientId);

    const newState = getState(roomId);

    if(message.subtopic === 'white'){
        if(message.data === 'increment'){
            newState.addMrWhite();
        }else{
            newState.removeMrWhite();
        }
    }else if(message.subtopic === 'undercover'){
        if(message.data === 'increment'){
            newState.addUndercover();
        }else{
            newState.removeUndercover();
        }
    }

    const [underCoverCount,mrWhiteCount] = [newState.getUndercoverCount(), newState.getMrWhiteCount()];
    updateState(roomId, newState);
    return {
        topic : message.topic,
        subtopic : message.subtopic,
        data : {
            underCoverCount,
            mrWhiteCount
        },
        roomId
    };
}
/**
 * 
 * @param {Message} message 
 * @param {string} clientId
 * @returns {SettingTopicResponse} 
 */
const handleDisconnect = (clientId) => {
    const roomId = clientIdToRoomId.get(clientId);
    clientIdToRoomId.delete(clientId);
    let newState = getState(roomId)?.removePlayer(clientId);
    const response = {
        topic : 'player',
        subtopic :'update',
        data : newState?.getPlayers(),
        roomId
    };
    if(newState?.getPlayers().length === 0){
        roomIdToStates.delete(roomId);
    }else{
        updateState(roomId, newState);
    }
    return response;
}
/**
 * 
 * @param {Message} message 
 * @param {string} roomId 
 * @param {string} clientId 
 * @returns {Message} 
 */
const handlePlayer = (message, roomId, clientId) => {
    const newState = getState(roomId);
    let response;
    if(message.subtopic === 'add'){
        const playerId = message.data;
        newState.addPlayer(clientId, playerId);
        clientIdToRoomId.set(clientId, roomId);
        response = {
            topic : message.topic,
            subtopic : 'update',
            data : newState.getPlayers(),
            roomId
        };
    }else if(message.subtopic === 'word'){
        const word = newState.getWord(clientId);
        response = {
            topic : message.topic,
            subtopic : 'word',
            data : word,
            roomId
        };
    }else{
        response = {
            topic : message.topic,
            subtopic : 'unkown',
            data : newState.getPlayers(),
            roomId
        };
    }
    updateState(roomId, newState);
    return response;

}


/**
 * 
 * @param {string} clientId 
 * @param {GameState} gameState 
 * @returns {Message}
 */
const getWordFor = (clientId, gameState) => {
    const word = gameState.getWord(clientId);
    const roomId = clientIdToRoomId.get(clientId);
    return {
        topic : 'game',
        subtopic : 'word',
        data : word,
        roomId
    };
}


/**
 * 
 * @param {Payload} message 
 * @param {string} clientId
 * @returns {Message}
 */
const handleVote = (message, clientId)=>{
    const roomId = clientIdToRoomId.get(clientId);
    const newState = getState(roomId);
    let response;
    if(message.subtopic === 'against'){
        newState.vote(clientId, message.data);
        const playersWhoVoted = newState.getPlayersWhoVoted();
        response = {
            topic : message.topic,
            subtopic : 'update',
            data : {
                playersWhoVoted,
                state : newState.status
            },
            roomId
        };
    }else if(message.subtopic === 'result'){
        const voteResult = newState.computeVoteResult();
        if(voteResult){
            response = {
                topic : message.topic, 
                subtopic : 'result',
                data : voteResult,
                roomId
            };
        }
    }else if(message.subtopic === 'guess'){
        newState = newState.guess(message.data);
        response = {
            topic : message.topic,
            subtopic : 'guess',
            data : newState.status,
            roomId
        };
    }
    updateState(roomId, newState);
    return response;
}


/**
 * 
 * @param {string} clientId 
 * @param {Payload} message
 * @returns  {InGameResponse}
 */
const handleGame = (clientId, message) => {
    const roomId = clientIdToRoomId.get(clientId);
    let newState = getState(roomId);
    if(message.subtopic === 'start'){
        newState = startGame(newState);
    }else if(message.subtopic === 'add'){
        newState.addWord(message.data,clientId);
    }else if(message.subtopic === 'guess'){
        newState = newState.guess(message.data);
    }

    const {turn, player, playerToWords} = getGameInfo(newState);
    const playerToWordsArray = Array.from(playerToWords);
    const response = {
        topic : message.topic,
        subtopic : 'update',
        data : {
            turn,
            player,
            playerToWords : playerToWordsArray,
            state : newState.status
        },
        roomId
    };
    updateState(roomId, newState);
    return response;
}



/**
 * 
 * @param {GameState} gameState
 * @returns {InGameInfo} 
 */
const getGameInfo = (gameState) => {
    const turn = gameState.getTurn();
    const player = gameState.getPlayerAt(turn);
    const playerToWords = gameState.getPlayerToWords();
    return{
        turn,
        player,
        playerToWords
    }
} 


/**
 * 
 * @param {string} roomId 
 * @returns {GameState}
 */
const getState = (roomId) => {
    return roomIdToStates.get(roomId);
}

/**
 * @param {GameState}
 * @returns {GameState}
 */

const startGame = (gameState) => {
    const newState = gameState;
    newState.start();
    return newState;
}

/**
 * @returns {string}
 */
const createGameState = () => {
    const UniqueId = () => Math.random().toString(36).substring(2, 7);
    let roomId = UniqueId();
    while(roomIdToStates.has(roomId)){
        roomId = UniqueId();
    }
    roomIdToStates.set(roomId, new GameState());
    return roomId;
}
/**
 * 
 * @param {string} clientId
 * @returns {string[]} 
 */
const getClientsFromSameRoom = (clientId) => {
    const roomId = clientIdToRoomId.get(clientId);
    const state = getState(roomId);
    return state? Array.from(state.clientToPlayer.keys()) : [];
}


/**
 * 
 * @param {string} roomId 
 * @param {GameState} newState 
 */
const updateState = (roomId, newState) => {
    roomIdToStates.set(roomId, newState);
}

module.exports = {
    updateSettings,
    handleDisconnect,
    handlePlayer,
    getWordFor,
    handleVote,
    handleGame,
    createGameState,
    getState,
    updateState,
    getClientsFromSameRoom
};