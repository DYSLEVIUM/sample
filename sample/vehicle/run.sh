
helpFunction()
{
   echo "Usage: $0 -r room -h host -d devkey -s apisecret"
   echo -e "\t-r room to connect"
   echo -e "\t-r livekit server host ip "
   echo -e "\t-d livit server devkey"
   echo -e "\t-s livekit server apisecret key"
}

while getopts "r:h:d:s:" opt
do
   case "$opt" in
      r ) room="$OPTARG" ;;
      h ) livekithost="$OPTARG" ;;
      d ) devkey="$OPTARG" ;;
      s ) secret="$OPTARG" ;;
      ? ) helpFunction ;; # Print helpFunction in case parameter is non-existent
   esac
done

# Print helpFunction in case parameters are empty
if [ -z "$room" ]|| [ -z "$livekithost" ] || [ -z "$devkey" ] || [ -z "$secret" ]
then
   echo "Some or all of the parameters are empty";
   helpFunction
fi

export room 
export livekithost
export devkey
export secret 

#browserify
npm run browserify

npm run clean

#vehicle-server-start
npm run vehicle


while true; do
    read -e -p "
  Press d to disconnect from the room
  Press r to re-join the room
  Press q to quit
  " yn
    case $yn in
        [Dd]* )node disconnect.js $room $livekithost $devkey $secret;npm run stop;;
        [Qq]* )exit ;;
        [Rr]* )node disconnect.js $room $livekithost $devkey $secret;npm run stop;npm run vehicle;;
        * ) echo "Please press correct key";;
    esac
done


 
