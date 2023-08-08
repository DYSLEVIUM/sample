const jwt = require('jsonwebtoken');

function decodeToken(token) {
  try {
    const decodedToken = jwt.decode(token, { complete: true });

    if (!decodedToken) {
      throw new Error('Invalid token format');
    }

    const { payload } = decodedToken;

    if (payload.sub && payload.name) {
      return payload.name
    
    } else if (payload.sub) {
      return payload.sub ;
    } else {
      throw new Error('Invalid token format');
    }
  } catch (error) {
    throw new Error('Error decoding token: ' + error.message);
  }
}
module.exports.decodeToken=decodeToken

