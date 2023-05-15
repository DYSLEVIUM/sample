#npm install
npm install 

helpFunction()
{
   echo "Usage: $0 -r room -d devkey -s apisecret"
   echo -e "\t-r Which room to connect"
   echo -e "\t-r Livekit host ip "
   echo -e "\t-d Livit Server Devkey"
   echo -e "\t-s LivekitServer API Secret Key"
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
browserify index.js -t envify > bundle.js

pkill -f pm2

#live-server-start
pm2 start liveserver.js

while true; do
while true; do
    read -p "Do you wish to disconnect from the room(Y/N)? " yn
    case $yn in
        [Yy]* )pm2 stop liveserver.js; break;;
        [Nn]* ) exit ;;
        * ) echo "Please answer yes or no.";;
    esac
done
while true; do
    read -p "Do you wish to re-connect to the room(Y/N)? " yn
    case $yn in
        [Yy]*) pm2 start liveserver.js; break;;
        [Nn]* ) exit;;
        * ) echo "Please answer yes or no.";;

    esac
done
done


 
