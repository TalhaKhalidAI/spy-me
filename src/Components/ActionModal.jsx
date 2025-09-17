import React from "react";

const ActionModal = ({ showModal, onClose, onConfirm, title, message }) => {
    let CloseModal=()=>{
        
    }
  return (
    <div className={`modal ${showModal ? "modal-open" : ""}`}>
      <div className="modal-box relative max-w-sm text-center">
        <h3 className="font-bold text-lg mb-3">
          {title || "Are you sure?"}
        </h3>

        <p className="mb-5">
          {message || "Do you really want to perform this action?"}
        </p>

        <div className="flex justify-center gap-3">
          <button
            onClick={() => {
              onConfirm?.();
  
            }}
            className="btn btn-sm btn-primary"
          >
            Yes
          </button>
          <button
            onClick={() => {
              onClose?.();
            }}
            className="btn btn-sm btn-secondary"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionModal;
