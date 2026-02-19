import React from "react";

export type UnitType = "archer" | "knight";

interface UnitSelectorProps {
  selected: UnitType;
  onSelect: (type: UnitType) => void;
}

const units: { type: UnitType; label: string; icon: string; cost: number }[] = [
  { type: "archer", label: "Archer", icon: "/assets/Arrow.png", cost: 50 },
  { type: "knight", label: "Knight", icon: "/assets/Icon_Sword.png", cost: 80 },
];

const UnitSelector: React.FC<UnitSelectorProps> = ({ selected, onSelect }) => {
  return (
    <div className="flex gap-2 items-center">
      <span
        className="text-xs font-bold uppercase tracking-widest mr-1"
        style={{ color: "hsl(40 30% 60%)", fontFamily: "Cinzel, serif" }}
      >
        Unit
      </span>
      {units.map((u) => {
        const isActive = selected === u.type;
        return (
          <button
            key={u.type}
            onClick={() => onSelect(u.type)}
            className="relative transition-all duration-100 select-none"
            style={{
              border: "none",
              background: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <div
              className="flex flex-col items-center justify-center px-3 py-1.5 rounded"
              style={{
                background: isActive
                  ? "linear-gradient(180deg, hsl(40 50% 35%) 0%, hsl(35 40% 22%) 100%)"
                  : "linear-gradient(180deg, hsl(30 15% 22%) 0%, hsl(25 12% 15%) 100%)",
                border: isActive
                  ? "2px solid hsl(45 60% 50%)"
                  : "2px solid hsl(30 15% 28%)",
                boxShadow: isActive
                  ? "0 0 8px hsla(45, 60%, 50%, 0.4), inset 0 1px 0 hsla(45,80%,70%,0.2)"
                  : "inset 0 1px 0 hsla(0,0%,100%,0.05)",
                transform: isActive ? "scale(1.08)" : "scale(1)",
                transition: "all 0.1s",
              }}
            >
              <img
                src={u.icon}
                alt={u.label}
                className="w-6 h-6"
                style={{ imageRendering: "pixelated" }}
                draggable={false}
              />
              <span
                className="text-[10px] font-bold mt-0.5"
                style={{
                  color: isActive ? "hsl(45 60% 80%)" : "hsl(30 10% 55%)",
                  textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                  fontFamily: "Cinzel, serif",
                }}
              >
                {u.label}
              </span>
              <span
                className="flex items-center gap-0.5 text-[9px] mt-0.5"
                style={{ color: "hsl(45 70% 60%)" }}
              >
                <img src="/assets/Icon_Gold.png" alt="gold" className="w-3 h-3" style={{ imageRendering: "pixelated" }} />
                {u.cost}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default UnitSelector;
