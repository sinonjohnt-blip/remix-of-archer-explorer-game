import React from "react";
import type { UnitType } from "./types";

export type { UnitType };

interface UnitSelectorProps {
  selected: UnitType;
  onSelect: (type: UnitType) => void;
}

const DISPLAY_SIZE = 36;

const units: { type: UnitType; label: string; sprite: string; cost: number; frames: number; frameSize: number; iconScale?: number }[] = [
  { type: "archer",  label: "Archer",  sprite: "/assets/Archer_Idle.png",  cost: 50,  frames: 6,  frameSize: 192 },
  { type: "warrior", label: "Warrior", sprite: "/assets/Warrior_Idle.png", cost: 80,  frames: 8,  frameSize: 192 },
  { type: "lancer",  label: "Lancer",  sprite: "/assets/Lancer_Idle.png",  cost: 100, frames: 12, frameSize: 160, iconScale: 3.0 },
  { type: "monk",    label: "Monk",    sprite: "/assets/Monk_Idle.png",    cost: 60,  frames: 6,  frameSize: 192 },
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
        const scale = u.iconScale ?? 1;
        const frameDisplaySize = DISPLAY_SIZE * scale;
        const scaledTotalW = u.frames * frameDisplaySize;
        const scaledTotalH = frameDisplaySize;
        // Offset to center the scaled sprite within the DISPLAY_SIZE box
        const offsetX = (DISPLAY_SIZE - frameDisplaySize) / 2;
        const offsetY = (DISPLAY_SIZE - frameDisplaySize) / 2;
        return (
          <button
            key={u.type}
            onClick={() => onSelect(u.type)}
            className="relative transition-all duration-100 select-none"
            style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}
          >
            <div
              className="flex flex-col items-center justify-center px-2 py-1.5 rounded"
              style={{
                background: isActive
                  ? "linear-gradient(180deg, hsl(40 50% 35%) 0%, hsl(35 40% 22%) 100%)"
                  : "linear-gradient(180deg, hsl(30 15% 22%) 0%, hsl(25 12% 15%) 100%)",
                border: isActive
                  ? "2px solid hsl(45 60% 50%)"
                  : "2px solid hsl(30 15% 28%)",
                boxShadow: isActive
                  ? "0 0 8px hsla(45,60%,50%,0.4), inset 0 1px 0 hsla(45,80%,70%,0.2)"
                  : "inset 0 1px 0 hsla(0,0%,100%,0.05)",
                transform: isActive ? "scale(1.08)" : "scale(1)",
                transition: "all 0.1s",
              }}
            >
              {/* Miniature unit sprite — first frame via background-image */}
              <div
                style={{
                  width: DISPLAY_SIZE,
                  height: DISPLAY_SIZE,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: offsetX,
                    top: offsetY,
                    width: frameDisplaySize,
                    height: frameDisplaySize,
                    backgroundImage: `url(${u.sprite})`,
                    backgroundSize: `${scaledTotalW}px ${scaledTotalH}px`,
                    backgroundPosition: "0 0",
                    backgroundRepeat: "no-repeat",
                    imageRendering: "pixelated",
                  }}
                />
              </div>
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
