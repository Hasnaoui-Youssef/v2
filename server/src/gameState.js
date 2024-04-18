const utils = require('./utils');
const Roles = {
    Mr_White : "MrWhite",
    UnderCover : "UnderCover",
    Civilian : "Civilian"
}

const Status = {
    LOBBY : "LOBBY",
    PLAYING : "PLAYING",
    VOTING : "VOTING",
    FINISHED_VOTING : "FINISHED VOTING",
    MR_WHITE_GUESSING : "MR_WHITE_GUESSING",
    WON : "WON",
    LOST : "LOST" 
};



/** 
 *@typedef {object} VoteResult
 *@property {Number} turn
 *@property {string} result
 *@property {GameState} gameState
 *@property {string} civWord
 *@property {string} UCWord
*/
/**const VoteResult = {
    turn,
    result,
    gameState,
    civWord,
    UCWord
}
*/

/**
 * @typedef {object} VoteUpdates
 * @property {string[]} playersWhoVoted 
 */

class GameState {
    constructor() {
      this.clientToPlayer = new Map();
      this.playerToWords = new Map();
      this.playerToRole = new Map();
      this.underCoverCount = 0;
      this.mrWhiteCount = 0;
      this.remainingVilains = 0;
      this.remainingCivilians = 0;
      this.status = Status.LOBBY;
      this.turn = 0;
      this.playersOrder = [];
      this.playerToAssignedWord = new Map();
      this.votedOutPlayers = [];
      this.currentPlayersVote = new Map();
      this.originalPlayerNumber = 0;
      this.goodWord = '';
      this.undercoverWord = '';
    }
  
    addPlayer(clientId, player) {
      this.clientToPlayer.set(clientId, player);
    }
  
    getPlayers() {
      return Array.from(this.clientToPlayer.values());
    }
  
    getUndercoverCount() {
      return this.underCoverCount;
    }
  
    getMrWhiteCount() {
      return this.mrWhiteCount;
    }
  
    removePlayer(clientId) {
      const player = this.clientToPlayer.get(clientId);
      const role = this.playerToRole.get(player);
      if (role === Role.CIVILIAN) {
        this.remainingCivilians -= 1;
      } else {
        this.remainingVilains -= 1;
      }
      this.clientToPlayer.delete(clientId);
      this.playerToRole.delete(player);
      this.playerToWords.delete(player);
      this.playerToAssignedWord.delete(player);
      this.currentPlayersVote.delete(player);
      this.votedOutPlayers = this.votedOutPlayers.filter((p) => p !== player);
      if (this.playerToRole.size === 0) {
        this.resetState();
      }
      return this;
    }
  
    addUndercover() {
      if (this.underCoverCount + this.mrWhiteCount < this.clientToPlayer.size) {
        this.underCoverCount += 1;
        this.remainingVilains += 1;
      }
    }
  
    guess(word) {
      if (word.toUpperCase() !== this.goodWord.toUpperCase()) {
        if (this.remainingVilains === 0) {
          this.status = Status.WON;
        } else {
          this.status = Status.PLAYING;
        }
      } else {
        this.status = Status.LOST;
      }
      return this;
    }
  
    vote(clientId, against) {
      if (this.status === Status.DRAW_VOTE || this.status === Status.VOTING) {
        if (this.status === Status.DRAW_VOTE) {
          this.resetCurrentVote();
          this.status = Status.VOTING;
        }
        const playerId = this.clientToPlayer.get(clientId);
        const againstExists = this.playerToAssignedWord.has(against);
        if (againstExists && playerId !== against) {
          this.currentPlayersVote.set(playerId, against);
          if (this.currentPlayersVote.size + this.votedOutPlayers.length === this.originalPlayerNumber) {
            this.status = Status.FINISHED_VOTING;
          }
        }
      }
    }
  
    getStatus() {
      return this.status;
    }
    resetCurrentVote() {
        this.currentPlayersVote = new Map();
      }
    
      getPlayersWhoVoted() {
        return Array.from(this.currentPlayersVote).map((pair) => pair[0]);
      }
    
      getVotedOutPlayers() {
        return this.votedOutPlayers;
      }
    
      computeVoteResult() {
        if (this.status !== Status.FINISHED_VOTING) {
          return undefined;
        }
        const votesAgainst = new Map();
        let draw = false;
        let maxVote = 0;
        let playerOut;
    
        Array.from(this.currentPlayersVote)
          .forEach((pair) => {
            const votedOutPlayer = pair[1];
            if (!votesAgainst.has(votedOutPlayer)) {
              votesAgainst.set(votedOutPlayer, 0);
            }
            const newCount = votesAgainst.get(votedOutPlayer) + 1;
            votesAgainst.set(votedOutPlayer, newCount);
            if (newCount > maxVote) {
              maxVote = newCount;
              draw = false;
              playerOut = votedOutPlayer;
            } else if (newCount === maxVote) {
              draw = true;
            }
          });
    
        const voteDetails = Array.from(votesAgainst);
        if (draw) {
          this.status = Status.DRAW_VOTE;
          return {
            turn: this.turn,
            result: 'DRAW',
            voteDetails,
            gameState: this.status,
          };
        }
    
        if (this.votedOutPlayers.indexOf(playerOut) === -1) {
          this.votedOutPlayers.push(playerOut);
          const role = this.playerToRole.get(playerOut);
          if (role === Role.MR_WHITE || role === Role.UNDERCOVER) {
            this.remainingVilains -= 1;
          } else {
            this.remainingCivilians -= 1;
          }
          if (role === Role.MR_WHITE) {
            this.status = Status.MR_WHITE_GUESS_WAITING;
          } else if (this.remainingVilains === 0) {
            this.status = Status.WON;
          } else if (this.remainingCivilians === 1) {
            this.status = Status.LOST;
          } else {
            this.status = Status.PLAYING;
          }
        }
        this.skipVotedOutPlayers();
        const finishedStatus = this.status === Status.WON || this.status === Status.LOST;
        return {
          turn: this.turn,
          result: 'OUT',
          playerOut,
          playerOutRole: this.playerToRole.get(playerOut),
          voteDetails,
          gameState: this.status,
          goodWord: finishedStatus ? this.goodWord : undefined,
          undercoverWord: finishedStatus && this.underCoverCount > 0 ? this.undercoverWord : undefined,
        };
      }
    
