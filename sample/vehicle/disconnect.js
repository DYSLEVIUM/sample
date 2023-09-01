const axios = require("axios");
const { decodeTokenLocal } = require("./token");
const { front_token, rear_token, left_token, right_token, idcs_token } = require("./constants");

const liveKitBaseUrl = process.argv[3];
const room = process.argv[2];
console.log("room",room)
if (liveKitBaseUrl.startsWith("wss://")) {
  liveKitBaseUrl = liveKitBaseUrl.replace("wss://", "https://");
}
if (liveKitBaseUrl.startsWith("ws://")) {
  liveKitBaseUrl = liveKitBaseUrl.replace("ws://", "http://");
}
console.log("livekit base", liveKitBaseUrl)

const listParticipantsUrl = `${liveKitBaseUrl}/twirp/ecprt.RoomService/ListParticipants`;
console.log("List part url", listParticipantsUrl)
//console.log("idcstoken",idcs_token)
console.log("Going into list part");
axios.post(listParticipantsUrl, {
  room: room,
}, {
  headers: {
    Authorization: "Bearer " + `${idcs_token}`,
  },
})
  .then(async (response) => {
    console.log("Response received",response.data);
    const participants = response.data.participants;

    for (const participant of participants) {
      console.log("Checking participant:", participant.identity);
      if (
        participant.identity.includes(decodeTokenLocal(front_token)) ||
        participant.identity.includes(decodeTokenLocal(rear_token)) ||
        participant.identity.includes(decodeTokenLocal(left_token)) ||
        participant.identity.includes(decodeTokenLocal(right_token))
      ) {
        console.log("Removing participant:", participant.identity);
        const removeParticipantUrl = `${liveKitBaseUrl}/twirp/ecprt.RoomService/RemoveParticipant`;
        const removeParticipantData = {
          room: room,
          identity: participant.identity,
        };

        try {
          console.log("Removing participant with identity:", participant.identity);
          await axios.post(removeParticipantUrl, removeParticipantData, {
            headers: {
              Authorization: `Bearer ${idcs_token}`,
            },
          });
          console.log("Participant removed:", participant.identity);
        } catch (error) {
          console.error(error);
          console.log(error.response.status);
        }
      }
    }
  })
  .catch((error) => {
    console.error(error);
    console.log(error.response.status);
  });
