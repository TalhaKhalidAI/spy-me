/*
-----------------------Imports start-----------------------
*/

import React, { useEffect, useRef, useState, useMemo } from "react";
import { IoIosAddCircle } from "react-icons/io";
import RtcSettingsModal from "../Components/RtcSettingsModal";
import {
  getClients,
  deleteClient,
  registerSDP,
  heartbeat,
  updateSDP,
  updateAnswer,
} from "../Helper/Requests";
import CustModal from "../Components/CustModal";
import ActionModal from "../Components/ActionModal";
import { toast } from "react-toastify";
import TestPortal from "../Components/TestPortal";
import WebRTCManager from "../Helper/WebRTCManager";
import { TbDatabaseMinus } from "react-icons/tb";
import { notifyUser } from "../Helper/WindowsNotification";
import ClientTable from "../Components/ClientTable";
import AudioModal from "../Components/AudioModal";

/*
----------------Imports end----------------
*/
const AdminPanel = () => {
  /*
----------------State manager start----------------
*/
  const [clients, setClients] = useState([]);
  let rtcSettingsModalToggler = useRef(false);
  const [refresh, setRefresh] = useState(false);
  let [showDelModal, setShowDelModal] = useState(false);
  let [selectedUserId, setSelectUserId] = useState("");
  let [selectedUserData, setSelectedUserData] = useState({});
  let [showViewDataModal, setShowViewModal] = useState(false);
  let peerRef = useRef({});
  let [localIceCand, setLocalIceCand] = useState({});
  let [updatingUsers, setUpdatingUsers] = useState({});
  let [userSDP, setUserSDP] = useState({});
  let [peerStatus, setPeerStatus] = useState({});
  const prevStatusRef = useRef({});
  let [amo, Samo] = useState(false);
  /*
----------------State manager End----------------
*/

  //----------------Business logic start----------------

  //----------------Peer Handler start----------------

  const createPeerForUser = (userId) => {
    if (peerRef.current[userId]) {
      // if old peer exists, clean it first
      console.log(`Cleaning old peer for ${userId}...`);
      peerRef.current[userId].close();
      peerRef.current[userId].destroy?.();
    }

    const newPeer = new WebRTCManager();
    newPeer.createPeer(true);
    peerRef.current[userId] = newPeer;
    notifyUser(
      "Request for peer creation",
      `Qrquest for peer creation for user ${userId}`,
      "/server.png"
    );
  };

  const deletePeerForUser = (id) => {
    if (peerRef.current[id]) {
      try {
        peerRef.current[id].close();
        peerRef.current[id].destroy?.();
        delete peerRef.current[id]; // remove reference
        console.log("Deleted peer object for", id);
        toast.success(`Peer for ${id} destroyed successfully.`);
        notifyUser(
          "Destroy peer sucess",
          `USER ${id} peer destroyed`,
          "/server.png"
        );
        refresh_client();
        return true;
      } catch (err) {
        console.error(`Failed to destroy peer for ${id}:`, err);
        toast.error(`Failed to destroy peer for ${id}`);

        return false;
      }
    } else {
      console.warn(`Peer does not exist for ${id}`);
      toast.error(`Peer does not exist for ${id}`);
      return false;
    }
  };
  const showPeerForUser = () => {
    try {
      const peers = peerRef.current;
      const ids = Object.keys(peers);

      if (ids.length === 0) {
        console.log("No peers currently exist.");
        return;
      }

      console.log("Current peers:");
      ids.forEach((id) => {
        console.log(`User ID: ${id}`, peers[id]);
      });
    } catch (err) {
      console.error("Error showing peers due to", err);
    }
  };

  let showStatusForPeer = (id) => {
    const peer = peerRef.current[id];
    if (!peer) {
      toast.error(`User ${id} → No peer found`);
      return null;
    }

    try {
      return peer.getStatus();
    } catch (err) {
      toast.error(`User ${id} → Error getting status: ${err}`);
      return null;
    }
  };
  const showStatusOfPeerAll = async () => {
    const peers = peerRef.current;
    const ids = Object.keys(peers);

    if (ids.length === 0) return;

    const newStatus = {};

    for (const uid of ids) {
      if (peers[uid] && typeof peers[uid].getStatus === "function") {
        const status = peers[uid].getStatus();
        const peerState = status?.peerConnectionState || "disconnected";

        newStatus[uid] = status;

        // Compare with previous state
        const prevState = prevStatusRef.current[uid]?.peerConnectionState;

        if (peerState !== prevState) {
          // 🔥 Only send heartbeat if state changed
          try {
            if (uid) {
              refresh_client()
              await heartbeat({
                client_id: uid,
                status: peerState,
              });
            }
            console.log(`Heartbeat sent for ${uid}: ${peerState}`);
          } catch (err) {
            console.error(`Failed heartbeat for ${uid}:`, err);
          }
        }
      }
    }

    // Update both React state (for UI) and prev ref
    setPeerStatus(newStatus);
    prevStatusRef.current = newStatus;
  };
  //----------------Peer Handler End----------------
  let clean_api_data = async () => {
    try {
      // ✅ Always fetch fresh list
      let clientList = await getClients();
      let promises = clientList.client_ids.map((cid) => getClients(cid));
      let clientsData = await Promise.all(promises);

      for (const v of clientsData) {
        let id = Object.keys(v)[0];
        let client = v[id];

        if (
          (client.sdp && client.ice.length > 0) ||
          (client.answer_sdp && client.answer_ice.length > 0)
        ) {
          try {
            let rnd = await updateSDP({
              client_id: id,
              sdp: "",
              ice: [],
            }).catch((reason) =>
              toast.error(`Error nullify data for ${id} due to\n\n${reason}`)
            );
            let uans = await updateAnswer({
              client_id: id,
              answer_sdp: "",
              ice: [],
            }).catch((reason) => {
              toast.error(`Error update answer due to ${reason}`);
            });
            if (peerRef.current[id]) {
              deletePeerForUser(id);
            }
            if (uans?.status === 200) {
              console.log("answer update sucess");
            }
            if (rnd?.status === 200) {
              let hb = await heartbeat({
                client_id: id,
                status: "disconnected",
              });

              if (hb?.status === 200) {
                console.log("Heartbeat update success for", id);
              } else {
                console.error(
                  "Fail to update heartbeat for",
                  id,
                  hb?.data?.details
                );
              }
              notifyUser(
                "Clean Peer singal data from db",
                `user ${id} signal data clean`,
                "/server.png"
              );
              toast.success(`Cleared signal data for client ${id}`);
            }
          } catch (err) {
            toast.error(`Error cleaning client ${id} due to ${err}`);
          }

          console.log("✅ Complete client: Null all data from API", id, client);
        } else {
          // toast.warn("No signal data left to delete")
          console.log("⚠️ Incomplete client:", id, client);
        }
      }
    } catch (err) {
      toast.error(`Cleanup fail due to \n\n${err}`);
    }
  };

  let fetch_clients = async () => {
    //fetch clients from api and show them on table
    let clientList = await getClients(); // { client_ids: [...] }

    let promises = clientList.client_ids.map((cid) => getClients(cid)); // now hits ?id=cid
    let temp = await Promise.all(promises); // [{ id1: {...} }, { id2: {...} }]

    setClients(temp);
  };

  let refresh_client = () => {
    
    setRefresh((prev) => !prev);
  };

useEffect(() => {
  fetch_clients();
}, [refresh,selectedUserData[selectedUserId]?.answer_sdp]);

  
  //----------------Handle delete users function logic----------------
  let select_delete_users = (id) => {
    if (!id) {
      toast.warn("ID missing!!");
      return;
    }

    setSelectUserId(id);
    setShowDelModal(true);
  };
  //----------------end----------------

  //----------------actual delete logic----------------

  let delete_user = async () => {
    try {
      if (peerRef.current[selectedUserId]) {
        console.log(
          "delete peer for ",
          selectedUserId,
          peerRef.current[selectedUserId]
        );
      }
      let dr = await deleteClient(selectedUserId);
      notifyUser(
        `Deleted user ${selectedUserId} sucessful`,
        `USER ${selectedUserId} peer deleted`,
        "/server.png"
      );
      if (dr.status === 200) {
        toast.success(`Deleted user "${selectedUserId}" successfully`);

        refresh_client();
      }
    } catch (err) {
      toast.error(`Error deleting user ${selectedUserId} due to \n\n ${err}`);
    } finally {
      refresh_client();
      setShowDelModal(false);
      setSelectUserId("");
    }
  };

  //----------------actual delete logic end----------------

  //----------------Init WEBRTC start----------------

  // cleanup all peers on unmount
  useEffect(() => {
    return () => {
      Object.keys(peerRef.current).forEach((uid) => {
        console.log(`Disconnecting peer for ${uid}...`);
        peerRef.current[uid].close();
        peerRef.current[uid].destroy?.();
      });
      peerRef.current = {}; // clear reference
      console.log("All peers cleaned up!");
    };
  }, []);

  // ------------INIT webrtc END----------------

  // ------------Update Logic start----------------

  let update_data = async () => {
    setSelectedUserData(prev => {
  if (!prev[selectedUserId]) return prev;
  const { error, ...rest } = prev[selectedUserId]; // remove only error
  return { ...prev, [selectedUserId]: rest };
});
    if (!peerRef.current[selectedUserId]) {
      createPeerForUser(selectedUserId);
      showPeerForUser();
    }

    setUpdatingUsers((prev) => ({ ...prev, [selectedUserId]: true }));
    try {
      console.log(
        "updating user wiht active peer:::",
        peerRef.current[selectedUserId]
      );

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false   });
      const offer = await peerRef.current[selectedUserId].createOffer([],stream);
      const iceCandidates = peerRef.current[selectedUserId].iceCandidates;

      if (offer && iceCandidates.length > 0) {
        setLocalIceCand((prev) => ({
          ...prev,
          [selectedUserId]: iceCandidates,
        }));
        setUserSDP((prev) => ({ ...prev, [selectedUserId]: offer.sdp }));
        if (selectedUserId) {
          try {
            let rnd = await updateSDP({
              client_id: selectedUserId,
              sdp: offer.sdp,
              ice: iceCandidates,
            }).catch((reason) =>
              toast.error(`Error add data to db due to\n\n${reason}`)
            );
            if (rnd?.status === 200) {
              if (selectedUserId) {
                let hb = await heartbeat({
                  client_id: selectedUserId,
                  status: peerStatus[selectedUserId]?.peerConnectionState,
                });
                if (hb.status === 200) {
                  console.log("Heart beat update sucess");
                } else {
                  console.error(
                    "Fail to update heartbeat due to ",
                    hb.data.details
                  );
                }
              }
              
              toast.success("Update signal data to db");
            }
          } catch (err) {
            toast.error(`Error add signal data to api due to ${err}`);
          } finally {
            refresh_client();
          }
        }
      }
    } catch (err) {
      toast.error(`Error update due to ${err}`);
    } finally {
      setUpdatingUsers((prev) => ({ ...prev, [selectedUserId]: false }));
    }
  };
  useEffect(() => {
    clean_api_data();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      showStatusOfPeerAll();
    }, 3000);

    return () => clearInterval(interval); // cleanup on unmount
  }, []);

  let handle_answer = async (id, details) => {
    refresh_client();

    if (peerRef.current[id]) {
      try {
        // 1. Set the remote answer SDP
        await peerRef.current[id].setRemoteDescription({
          type: "answer",
          sdp: details.answer_sdp,
        });

        // 2. Add ICE candidates (if any)
        if (details.answer_ice) {
          for (const ice of details.answer_ice) {
            try {
              await peerRef.current[id].addIceCandidate(ice);
            } catch (err) {
              setSelectedUserData((prev)=>({...prev,[id]:{"error":err}}))
              console.error("Failed to add ICE candidate", err);
            }
          }
        }
     
        console.log("Answer successfully applied for", id);
      } catch (err) {
         setSelectedUserData((prev)=>({...prev,[id]:{"error":err}}))
        console.error("Error handling answer:", err);
      }finally{
        refresh_client()
      }
    } else {
      toast.error(`Can't call peer, not available for user ${id}`);
    }
  };

  let hangup_call = (ids) => {
    if (peerRef.current[ids]) {
      console.log("hangup call for:::", ids);
      if (peerStatus[ids].peerConnectionState === "connected") {
        deletePeerForUser(ids);
        refresh_client();
      }
      toast.success(`Call hangup for ${ids}`);
    } else {
      toast.error("Cant hangup call for this peer not exist");
    }
  };
  // ------------Update Logic End----------------

  //----------------Business logic End----------------

  //----------------Main Code Start----------------
  return (
    <>
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Client Management</h2>
          <div className="flex flex-cols-2 gap-2">
            <button
              className="btn btn-circle btn-primary"
              title="Add Client"
              onClick={() => {
                rtcSettingsModalToggler.current.showModal();
              }}
            >
              <IoIosAddCircle size={28} />
            </button>

            <button
              disabled={updatingUsers[selectedUserId]}
              className="btn btn-circle btn-primary"
              title="Remove all Signal data from database"
              onClick={() => {
                clean_api_data();
              }}
            >
              <TbDatabaseMinus size={28} />
            </button>
          </div>
        </div>

        <ClientTable
          Ccid={setSelectUserId}
          audio_modal={Samo}
          hangup_call={(id) => {
            hangup_call(id);
          }}
          all_status={peerStatus}
          clients={clients}
          peerRef={peerRef}
          updatingUsers={updatingUsers}
          Scd={selectedUserData}
          onView={async (id) => {
            setSelectUserId(id);
            try {
              const latestClient = await getClients(id);
              const latestDetails = latestClient[id];
              setSelectedUserData({ [id]: latestDetails });
              setShowViewModal(true);
            } catch (err) {
              toast.error(`Failed to load client data: ${err}`);
            }
          }}
          onDeletePeer={(id) => deletePeerForUser(id)}
          onSelectDeleteUser={(id, details) => {
            select_delete_users(id);
            setSelectedUserData((prev) => ({ ...prev, [id]: details }));
          }}
          onUpdate={async (id) => {
            setSelectUserId(id);
            await update_data();
          }}
          onCall={(id, details) => {
            setSelectedUserData(details);
            handle_answer(id, details);
            // handle_answer(id)
          }}
        />
      </div>
      <ActionModal
        onConfirm={() => {
          delete_user();
        }}
        showModal={showDelModal}
        onClose={() => {
          setShowDelModal(false);
          setSelectUserId("");
        }}
        message={"Are you sure you want to delete this user"}
        title={`Delete user ${selectedUserId}`}
      />
      <RtcSettingsModal
        dialogRef={rtcSettingsModalToggler}
        rfrsh={refresh_client}
      />
      <TestPortal
        key={refresh}
        showModal={showViewDataModal}
        data={selectedUserData[selectedUserId]}
        onClose={() => {
          setShowViewModal(false);
          setSelectedUserData({});
        }}
      />

      <AudioModal
        hangup_call={() => {
          hangup_call(selectedUserId);
        }}
        peer={peerRef.current[selectedUserId]}
        isOpen={amo}
        onClose={() => {
          setSelectUserId("")
          Samo(false);
        }}
      />
    </>
  );
};
//-----------------------Main Code End---------------------
export default AdminPanel;
