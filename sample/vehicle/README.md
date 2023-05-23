
#Local Steps
brew install node/ yum install nodejs(install node on machine)
go inside the working directory
npm install
npm install -g browserify envify pm2
bash run.sh -r room_name -h livekit_server_host -d devkey -s secret

Note: Running the script for the first time can take some time. From 2nd time all node modules will be already present and app will start up much faster.