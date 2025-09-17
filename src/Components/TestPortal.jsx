import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { IoMdCloseCircleOutline } from "react-icons/io";

const TestPortal = ({ showModal, onClose, data }) => {
  const portalRoot = document.getElementById("modal-root");
  if (!portalRoot) return null;

  const [offerSDP, setOfferSDP] = useState("");
  const [answerSDP, setAnswerSDP] = useState("");
  const [offerICE, setOfferICE] = useState([]);
  const [answerICE, setAnswerICE] = useState([]);

  useEffect(() => {
    if (data) {
      setOfferSDP(data.sdp || "");
      setAnswerSDP(data.answer_sdp || "");
      setOfferICE(data.ice || []);
      setAnswerICE(data.answer_ice || []);
    }
  }, [data]);

  const renderIceList = (iceArray) => {
    if (!iceArray || iceArray.length === 0) {
      return <p className="text-gray-400 italic">No ICE candidates</p>;
    }
    return (
      <pre className="bg-gray-100 p-2 rounded overflow-x-auto text-sm max-h-32">
        {iceArray
          .map((ice, idx) => `${idx + 1}. ${JSON.stringify(ice, null, 2)}`)
          .join("\n\n")}
      </pre>
    );
  };

  return createPortal(
    <div className={`modal ${showModal ? "modal-open" : ""}`}>
      <div className="modal-box relative max-w-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-red-500"
          aria-label="Close"
        >
          <IoMdCloseCircleOutline size={28} />
        </button>

        <h3 className="font-bold text-lg mb-4">View Client SDP & ICE</h3>

        {/* Offer Section */}
        <div className="mb-6">
          <label className="font-semibold mb-1 block">Offer SDP:</label>
          <textarea
            className="w-full h-32 p-2 border rounded resize-none text-sm"
            value={offerSDP}
            readOnly
          />
          <label className="font-semibold mt-2 block">
            Offer ICE Candidates:
          </label>
          {renderIceList(offerICE)}
        </div>

        {/* Answer Section */}
        <div>
          <label className="font-semibold mb-1 block">Answer SDP:</label>
          <textarea
            className="w-full h-32 p-2 border rounded resize-none text-sm"
            value={answerSDP}
            readOnly
          />
          <label className="font-semibold mt-2 block">
            Answer ICE Candidates:
          </label>
          {renderIceList(answerICE)}
        </div>
      </div>
    </div>,
    portalRoot
  );
};

export default TestPortal;
