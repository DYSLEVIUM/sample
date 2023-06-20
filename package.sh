#!/bin/bash

source_dir="ecprt-livekit-client-sdk-js/dist"

# remove all the other files except file with *.map from dist folder
find dist/ -type f ! -name "*.map" -exec rm -rf {} \;

# Tar the entire directory structure and package.json LICENSE README.md files
tar -czf ecprt-livekit-client-sdk-js-${VERSION}.tar.gz dist/ package.json LICENSE README.md

