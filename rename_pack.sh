#!/bin/bash

build_version=${?BLD_BRANCH_SUFFIX}.${BLD_NUMBER}

mv ecprt-client-sdk-0.0.1.tgz ecprt-client-sdk-0.0.1-${build_version}.tgz
