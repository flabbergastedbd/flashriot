#!/usr/bin/env bash
#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# This is just a shell script that does some basic stuff to use
# flashbang headless wrapper script. This script simply takes care of
# starting the python simple server and then stopping them
#
# Author: Bharadwaj Machiraju
# Blog: blog.tunnelshade.in
# Twitter: @tunnelshade_

if [ $# -ne 2 ]; then
    echo "Usage: $0 <files_dir_ending_with_slash> <flashbang_root_dir_ending_with_slash>"
    exit
fi

FILES_DIR=$1
FLASHBANG_DIR=$2

WD=$(pwd)

cd $FILES_DIR;
python2 -m SimpleHTTPServer 9000 > file_server.log 2> /dev/null &
FILES_SERVER_PID=$(echo $! | cut -d ' ' -f 2)
echo '[*] File server started. PID:' $FILES_SERVER_PID
cd $WD

cd $FLASHBANG_DIR;
python2 -m SimpleHTTPServer 9001 > flashbang_server.log 2> /dev/null &
FLASHBANG_SERVER_PID=$(echo $! | cut -d ' ' -f 2)
echo '[*] Flashbang server started. PID:' $FLASHBANG_SERVER_PID
cd $WD

trap ctrl_c INT
function ctrl_c() {
    echo "[*] Trapped CTRL-C"
    kill -9 $FLASHBANG_SERVER_PID $FILES_SERVER_PID
}
sleep 15

phantomjs --local-to-remote-url-access=true --web-security=false wrapper.js $FILES_DIR http://127.0.0.1:9000/ $FLASHBANG_DIR http://127.0.0.1:9001/

kill -9 $FLASHBANG_SERVER_PID $FILES_SERVER_PID
