
# Prerequisite
Before proceeding with the installation, make sure you have downloaded the _**latest**_ version of the _**tgz**_ file of the _**develop**_ branch (e.g., ecprt-client-sdk-0.0.1-develop.9.tgz) from the following link: **[Download Link](https://artifactory-builds.oci.oraclecorp.com/cgbu_ecprt-dev-generic-local/ecprt-livekit-client-sdk-js/)**.

# Installing Dependencies
To install and set up the vehicle app, follow the steps below:


In the root directory of the vehicle app, open a terminal or command prompt and run the following commands to clean the project dependencies and build artifacts:

```shell
go inside the working directory
brew install node/ yum install nodejs(install node on machine)
npm cache clean --force 
npm install PATH_OF_DOWNLOADED_ecprt-client-sdk ( Note: It can take a while to install all dependencies )
npm install -g browserify envify pm2
bash run.sh -r room_name -h livekit_server_host -d devkey -s secret

