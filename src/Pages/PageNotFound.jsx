import React from "react";

const PageNotFound = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="bg-base-300 bg-opacity-20 border border-green-500 rounded-xl shadow-lg max-w-md w-full p-8 text-center relative overflow-hidden">
        {/* Glitchy 404 */}
        <h1 className="text-8xl sm:text-9xl font-extrabold text-green-400 font-mono glitch relative" data-text="404">
          404
        </h1>

        <h2 className="text-3xl sm:text-4xl text-green-500 font-mono mt-4 mb-6 uppercase tracking-widest">
          ACCESS DENIED
        </h2>

        <p className="text-green-400 font-mono text-lg sm:text-xl mb-8">
          The target you seek is unreachable.<br />Mission aborted.
        </p>

        <button
          onClick={() => (window.location.href = "/")}
          className="btn btn-outline btn-success text-green-500 border-green-500 hover:bg-green-500 hover:text-black transition duration-300 font-mono px-8 py-3 rounded-lg"
        >
          RETRY MISSION
        </button>
      </div>

      {/* Glitch CSS */}
      <style>{`
        .glitch {
          position: relative;
          color: #22c55e;
        }
        .glitch::before,
        .glitch::after {
          content: attr(data-text);
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          overflow: hidden;
          color: #22c55e;
          clip: rect(0, 9999px, 0, 0);
          animation: glitch-anim 2s infinite linear alternate-reverse;
        }
        .glitch::before {
          left: 2px;
          text-shadow: -2px 0 #16a34a;
          animation-delay: -0.3s;
        }
        .glitch::after {
          left: -2px;
          text-shadow: 2px 0 #4ade80;
          animation-delay: -0.8s;
        }
        @keyframes glitch-anim {
          0% {
            clip: rect(0, 9999px, 0, 0);
          }
          5% {
            clip: rect(0, 9999px, 30px, 0);
          }
          10% {
            clip: rect(0, 9999px, 0, 0);
          }
          15% {
            clip: rect(30px, 9999px, 60px, 0);
          }
          20% {
            clip: rect(0, 9999px, 0, 0);
          }
          25% {
            clip: rect(60px, 9999px, 90px, 0);
          }
          30% {
            clip: rect(0, 9999px, 0, 0);
          }
          100% {
            clip: rect(0, 9999px, 0, 0);
          }
        }
      `}</style>
    </div>
  );
};

export default PageNotFound;
