#!/bin/bash

helpFunction() {
   echo "Usage: $0 --room <room> --livekit_url <livekit_url> --server_api_url <server_api_url> [--front_token <front_token>] [--rear_token <rear_token>] [--left_token <left_token>] [--right_token <right_token>]"
   echo -e "\t--room: Room to connect"
   echo -e "\t--livekit_url: Livekit server URL"
   echo -e "\t--server_api_url: Server API URL"
   echo -e "\t--front_token: Front token"
   echo -e "\t--rear_token: Rear token"
   echo -e "\t--left_token: Left token"
   echo -e "\t--right_token: Right token"
}

room=""
livekit_url=""
server_api_url=""
front_token=""
rear_token=""
left_token=""
right_token=""

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --room) room="$2"; shift ;;
        --livekit_url) livekit_url="$2"; shift ;;
        --server_api_url) server_api_url="$2"; shift ;;
        --front_token) front_token="$2"; shift ;;
        --rear_token) rear_token="$2"; shift ;;
        --left_token) left_token="$2"; shift ;;
        --right_token) right_token="$2"; shift ;;
        -h|--help) helpFunction; exit 0 ;;
        *) echo "Unknown parameter: $1"; helpFunction; exit 1 ;;
    esac
    shift
done

# Print helpFunction in case required parameters are empty
if [ -z "$room" ] || [ -z "$livekit_url" ] || [ -z "$server_api_url" ]; then
   echo "Some or all of the required parameters are empty";
   helpFunction
   exit 1
fi

export room 
export livekit_url
export server_api_url
export front_token
export rear_token
export left_token
export right_token

# If tokens are empty, assign default values
if [ -z "$front_token" ]; then
    front_token="DEFAULT_FRONT_TOKEN"
fi

if [ -z "$rear_token" ]; then
    rear_token="DEFAULT_REAR_TOKEN"
fi

if [ -z "$left_token" ]; then
    left_token="DEFAULT_LEFT_TOKEN"
fi

if [ -z "$right_token" ]; then
    right_token="DEFAULT_RIGHT_TOKEN"
fi

# Now you can use $front_token, $rear_token, $left_token, $right_token as needed in the script.

# browserify
npm run browserify

npm run clean

# vehicle-server-start
npm run vehicle

wait

while true; do
    read -e -p "
  Press d to disconnect from the room
  Press r to re-join the room
  Press q to quit
  " yn
    case $yn in
        [Dd]* ) node disconnect.js "$room" "$server_api_url"; npm run stop;;
        [Qq]* ) exit ;;
        [Rr]* ) node disconnect.js "$room" "$server_api_url"; npm run stop; npm run vehicle;;
        * ) echo "Please press correct key";;
    esac
done
