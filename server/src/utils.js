const {readFileSync} = require('fs');
const join = require('path');



const shuffleArray = (array) => {
    const shuffled = [...array];
    for(let i = shuffled.length - 1; i > 0; i--){
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled
};

const randomInt = (min , max) =>{
    return Math.floor(Math.random() * (max - min) + min);
}

const getWordPair = () => {
    let wordPairs = [];
    const data = readFileSync(join('res','words.json')).toString();
    wordPairs = JSON.parse(data).words;
    return wordPairs[randomInt(0, wordPairs.length)];
}

const utils = {
    shuffleArray,
    randomInt,
    getWordPair
}

module.exports = utils;