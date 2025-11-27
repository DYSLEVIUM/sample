const jwt = require('jsonwebtoken');

function decodeTokenLocal(token) {
    if(token.startsWith("DEFAULT"))
    return false;
    console.log("received token",token)
  try {
    const decodedToken = jwt.decode(token, { complete: true });
    console.log(decodedToken)
    if (!decodedToken) {
      throw new Error('Invalid token format');
    }
  
    const { payload } = decodedToken;
  
    if (payload.sub && payload.name) {
      return payload.sub
    
    } else if (payload.sub) {
      return payload.sub ;
    } else {
      throw new Error('Invalid token format');
    }
  } catch (error) {
    throw new Error('Error decoding token: ' + error.message);
  }
  }

module.exports.decodeTokenLocal=decodeTokenLocal

