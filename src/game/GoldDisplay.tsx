import React from "react";

interface GoldDisplayProps {
  gold: number;
}

const GoldDisplay: React.FC<GoldDisplayProps> = ({ gold }) => {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1.5 rounded"
      style={{
        background: "linear-gradient(180deg, hsl(40 30% 25%) 0%, hsl(35 25% 16%) 100%)",
        border: "2px solid hsl(45 40% 35%)",
        boxShadow: "inset 0 1px 0 hsla(45,60%,60%,0.15)",
      }}
    >
      <img
        src="/assets/Icon_Gold.png"
        alt="Gold"
        className="w-5 h-5"
        style={{ imageRendering: "pixelated" }}
        draggable={false}
      />
      <span
        className="text-sm font-bold tabular-nums"
        style={{
          color: "hsl(45 80% 65%)",
          textShadow: "0 1px 2px rgba(0,0,0,0.6)",
          fontFamily: "Cinzel, serif",
          minWidth: 32,
          textAlign: "right",
        }}
      >
        {gold}
      </span>
    </div>
  );
};

export default GoldDisplay;
