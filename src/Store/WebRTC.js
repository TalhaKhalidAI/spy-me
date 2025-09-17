// src/store/peerSlice.js
import { createSlice } from "@reduxjs/toolkit";

// Non-serializable: store outside Redux
let peerConnection = null;

const peerSlice = createSlice({
  name: "peer",
  initialState: {
    connected: false,
    remoteId: null,
    connectionState: "new", // new | connecting | connected | disconnected | failed | closed
  },
  reducers: {
     
   
    setConnected: (state, action) => {
      state.connected = action.payload;
    },
    setConnectionState: (state, action) => {
      state.connectionState = action.payload;
      state.connected = action.payload === "connected";
    },
 
  },
});

export const {
  initPeer,
  setRemoteId,
  setConnected,
  setConnectionState,
  closePeer,
} = peerSlice.actions;

  

export default peerSlice.reducer;
