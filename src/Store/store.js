// src/store/store.js
import { configureStore } from "@reduxjs/toolkit";
import peerReducer from "./WebRTC";

export const store = configureStore({
  reducer: {
    peer: peerReducer
  }
});
