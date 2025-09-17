// Utility to validate an SDP string
export function isValidSDP(sdp) {
  if (typeof sdp !== "string") return false;
  return sdp.startsWith("v=0") && sdp.includes("m=");
}

// Utility to validate ICE candidates array
export function isValidICE(ice) {
  if (!Array.isArray(ice)) return false;

  return ice.every(c => {
    const candStr = typeof c === "string" ? c : c?.candidate;
    return (
      typeof candStr === "string" &&
      candStr.startsWith("candidate:") &&
      candStr.includes(" typ ")
    );
  });
}
