//var livekit =require("livekit-client")
//module.exports = livekit;
module.exports.room= process.env.room
module.exports.devkey= process.env.devkey
module.exports.apiSecret= process.env.secret
module.exports.liveKitBaseUrl= `ws://`+process.env.livekithost+`:7880`;