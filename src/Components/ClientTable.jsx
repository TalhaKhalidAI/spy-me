// Components/ClientTable.jsx
import React, { useState, useMemo } from "react";
import { FaRegEye } from "react-icons/fa";
import { MdDownload, MdHearing } from "react-icons/md";
import { AiFillDelete } from "react-icons/ai";
import { RxSpeakerLoud, RxUpdate } from "react-icons/rx";
import { IoIosCall } from "react-icons/io";
import { ImPhoneHangUp } from "react-icons/im";
import { FaSort, FaSortUp, FaSortDown } from "react-icons/fa"; // sort icons
import { FaVideo } from "react-icons/fa";
const ClientTable = ({
  clients,
  peerRef,
  updatingUsers,
  onView,
  onDeletePeer,
  onSelectDeleteUser,
  onUpdate,
  onCall,
  all_status,
  hangup_call,
  audio_modal,
  Ccid,
  Scd
}) => {
  const [sortConfig, setSortConfig] = useState({ key: "id", direction: "asc" });
  const [filter, setFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(5);

  const sortedFilteredClients = useMemo(() => {
    let processed = [...clients];

    // Filter
    if (filter) {
      processed = processed.filter((client) =>
        Object.keys(client)[0].toLowerCase().includes(filter.toLowerCase())
      );
    }

    // Sort
    if (sortConfig.key) {
      processed.sort((a, b) => {
        const idA = Object.keys(a)[0];
        const idB = Object.keys(b)[0];

        let valA, valB;
        if (sortConfig.key === "id") {
          valA = idA;
          valB = idB;
        } else {
          valA = a[idA][sortConfig.key];
          valB = b[idB][sortConfig.key];
        }

        if (valA < valB) return sortConfig.direction === "asc" ? -1 : 1;
        if (valA > valB) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    return processed;
  }, [clients, filter, sortConfig]);

  // Pagination
  const totalPages = Math.ceil(sortedFilteredClients.length / rowsPerPage);
  const paginatedClients = sortedFilteredClients.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  const requestSort = (key) => {
    setSortConfig((prev) => {
      if (prev.key === key && prev.direction === "asc") {
        return { key, direction: "desc" };
      }
      return { key, direction: "asc" };
    });
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key)
      return <FaSort className="inline ml-1 opacity-40" />;
    return sortConfig.direction === "asc" ? (
      <FaSortUp className="inline ml-1 text-blue-500" />
    ) : (
      <FaSortDown className="inline ml-1 text-blue-500" />
    );
  };

  // Smart pagination range
  const getPageNumbers = () => {
    let pages = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else if (currentPage <= 3) {
      pages = [1, 2, 3, 4, "...", totalPages];
    } else if (currentPage >= totalPages - 2) {
      pages = [
        1,
        "...",
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ];
    } else {
      pages = [
        1,
        "...",
        currentPage - 1,
        currentPage,
        currentPage + 1,
        "...",
        totalPages,
      ];
    }
    return pages;
  };
 
  return (
    <div className="p-4 bg-white rounded-xl shadow-lg">
      {/* Top Controls */}
      <div className="mb-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <input
          type="text"
          placeholder="🔍 Search by ID..."
          className="input input-bordered input-sm w-full md:w-1/3 focus:ring focus:ring-blue-300"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Rows:</label>
          <select
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="select select-bordered select-sm"
          >
            {[5, 10, 20, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="table table-zebra w-full min-w-[500px]">
          <thead className="bg-gray-100 text-gray-700">
            <tr>
              <th onClick={() => requestSort("id")} className="cursor-pointer">
                ID {getSortIcon("id")}
              </th>
              <th
                onClick={() => requestSort("status")}
                className="cursor-pointer"
              >
                Status {getSortIcon("status")}
              </th>
              <th
                onClick={() => requestSort("last_heartbeat")}
                className="cursor-pointer"
              >
                Last Heartbeat {getSortIcon("last_heartbeat")}
              </th>
              <th className="text-center">Actions</th>
            </tr>
          </thead>

          <tbody>
            {paginatedClients.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-6 text-gray-500">
                  No clients found.
                </td>
              </tr>
            ) : (
              paginatedClients.map((client, idx) => {
                const id = Object.keys(client)[0];
                const details = client[id];

                return (
                  <tr
                    key={idx}
                    className="hover:bg-gray-50 transition-colors duration-150"
                  >
                    <td className="font-mono text-sm">{id}</td>
                    <td>
                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <span
                            className={`badge px-3 py-2 ${
                              details.status === "connected"
                                ? "badge-success"
                                : "badge-warning"
                            }`}
                          >
                            {details.status}
                          </span>
                        </div>
                        <div>{all_status[id]?.videoActive && <FaVideo />}</div>
                        <div>
                          {all_status[id]?.audioActive && <RxSpeakerLoud />}
                        </div>
                      </div>
                    </td>
                    <td className="text-sm text-gray-600">
                      {new Date(details.last_heartbeat * 1000).toLocaleString()}
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          className="btn btn-circle btn-xs btn-info tooltip"
                          data-tip="View"
                          onClick={() => onView(id)}
                        >
                          <FaRegEye size={14} />
                        </button>
                        <button
                          disabled={updatingUsers[id]}
                          className={`btn btn-circle btn-xs ${
                            peerRef.current[id] ? "btn-primary" : "btn-error"
                          } tooltip`}
                          data-tip={
                            peerRef.current[id] ? "Download Peer" : "Delete"
                          }
                          onClick={() =>
                            peerRef.current[id]
                              ? onDeletePeer(id)
                              : onSelectDeleteUser(id, details)
                          }
                        >
                          {peerRef.current[id] ? (
                            <MdDownload size={14} />
                          ) : (
                            <AiFillDelete size={14} />
                          )}
                        </button>
                        <button
                          disabled={updatingUsers[id]}
                          className="btn btn-circle btn-xs btn-primary tooltip"
                          data-tip="Update SDP"
                          onClick={() => onUpdate(id)}
                        >
                          <RxUpdate size={14} />
                        </button>
                        <button
                          disabled={
                            Scd[id]?.error ||
                            !peerRef.current[id] ||
                            updatingUsers[id] ||
                            (!details?.sdp && !(details?.ice?.length > 0)) ||
                            (!details?.answer_sdp &&
                              !(details?.answer_ice?.length > 0))
                          }
                          className={`btn btn-circle btn-xs ${
                            all_status[id]?.peerConnectionState === "connected"
                              ? "btn-error"
                              : " btn-success"
                          } tooltip`}
                          data-tip="Call Client"
                          onClick={() => {
                            if (
                              all_status[id]?.peerConnectionState ===
                              "connected"
                            ) {
                              hangup_call(id);
                            } else {
                              onCall(id, details);
                            }
                          }}
                        >
                          <div>
                            {all_status[id]?.peerConnectionState ===
                            "connected" ? (
                              <ImPhoneHangUp size={14} />
                            ) : (
                              <IoIosCall size={14} />
                            )}
                          </div>
                        </button>

                        <button
                          onClick={()=>{
                            audio_modal(true)
                            Ccid(id)
                          }}
                          className="btn btn-primary btn-circle btn-xs"
                          disabled={
                            all_status[id]?.peerConnectionState !==
                              "connected" ||
                            !peerRef.current[id] ||
                            updatingUsers[id] ||
                            (!details?.sdp && !(details?.ice?.length > 0)) ||
                            (!details?.answer_sdp &&
                              !(details?.answer_ice?.length > 0))
                          }
                        >
                          <MdHearing size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-3 mt-5">
        <span className="text-sm text-gray-500">
          Page {currentPage} of {totalPages}
        </span>

        <div className="join">
          <button
            className="join-item btn btn-sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
          >
            Prev
          </button>

          {getPageNumbers().map((page, idx) =>
            page === "..." ? (
              <button key={idx} className="join-item btn btn-sm btn-disabled">
                ...
              </button>
            ) : (
              <button
                key={idx}
                className={`join-item btn btn-sm ${
                  currentPage === page ? "btn-active btn-primary" : ""
                }`}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            )
          )}

          <button
            className="join-item btn btn-sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientTable;
