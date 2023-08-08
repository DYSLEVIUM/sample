
var livekit = require("ecprt-client-sdk");
const jwt = require('jsonwebtoken');
const { liveKitBaseUrl,front_token,rear_token,left_token,right_token } = require("./constants");

async function getVehicleMediaStreams() {
  let devices = await livekit.Room.getLocalDevices('videoinput');
  console.log("Un Filtered devices are:")
  console.log(devices)
  console.log("Add filtered devices:")
  
  var tokenSet = [];
  if (!front_token.startsWith("DEFAULT")) tokenSet.push(front_token);
  if (!rear_token.startsWith("DEFAULT")) tokenSet.push(rear_token);
  if (!left_token.startsWith("DEFAULT")) tokenSet.push(left_token);
  if (!right_token.startsWith("DEFAULT")) tokenSet.push(right_token);
  var i=0;
  var tok=0;
  for (const device of devices) {
   if (device.kind.includes("videoinput") && !((device.label.includes("Integrated Webcam"))||(device.label.includes("FaceTime")))) {

     console.log(device.label);   
     console.log("token set",tokenSet)
    vehicleMediaStreams[i].device = device;
    
    let participantName = await decodeToken(tokenSet[tok])
    vehicleMediaStreams[i].participantName = participantName
    console.log(participantName)
    vehicleMediaStreams[i].token = tokenSet[i]
    i++;
    tok++;
    }
  }   

  return vehicleMediaStreams;
}
async function decodeToken(token) {
  console.log("received token",token)
try {
  const decodedToken = jwt.decode(token, { complete: true });
  console.log(decodedToken)
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



async function main() {
  // get connected video devices
  let deviceMediaStreams = await getVehicleMediaStreams();


  console.log("getVehicleMediaStreams")
  console.log(deviceMediaStreams)
  // loop through the devices and create new joining instances to livekit server if they don't exist already
  for (const stream of deviceMediaStreams) {
    if(stream.token != null) {
      let hasExistingConnection = false

      // check to see if there are current remote participants
      for (const room of liveRooms) {
        let participant = room.getParticipantByIdentity(stream.participantName)
        if(participant !== undefined) {
          // connection exists
          hasExistingConnection = true
        }
      }

      // create new connection if one does not exist
      if(!hasExistingConnection) {
        // create a new joining room instance
        let room = new livekit.Room({
          // auto manage subscribed video quality
          adaptiveStream: true,
          // optimize publishing bandwidth/CPU for published tracks
          dynacast: true,
          // default capture settings
          videoCaptureDefaults: {
            resolution: livekit.VideoPresets.h720.resolution,
          }
        })
    
        await room.connect(liveKitBaseUrl, stream.token)
        await room.localParticipant.setCameraEnabled(true)
        await room.switchActiveDevice('videoinput', stream.device.deviceId)
        console.log("Device id"+stream.device.deviceId+"Device"+stream.device.label)
        liveRooms.push(room)
      }
    }
  }
}

let authToken = "";
let incidentNumber = "";
let unitNumber = "";
let unitCallSign = "";
let unitAgencyId = "";
let deviceId = "";
let liveRooms = []
let metadata = {"user": "", "callSign": "", "status": "", "deviceType": "", "incidentId": ""};
let vehicleMediaStreams = [
  {
    "position": "null",
    "token": null,
    "device": null,
    "participantName": null,
  },
  {
    "position": "null",
    "token": null,
    "device": null,
    "participantName": null,
  },
  {
    "position": "null",
    "token": null,
    "device": null,
    "participantName": null,
  },
  {
    "position": "null",
    "token": null,
    "device": null,
    "participantName": null,
  }
];
main()
console.info("Ready");