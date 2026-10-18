#!/usr/bin/env bash
# Builds ../sudoku.apk without Gradle: aapt2 → javac → d8 → zipalign → apksigner.
# Needs ANDROID_HOME with platforms;android-34 and build-tools;35.0.0, and the signing key:
#   SUDOKU_KEYSTORE=/path/sudoku.jks SUDOKU_KEYPASS=… ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
SDK=${ANDROID_HOME:-/opt/android}
BT=$SDK/build-tools/35.0.0
JAR=$SDK/platforms/android-34/android.jar
: "${SUDOKU_KEYSTORE:?set SUDOKU_KEYSTORE}" "${SUDOKU_KEYPASS:?set SUDOKU_KEYPASS}"
OUT=build; rm -rf $OUT; mkdir -p $OUT/res $OUT/classes $OUT/dex
"$BT/aapt2" compile --dir res -o $OUT/res.zip
"$BT/aapt2" link -o $OUT/base.apk -I "$JAR" --manifest AndroidManifest.xml $OUT/res.zip --min-sdk-version 24 --target-sdk-version 34
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$JAR" -classpath "$BT/core-lambda-stubs.jar" -d $OUT/classes $(find src -name '*.java')
"$BT/d8" --release --min-api 24 --lib "$JAR" --output $OUT/dex $(find $OUT/classes -name '*.class')
cp $OUT/base.apk $OUT/unaligned.apk
(cd $OUT/dex && zip -q -9 ../unaligned.apk classes.dex)
"$BT/zipalign" -f -p 4 $OUT/unaligned.apk $OUT/aligned.apk
"$BT/apksigner" sign --ks "$SUDOKU_KEYSTORE" --ks-pass env:SUDOKU_KEYPASS --out ../sudoku.apk $OUT/aligned.apk
"$BT/apksigner" verify ../sudoku.apk
rm -f ../sudoku.apk.idsig
ls -l ../sudoku.apk