      removeUndercover() {
        if (this.underCoverCount > 0) {
          this.underCoverCount -= 1;
          this.remainingVilains -= 1;
        }
      }
    
      addMrWhite() {
        if (this.underCoverCount + this.mrWhiteCount < this.clientToPlayer.size) {
          this.mrWhiteCount += 1;
          this.remainingVilains += 1;
        }
      }
    
      removeMrWhite() {
        if (this.mrWhiteCount > 0) {
          this.mrWhiteCount -= 1;
          this.remainingVilains -= 1;
        }
      }
    
      getPlayerToWords() {
        return this.playerToWords;
      }
    
      clearWords() {
        this.playerToWords = new Map();
      }
    
      start() {
        this.renewWord();
        this.votedOutPlayers = [];
        this.status = Status.PLAYING;
        this.originalPlayerNumber = this.clientToPlayer.size;
        this.remainingVilains = this.underCoverCount + this.mrWhiteCount;
        this.remainingCivilians = this.originalPlayerNumber - this.remainingVilains;
      }
      getTurn() {
        return this.turn;
      }
      getPlayerAt(turn){
        return this.playersOrder[turn % this.playersOrder.length];
      }
      addWord(word, clientId){
        const player = this.clientToPlayer.get(clientId);
        const playerTurn = this.getPlayerAt(this.turn) === player;
        if(this.status !== Status.VOTING && playerTurn && word){
            this.playerToWords.get(this.getPlayerAt(this.turn)).push(word);
            this.turn += 1;
            if(this.turn !== 0 && this.turn% this.originalPlayerNumber === 0){
                this.resetCurrentVote();
                this.status = Status.VOTING;
            }
            this.skipVotedOutPlayers();
        }
      }
      getWord(clientId){
        const player = this.clientToPlayer.get(clientId);
        return this.playerToAssignedWord.get(player);
      }
      setPlayersOrder() {
        let temp = utils.shuffleArray(this.getPlayers());
        while(this.playerToRole.get(temp[0]) === Roles.Mr_White){
            temp = utils.shuffleArray(this.getPlayers());
        }
        this.playersOrder = temp;
      }
      assignWords(){
        const [first, second] = utils.getWordPair();
        this.civWord =  first.toLowerCase();
        this.UCWord = second.toLowerCase();
        this.playerToRole.forEach((role, player) => {
            if(role === Roles.Mr_White){
                this.playerToAssignedWord.set(player, '');
            }else if(role === Roles.UnderCover){
                this.playerToAssignedWord.set(player, second);
            }else{
                this.playerToAssignedWord.set(player, first);
            }
        });
      }
      initPlayerToWords(){
        this.playersOrder.forEach((player) => {
            this.playerToWords.set(player, []);
        });
      }

      distributeRoles(){
        let ucCount = this.underCoverCount;
        let whiteCount = this.mrWhiteCount;
        const players = this.getPlayers();
        const roleDist = []
        while(ucCount > 0){
            ucCount -= 1;
            roleDist.push(Roles.UnderCover);
        }
        while(whiteCount > 0){
            whiteCount -= 1;
            roleDist.push(Roles.Mr_White);
        }
        while(roleDist.length < players.length){
            roleDist.push(Roles.Civilian);
        }
        const shuffledRoles = utils.shuffleArray(roleDist);
        players.forEach((player, index) => {
            this.playerToRole.set(player, shuffledRoles[index]);
        });
      }

      skipVotedOutPlayers(){
        while(this.votedOutPlayers.indexOf(this.getPlayerAt(this.turn)) !== -1){
            this.turn += 1;
            if(this.turn !== 0  &&  this.turn%this.originalPlayerNumber === 0){
                this.resetCurrentVote();
                this.status = Status.VOTING;
            }
        }
      }
      renewWord(){
        this.distributeRoles();
        this.setPlayersOrder();
        this.assignWords();
        this.initPlayerToWords();
        this.turn = 0;
      }
      resetState(){
        this.turn = 0;
        this.underCoverCount = 0;
        this.mrWhiteCount = 0;
        this.originalPlayerNumber = 0;
        this.remainingVilains = 0;
        this.currentPlayersVote = new Map();
        this.votedOutPlayers = [];
        this.status = Status.LOBBY;
      }
}

module.exports = {
    Roles,
    Status,
    GameState
};