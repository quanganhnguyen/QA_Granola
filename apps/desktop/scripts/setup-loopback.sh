#!/bin/bash
# Creates a macOS Multi-Output Device that sends audio to both the default speakers
# and BlackHole 2ch, so the user hears audio AND the app can capture it.
#
# Usage: ./setup-loopback.sh
# Returns JSON: {"available":true,"deviceName":"QA Nola Loopback"} or {"available":false,"error":"..."}

set -euo pipefail

# Check if BlackHole is installed by looking for the audio device
if ! system_profiler SPAudioDataType 2>/dev/null | grep -qi "BlackHole"; then
  echo '{"available":false,"error":"BlackHole 2ch is not installed. Install with: brew install blackhole-2ch (then reboot)"}'
  exit 0
fi

# The aggregate/multi-output device is created via Audio MIDI Setup or programmatically.
# We use a small Swift snippet compiled on the fly to create it via CoreAudio HAL API.
# This is the same approach used by professional audio apps.

HELPER="/tmp/qa-nola-create-aggregate"

# Compile the helper if it doesn't exist or is outdated
if [ ! -f "$HELPER" ] || [ "$(stat -f %m "$HELPER" 2>/dev/null || echo 0)" -lt "$(date -v-1d +%s 2>/dev/null || echo 999999999)" ]; then
cat > /tmp/qa-nola-create-aggregate.swift << 'SWIFT'
import CoreAudio
import Foundation

func getDeviceUID(name: String) -> String? {
    var propSize: UInt32 = 0
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDevices,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &propSize)
    let count = Int(propSize) / MemoryLayout<AudioDeviceID>.size
    var devices = [AudioDeviceID](repeating: 0, count: count)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &propSize, &devices)

    for dev in devices {
        var nameAddr = AudioObjectPropertyAddress(
            mSelector: kAudioObjectPropertyName,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var cfName: CFString = "" as CFString
        var nameSize = UInt32(MemoryLayout<CFString>.size)
        AudioObjectGetPropertyData(dev, &nameAddr, 0, nil, &nameSize, &cfName)
        if (cfName as String).lowercased().contains(name.lowercased()) {
            var uidAddr = AudioObjectPropertyAddress(
                mSelector: kAudioDevicePropertyDeviceUID,
                mScope: kAudioObjectPropertyScopeGlobal,
                mElement: kAudioObjectPropertyElementMain
            )
            var uid: CFString = "" as CFString
            var uidSize = UInt32(MemoryLayout<CFString>.size)
            AudioObjectGetPropertyData(dev, &uidAddr, 0, nil, &uidSize, &uid)
            return uid as String
        }
    }
    return nil
}

func getDefaultOutputUID() -> String? {
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var deviceID: AudioDeviceID = 0
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &deviceID)

    var uidAddr = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceUID,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    var uid: CFString = "" as CFString
    var uidSize = UInt32(MemoryLayout<CFString>.size)
    AudioObjectGetPropertyData(deviceID, &uidAddr, 0, nil, &uidSize, &uid)
    return uid as String
}

guard let blackholeUID = getDeviceUID(name: "BlackHole") else {
    print("{\"available\":false,\"error\":\"BlackHole device not found in audio devices\"}")
    exit(0)
}

guard let speakerUID = getDefaultOutputUID() else {
    print("{\"available\":false,\"error\":\"Could not find default output device\"}")
    exit(0)
}

// Check if aggregate device already exists
if let _ = getDeviceUID(name: "QA Nola Loopback") {
    print("{\"available\":true,\"deviceName\":\"QA Nola Loopback\",\"blackholeUID\":\"\(blackholeUID)\"}")
    exit(0)
}

// Create aggregate device
let desc: [String: Any] = [
    kAudioAggregateDeviceNameKey as String: "QA Nola Loopback",
    kAudioAggregateDeviceUIDKey as String: "com.qa.nola.loopback",
    kAudioAggregateDeviceIsStackedKey as String: 0,
    kAudioAggregateDeviceSubDeviceListKey as String: [
        [kAudioSubDeviceUIDKey as String: speakerUID],
        [kAudioSubDeviceUIDKey as String: blackholeUID],
    ],
    kAudioAggregateDeviceMasterSubDeviceKey as String: speakerUID,
]

var aggregateID: AudioDeviceID = 0
let status = AudioHardwareCreateAggregateDevice(desc as CFDictionary, &aggregateID)
if status != noErr {
    print("{\"available\":false,\"error\":\"Failed to create aggregate device (error \(status))\"}")
    exit(0)
}

print("{\"available\":true,\"deviceName\":\"QA Nola Loopback\",\"blackholeUID\":\"\(blackholeUID)\"}")
SWIFT

  swiftc -o "$HELPER" /tmp/qa-nola-create-aggregate.swift -framework CoreAudio -framework Foundation 2>/dev/null
fi

# Run the helper
"$HELPER"
