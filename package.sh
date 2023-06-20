#!/bin/bash

source_dir="dist"

# Create a temporary directory to store the tar file
temp_dir=$(mktemp -d)

# remove all the other files except file with *.map from dist folder
find "$source_dir" -type f ! -name "*.map" -exec rm -rf {} \;

# Tar the entire directory structure
tar -czf ecprt-livekit-client-sdk-js-${VERSION}.tar.gz "$source_dir"

