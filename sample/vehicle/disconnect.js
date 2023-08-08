const {RoomServiceClient}=require("livekit-server-sdk");
const { decodeToken } = require("./token");
const { front_token, rear_token, left_token, right_token } = require("./constants");


var room =process.argv[2]
var liveKitBaseUrl=process.argv[3]

 
 if (liveKitBaseUrl.startsWith("wss://")) {
  liveKitBaseUrl = liveKitBaseUrl.replace("wss://", "https://"); // or "http://" if appropriate
}
if (liveKitBaseUrl.startsWith("ws://")) {
  liveKitBaseUrl = liveKitBaseUrl.replace("ws://", "http://"); // or "http://" if appropriate
}
 
const svc = new RoomServiceClient(liveKitBaseUrl,"devkey", "secret");
 
 //DeleteVehicleCamParticipants
 
 svc.listParticipants(room)
  .then(async (participants) => {

    
    for(var i in participants)
    {
        if(participants[i].identity.includes(decodeToken(front_token))||participants[i].identity.includes(decodeToken(rear_token))||
        participants[i].identity.includes(decodeToken(left_token))||participants[i].identity.includes(decodeToken(right_token)))
         {
      
            await svc.removeParticipant(room, participants[i].identity).then(() => {
      
        }).catch((error) => {
        console.error(error);
      });
    }
   }

  })




  
