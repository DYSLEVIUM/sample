const {RoomServiceClient}=require("livekit-server-sdk");
//const { liveKitBaseUrl, devkey, apiSecret, room } = require("./constants");
//require('dotenv').config()

var room =process.argv[2]
var liveKitBaseUrl=process.argv[3]
var devkey=process.argv[4]
var secret=process.argv[5]

 
 
 if (liveKitBaseUrl.startsWith("wss://")) {
  liveKitBaseUrl = liveKitBaseUrl.replace("wss://", "https://"); // or "http://" if appropriate
}
if (liveKitBaseUrl.startsWith("ws://")) {
  liveKitBaseUrl = liveKitBaseUrl.replace("ws://", "http://"); // or "http://" if appropriate
}
 
const svc = new RoomServiceClient(liveKitBaseUrl, devkey, secret);
 
 //DeleteVehicleCamParticipants
 
 svc.listParticipants(room)
  .then(async (participants) => {

    
    for(var i in participants)
    {
        if(participants[i].identity=='-FRONT'||participants[i].identity=='-REAR'||
        participants[i].identity=='-RIGHT'||participants[i].identity=='-LEFT')
         {
      
            await svc.removeParticipant(room, participants[i].identity).then(() => {
      
        }).catch((error) => {
        console.error(error);
      });
    }
   }

  })




  
