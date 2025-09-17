export default class WebRTCManager {
  constructor(config = {}) {
    this._lastRemoteStream = null;
    this.config = config.iceServers
      ? config
      :null

    this.peer = null;
    this.dataChannel = null;
    this.eventHandlers = {};
    this.iceCandidates = [];
    this.dcs = false;
  }

  on(event, handler) {
    this.eventHandlers[event] = handler;
  }

  emit(event, ...args) {
    if (typeof this.eventHandlers[event] === "function") {
      this.eventHandlers[event](...args);
    }
  }

  setRemoteStreamCallback(callback) {
    this.on("track", callback);
  }

  getRemoteStream() {
    return this._lastRemoteStream;
  }

  createPeer(ac = false) {
    if (this.peer) return; // already created
    this.peer = new RTCPeerConnection(this.config);

    this.peer.onicecandidate = (e) => {
      if (e.candidate) this.iceCandidates.push(e.candidate);
      this.emit("ice-candidate", e.candidate);
    };

  this.peer.ontrack = (e) => {
  this._lastRemoteStream = e.streams[0];
  this.emit("track", e.streams[0]);
};

    this.peer.ondatachannel = (e) => {
      this.dataChannel = e.channel;
      this._setupDataChannel(true);
    };

    this.peer.onconnectionstatechange = () => {
      this.emit("connection-state", this.peer.connectionState);
      if (
        this.peer.connectionState === "disconnected" ||
        this.peer.connectionState === "failed"
      ) {
        this.emit("disconnected");
      }
    };

    if (ac) this.createDataChannel("hbt");

    this.emit("peer-created", this.peer);
  }

  createDataChannel(label = "data") {
    if (!this.peer) throw new Error("Peer not created yet.");
    this.dataChannel = this.peer.createDataChannel(label);
    this._setupDataChannel(false);
    return this.dataChannel;
  }

  _setupDataChannel(isReceiver) {
    if (!this.dataChannel) return;
    this.dataChannel.onopen = () => {
      this.dcs = true;
      this.emit("data-open", isReceiver);
    };
    this.dataChannel.onclose = () => {
      this.dcs = false;
      this.emit("data-close", isReceiver);
    };
    this.dataChannel.onerror = (err) =>
      this.emit("data-error", err, isReceiver);
    this.dataChannel.onmessage = (e) =>
      this.emit("data-message", e.data, isReceiver);
  }

addStream(stream) {
  if (!this.peer) throw new Error("Peer not created yet.");
  this.stream = stream; // save it
  stream.getTracks().forEach((track) => this.peer.addTrack(track, stream));
}

  async createOffer(ice_data = [],stream=false) {
    this.createPeer(true);
    if(stream){
      this.addStream(stream)
    }
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);

    // add remote ICE candidates if provided
    for (const ice of ice_data) {
      if (ice?.candidate && ice.sdpMid != null && ice.sdpMLineIndex != null) {
        await this.peer.addIceCandidate(new RTCIceCandidate(ice));
      }
    }

    await this.waitForIceGatheringComplete(); // NEW: wait for all ICE candidates
    return offer;
  }

  async createAnswer(remoteOffer, ice_data = [],stream=false) {
    this.createPeer();
    await this.peer.setRemoteDescription(
      new RTCSessionDescription(remoteOffer)
    );
    if(stream){
      this.addStream(stream)
    }

    for (const ice of ice_data) {
      if (ice?.candidate && ice.sdpMid != null && ice.sdpMLineIndex != null) {
        await this.peer.addIceCandidate(new RTCIceCandidate(ice));
      }
    }

    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    await this.waitForIceGatheringComplete();
    return answer;
  }

  async waitForIceGatheringComplete() {
    if (!this.peer) throw new Error("Peer not created yet.");
    if (this.peer.iceGatheringState === "complete") return;
    return new Promise((resolve) => {
      const check = () => {
        if (this.peer.iceGatheringState === "complete") resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }

  async setRemoteDescription(desc) {
    await this.peer.setRemoteDescription(new RTCSessionDescription(desc));
  }

  async addIceCandidate(candidate) {
    await this.peer.addIceCandidate(new RTCIceCandidate(candidate));
  }

  send(data) {
    if (!this.dataChannel || this.dataChannel.readyState !== "open")
      throw new Error("Data channel not open");
    this.dataChannel.send(data);
  }

  getStatus() {
    if (!this.peer) {
      
      return {
        peerConnectionState: "not-created",
        iceConnectionState: "not-created",
        dataChannelState: "not-created",
        videoActive: false,
        audioActive: false,
      };
      
    }

    return {
      peerConnectionState: this.peer.connectionState || "unknown",
      iceConnectionState: this.peer.iceConnectionState || "unknown",
      dataChannelState: this.dataChannel?.readyState || "no-channel",
      videoActive:
        this.stream?.getVideoTracks().some((track) => track.enabled) || false,
      audioActive:
        this.stream?.getAudioTracks().some((track) => track.enabled) || false,
    };
  }

  close() {
    if (this.dataChannel) this.dataChannel.close();
    if (this.peer) this.peer.close();
    this.peer = null;
    this.dataChannel = null;
    this.emit("closed");
  }
  destroy() {
    if (this.peer) {
      this.peer.close();
      this.peer = null;
    }
  }
}
