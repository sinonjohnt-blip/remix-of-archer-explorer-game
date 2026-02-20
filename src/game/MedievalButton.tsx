import React, { useState } from "react";

interface MedievalButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant: "blue" | "red";
  className?: string;
  icon?: string;
  /** Override button size in px; defaults to 80 (square) */
  size?: number;
}

const MedievalButton: React.FC<MedievalButtonProps> = ({
  onClick, children, variant, className = "", icon, size = 80,
}) => {
  const [pressed, setPressed] = useState(false);

  const regular    = variant === "blue"
    ? "/assets/SmallBlueSquareButton_Regular.png"
    : "/assets/SmallRedSquareButton_Regular.png";
  const pressedImg = variant === "blue"
    ? "/assets/SmallBlueSquareButton_Pressed.png"
    : "/assets/SmallRedSquareButton_Pressed.png";

  const labelColor = variant === "blue"
    ? "hsl(200 80% 95%)"
    : "hsl(0 80% 96%)";

  const glowColor = variant === "blue"
    ? "0 0 12px hsla(200,80%,60%,0.5)"
    : "0 0 12px hsla(0,70%,55%,0.5)";

  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className={`relative font-bold select-none flex-shrink-0 ${className}`}
      style={{
        border: "none",
        background: "none",
        padding: 0,
        cursor: "pointer",
        width: size,
        height: size,
        transform: pressed ? "scale(0.93)" : "scale(1)",
        transition: "transform 0.07s ease, filter 0.12s ease",
        filter: pressed ? "brightness(0.82)" : `drop-shadow(${glowColor})`,
        fontFamily: "Cinzel, serif",
      }}
    >
      {/* Sprite — rendered at exact button size, no stretching/chopping */}
      <img
        src={pressed ? pressedImg : regular}
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          imageRendering: "pixelated",
          objectFit: "fill",
          pointerEvents: "none",
          display: "block",
        }}
      />

      {/* Label + icon stacked vertically inside the square */}
      <span
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          gap: 4,
          color: labelColor,
          textShadow: "0 1px 4px rgba(0,0,0,0.9)",
          fontSize: 10,
          letterSpacing: "0.04em",
          transform: pressed ? "translateY(2px)" : "none",
          transition: "transform 0.07s ease",
        }}
      >
        {icon && (
          <img
            src={icon}
            alt=""
            style={{
              width: 22,
              height: 22,
              imageRendering: "pixelated",
              flexShrink: 0,
            }}
            draggable={false}
          />
        )}
        {children}
      </span>
    </button>
  );
};

export default MedievalButton;

