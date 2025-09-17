/**
 * Attach local audio/video to a WebRTC peer
 * @param {RTCPeerConnection | WebRTCManager} peerOrManager - PeerConnection or WebRTCManager instance
 * @param {Object} constraints - Media constraints (default: audio only)
 * @returns {Promise<MediaStream>} The acquired local stream
 */
export async function addLocalMedia(peerOrManager, constraints = { audio: true, video: false }) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    // Extract RTCPeerConnection if WebRTCManager is passed
    let peerConnection;
    if (peerOrManager instanceof RTCPeerConnection) {
      peerConnection = peerOrManager;
    } else if (peerOrManager?.peer instanceof RTCPeerConnection) {
      peerConnection = peerOrManager.peer;
    } else {
      throw new Error("Invalid peer or WebRTCManager instance provided");
    }

    // Add tracks to peer
    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));

    console.log("✅ Local media added to peer");

    // Optional: store stream reference on manager for cleanup
    if (peerOrManager instanceof Object) peerOrManager._localStream = stream;

    return stream;
  } catch (err) {
    console.error("❌ Failed to get local media:", err);
    throw err;
  }
}

/**
 * Cleanup local media tracks from a WebRTCManager or RTCPeerConnection
 */
export function cleanupLocalMedia(peerOrManager) {
  const stream = peerOrManager?._localStream;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    console.log("🧹 Local media tracks stopped");
  }
}
