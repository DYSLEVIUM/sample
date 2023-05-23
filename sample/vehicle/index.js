//const { AccessToken } = require("livekit-server-sdk");

const { AccessToken } = require("livekit-server-sdk");
var livekit = require("livekit-client");
const { devkey, apiSecret,liveKitBaseUrl,room } = require("./constants");
async function getVehicleMediaStreams() {
  let devices = await livekit.Room.getLocalDevices('videoinput');
  //let filteredDevices= await filter()
  
    
  for (const device of devices) {
    if (device.kind.includes("videoinput") && !((device.label.includes("Integrated Camera")) || (device.label.includes("Integrated Webcam")|| (device.label.includes("FaceTime"))))) {
    const i = devices.indexOf(device);
    vehicleMediaStreams[i].device = device;
    let participantName = `${unitCallSign}-${vehicleMediaStreams[i].position}`;
    vehicleMediaStreams[i].participantName = participantName
    vehicleMediaStreams[i].token = await getMediaToken(room, participantName);
    }
  }   

  return vehicleMediaStreams;
}

function filter() {

  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    // Enumerate the available media devices
    navigator.mediaDevices.enumerateDevices()
      .then(function(devices) {
        // Filter out the front camera
        var filteredDevices = devices.filter(function(device) {
          return device.kind !== 'videoinput' || device.label.toLowerCase().indexOf('front') === -1;
        });
  
        // Use the filtered devices for further processing
        console.log(filteredDevices);
      })
      .catch(function(err) {
        console.error('Error enumerating media devices:', err);
      });
  } else {
    console.error('navigator.mediaDevices.enumerateDevices is not supported');
  }
}

async function getMediaToken(roomName, participantName) {
  try {
    const at = new AccessToken(devkey, apiSecret, {
    identity: participantName,
    ttl: '24h' // setting it for 24h by default
});
at.addGrant({ roomJoin: true, room: roomName,  canPublish: true ,canSubscribe: false }); 


const token = at.toJwt();
console.log('access token', token);
return token;
   
  } catch (e) {
    let errorMessage = `Failed get Media Token: ${e}`
    console.error(errorMessage);
  }
}



async function main() {
  // get connected video devices
  let deviceMediaStreams = await getVehicleMediaStreams();
   console.log("Hi")
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

        // connect to room
        await room.connect(liveKitBaseUrl, stream.token)
        await room.localParticipant.setCameraEnabled(true)
        await room.switchActiveDevice('videoinput', stream.device.deviceId)
        liveRooms.push(room)
      }
    }
  }
}

async function startFeeds(token, unitNum, unitName, incidentNum, agencyId, macAddress, unitStatus) {
  authToken = token;
  unitNumber = unitNum;
  unitCallSign = unitName;
  incidentNumber = incidentNum;
  unitAgencyId = agencyId;
  deviceId = macAddress;
  metadata.user = "vehicleService"
  metadata.callSign = unitCallSign
  metadata.status = unitStatus
  metadata.deviceType = "VEHICLE"
  metadata.incidentId = incidentNumber
  await main();
}

async function stopFeeds(token, unitNum, unitName, agencyId, macAddress) {
  authToken = token;
  unitNumber = unitNum;
  unitCallSign = unitName;
  incidentNumber = "";
  unitAgencyId = agencyId;
  deviceId = macAddress;
  wipeAll();
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
    "position": "FRONT",
    "token": null,
    "device": null,
    "participantName": null,
  },
  {
    "position": "RIGHT",
    "token": null,
    "device": null,
    "participantName": null,
  },
  {
    "position": "LEFT",
    "token": null,
    "device": null,
    "participantName": null,
  },
  {
    "position": "REAR",
    "token": null,
    "device": null,
    "participantName": null,
  }
];
main()
console.info("Ready");